import Database from 'better-sqlite3';
import path from 'path';
import * as XLSX from 'xlsx';

const db = new Database(path.join(__dirname, 'fleming.db'));

// Parse Excel file
const workbook = XLSX.readFile('/home/ubuntu/.openclaw/media/inbound/file_85---ab55e306-539f-4eba-b9ff-9d8360ce3bc1.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet) as any[];

console.log(`Found ${rows.length} landlords in Excel file\n`);

// Clear existing data (preserve users)
console.log('Clearing existing data...');
db.exec('PRAGMA foreign_keys = OFF');
db.exec("DELETE FROM documents");
db.exec('DELETE FROM maintenance');
db.exec('DELETE FROM rent_payments');
db.exec('DELETE FROM tenancies');
db.exec('DELETE FROM tenants');
db.exec('DELETE FROM properties');
db.exec('DELETE FROM landlords');
db.exec('DELETE FROM landlords_bdm');
db.exec('DELETE FROM tenant_enquiries');
db.exec('DELETE FROM property_viewings');
db.exec("DELETE FROM tasks");
db.exec('PRAGMA foreign_keys = ON');
console.log('Done.\n');

// Prepare statements
const insertLandlord = db.prepare(`
  INSERT INTO landlords (name, email, phone, address, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const insertProperty = db.prepare(`
  INSERT INTO properties (landlord_id, address, postcode, rent_amount, status, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Helper to clean "NOT GIVEN" values
function clean(val: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (s === 'NOT GIVEN' || s === 'UNKNOWN' || s === 'TBC' || s === 'NaN') return null;
  return s;
}

// Extract postcode from address string
function extractPostcode(address: string): { address: string; postcode: string } {
  // UK postcode pattern
  const postcodeRegex = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i;
  const match = address.match(postcodeRegex);
  
  if (match) {
    const postcode = match[1].toUpperCase();
    // Remove postcode from address
    let cleanAddress = address.replace(postcodeRegex, '').trim();
    // Clean up trailing comma
    cleanAddress = cleanAddress.replace(/,\s*$/, '').trim();
    return { address: cleanAddress, postcode };
  }
  
  return { address, postcode: 'TBC' };
}

// Track stats
let imported = 0;
let skipped = 0;
const issues: string[] = [];

// Process each row
for (const row of rows) {
  try {
    // Build landlord name
    const title = clean(row['Title']) || '';
    const firstName = clean(row['Name']) || 'Unknown';
    const surname = clean(row['Surname']) || '';
    const name = [title, firstName, surname].filter(Boolean).join(' ').trim();
    
    // Get contact info
    let email = clean(row['Email Address']);
    // Handle multiple emails - take first one
    if (email && email.includes('/')) {
      email = email.split('/')[0].trim();
    }
    
    let phone = clean(row['Contact Number']);
    // Handle multiple phones - take first one
    if (phone && phone.includes('/')) {
      phone = phone.split('/')[0].trim();
    }
    
    // Build home address
    const addr1 = clean(row['Address Line 1']);
    const addr2 = clean(row['Address Line 2']);
    const postcode = clean(row['Post Code']);
    const homeAddress = [addr1, addr2, postcode].filter(Boolean).join(', ') || null;
    
    // Get property address
    const propertyAddressRaw = clean(row['Property Address']);
    if (!propertyAddressRaw) {
      issues.push(`Skipped ${name}: No property address`);
      skipped++;
      continue;
    }
    
    // Parse property address
    const { address: propAddress, postcode: propPostcode } = extractPostcode(propertyAddressRaw);
    
    // Insert landlord
    const result = insertLandlord.run(
      name,
      email,
      phone,
      homeAddress,
      homeAddress ? null : 'Home address not provided'
    );
    const landlordId = result.lastInsertRowid;
    
    // Handle multiple properties (some have "X and Y" format)
    const propertyAddresses = propertyAddressRaw.includes(' and ') 
      ? propertyAddressRaw.split(' and ').map(a => a.trim())
      : [propertyAddressRaw];
    
    for (const propAddrRaw of propertyAddresses) {
      const { address: pAddr, postcode: pPost } = extractPostcode(propAddrRaw);
      
      insertProperty.run(
        landlordId,
        pAddr || propAddrRaw,
        pPost,
        0, // rent_amount TBC
        'available',
        'Imported - rent amount to be confirmed'
      );
    }
    
    imported++;
    
  } catch (err: any) {
    issues.push(`Error: ${err.message}`);
    skipped++;
  }
}

console.log('=== Import Complete ===');
console.log(`Imported: ${imported} landlords`);
console.log(`Skipped: ${skipped}`);

// Count properties
const propCount = db.prepare('SELECT COUNT(*) as count FROM properties').get() as any;
console.log(`Properties created: ${propCount.count}`);

if (issues.length > 0) {
  console.log('\nIssues:');
  issues.forEach(i => console.log(`  - ${i}`));
}

// Show sample
console.log('\n=== Sample Data ===');
const samples = db.prepare(`
  SELECT l.id, l.name, l.phone, l.email, p.address, p.postcode 
  FROM landlords l 
  LEFT JOIN properties p ON p.landlord_id = l.id 
  LIMIT 5
`).all();
console.table(samples);

db.close();
