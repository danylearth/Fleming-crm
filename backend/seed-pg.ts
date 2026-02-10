import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false
});

// Parse Excel file
const XLSX_PATH = process.argv[2] || '/home/ubuntu/.openclaw/media/inbound/file_85---ab55e306-539f-4eba-b9ff-9d8360ce3bc1.xlsx';

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('Creating admin user...');
    const hashedPassword = await bcrypt.hash('test123', 10);
    await client.query(`
      INSERT INTO users (email, password, name, role) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (email) DO NOTHING
    `, ['d@planet.earth', hashedPassword, 'Admin', 'admin']);
    
    console.log('Loading Excel file...');
    const workbook = XLSX.readFile(XLSX_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet) as any[];
    console.log(`Found ${rows.length} landlords\n`);
    
    // Clear existing data
    console.log('Clearing existing landlords/properties...');
    await client.query('DELETE FROM properties');
    await client.query('DELETE FROM landlords');
    
    // Helper to clean values
    const clean = (val: any): string | null => {
      if (!val) return null;
      const s = String(val).trim();
      if (s === 'NOT GIVEN' || s === 'UNKNOWN' || s === 'TBC' || s === 'NaN') return null;
      return s;
    };
    
    // Extract postcode
    const extractPostcode = (address: string) => {
      const match = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
      if (match) {
        const postcode = match[1].toUpperCase();
        const cleanAddr = address.replace(match[0], '').replace(/,\s*$/, '').trim();
        return { address: cleanAddr, postcode };
      }
      return { address, postcode: 'TBC' };
    };
    
    let imported = 0;
    
    for (const row of rows) {
      // Build landlord name
      const title = clean(row['Title']) || '';
      const firstName = clean(row['Name']) || 'Unknown';
      const surname = clean(row['Surname']) || '';
      const name = [title, firstName, surname].filter(Boolean).join(' ').trim();
      
      // Contact info
      let email = clean(row['Email Address']);
      if (email && email.includes('/')) email = email.split('/')[0].trim();
      
      let phone = clean(row['Contact Number']);
      if (phone && phone.includes('/')) phone = phone.split('/')[0].trim();
      
      // Home address
      const addr1 = clean(row['Address Line 1']);
      const addr2 = clean(row['Address Line 2']);
      const postcode = clean(row['Post Code']);
      const homeAddress = [addr1, addr2, postcode].filter(Boolean).join(', ') || null;
      
      // Property address
      const propertyAddressRaw = clean(row['Property Address']);
      if (!propertyAddressRaw) continue;
      
      // Insert landlord
      const landlordResult = await client.query(
        'INSERT INTO landlords (name, email, phone, address, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, email, phone, homeAddress, homeAddress ? null : 'Home address not provided']
      );
      const landlordId = landlordResult.rows[0].id;
      
      // Handle multiple properties
      const propertyAddresses = propertyAddressRaw.includes(' and ')
        ? propertyAddressRaw.split(' and ').map(a => a.trim())
        : [propertyAddressRaw];
      
      for (const propAddrRaw of propertyAddresses) {
        const { address: pAddr, postcode: pPost } = extractPostcode(propAddrRaw);
        await client.query(
          'INSERT INTO properties (landlord_id, address, postcode, rent_amount, status, notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [landlordId, pAddr || propAddrRaw, pPost, 0, 'available', 'Imported - rent TBC']
        );
      }
      
      imported++;
    }
    
    console.log(`\n=== Import Complete ===`);
    console.log(`Imported: ${imported} landlords`);
    
    const propCount = await client.query('SELECT COUNT(*) as count FROM properties');
    console.log(`Properties: ${propCount.rows[0].count}`);
    
    // Show sample
    const samples = await client.query(`
      SELECT l.id, l.name, l.phone, p.address, p.postcode 
      FROM landlords l 
      LEFT JOIN properties p ON p.landlord_id = l.id 
      LIMIT 5
    `);
    console.log('\nSample data:');
    console.table(samples.rows);
    
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
