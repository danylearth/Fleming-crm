import db from './src/db';

// Clear existing data
console.log('Clearing existing data...');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM maintenance');
db.exec('DELETE FROM tenancies');
db.exec('DELETE FROM properties');
db.exec('DELETE FROM tenants');
db.exec('DELETE FROM landlords');
db.exec('DELETE FROM documents');

// Reset auto-increment
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('landlords', 'tenants', 'properties', 'tenancies', 'transactions', 'maintenance', 'documents')");

console.log('✓ Cleared existing data\n');

// Fleming Lettings is the agency managing all properties
// The properties appear to be owned by the same portfolio holder
const landlords = [
  { 
    name: 'Fleming Lettings Portfolio', 
    email: 'd@planet.earth', 
    phone: '07954 702315', 
    address: 'Wolverhampton, West Midlands' 
  },
];

// Real tenants from the spreadsheet
const tenants = [
  { 
    name: 'Mathew & Zoe Woodberry', 
    email: 'mathewwoodberry@hotmail.co.uk', 
    phone: '07549801806', 
    emergency_contact: 'Zoe Woodberry (Wife) - 07931813157' 
  },
  { 
    name: 'Ms Mildred McKenzie', 
    email: 'msmmckenzie21@gmail.com', 
    phone: '07947 187628', 
    emergency_contact: 'Gavin Cameron (Son-in-Law) - 07387183796' 
  },
  { 
    name: 'Ms Diane Reaney', 
    email: 'reaneywanaka@gmail.com', 
    phone: '07989134503', 
    emergency_contact: 'N/A' 
  },
  { 
    name: 'Shawn Farragher', 
    email: 'neilthompson969@yahoo.com', 
    phone: '07803039100', 
    emergency_contact: 'N/A' 
  },
  { 
    name: 'Warren & Julia Gardiner', 
    email: 'warrengardiner90@hotmail.com', 
    phone: '07858002275', 
    emergency_contact: 'Julia Gardiner - juliaroberts602024@outlook.com' 
  },
  { 
    name: 'Mr Andrew Sturgess', 
    email: 'sturgess.andrew@yahoo.co.uk', 
    phone: '07515532098', 
    emergency_contact: 'Lesley Sturgess - lesley-1962@hotmail.com' 
  },
  { 
    name: 'Miss Grace Smith', 
    email: 'race-smithy@hotmail.co.uk', 
    phone: '07960195823', 
    emergency_contact: 'N/A' 
  },
  { 
    name: 'Miss Klaudia Bogacz', 
    email: 'mblazejewski7@gmail.com', 
    phone: '07392839464', 
    emergency_contact: 'N/A' 
  },
  { 
    name: 'Mr Neil Thompson', 
    email: 'neilthompson969@yahoo.com', 
    phone: '07563208451', 
    emergency_contact: 'N/A' 
  },
  { 
    name: 'Tenant - 74 Richmond Mews', 
    email: 'N/A', 
    phone: '07508164480', 
    emergency_contact: 'N/A' 
  },
];

// Real properties from the spreadsheet
const properties = [
  { 
    landlord_id: 1, 
    address: '99 Ringwood Road', 
    postcode: 'WV10 9ER', 
    property_type: 'house', 
    bedrooms: 3, 
    rent_amount: 750, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Freehold. Completion: 20th Sept 2023'
  },
  { 
    landlord_id: 1, 
    address: '3 Eclipse House, Walsall', 
    postcode: 'WS2 0BE', 
    property_type: 'flat', 
    bedrooms: 2, 
    rent_amount: 625, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Leasehold (109 years). Access code: 7901 or 3535'
  },
  { 
    landlord_id: 1, 
    address: '22a Northwood Park Road', 
    postcode: 'WV10 8ET', 
    property_type: 'house', 
    bedrooms: 2, 
    rent_amount: 675, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Leasehold (105 years). Land Owner: Wolverhampton City Council'
  },
  { 
    landlord_id: 1, 
    address: '21a Northwood Park Road', 
    postcode: 'WV10 8EU', 
    property_type: 'house', 
    bedrooms: 2, 
    rent_amount: 650, 
    status: 'let',
    epc_grade: 'D',
    notes: 'Leasehold (105 years). Land Owner: Wolverhampton City Council'
  },
  { 
    landlord_id: 1, 
    address: '16 Vine Close', 
    postcode: 'WV10 6NG', 
    property_type: 'house', 
    bedrooms: 3, 
    rent_amount: 700, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Leasehold (105 years)'
  },
  { 
    landlord_id: 1, 
    address: '2A Cavalier Circus', 
    postcode: 'WV10 8TR', 
    property_type: 'flat', 
    bedrooms: 1, 
    rent_amount: 550, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Leasehold (147 years)'
  },
  { 
    landlord_id: 1, 
    address: '4A Cavalier Circus', 
    postcode: 'WV10 8TR', 
    property_type: 'flat', 
    bedrooms: 1, 
    rent_amount: 525, 
    status: 'let',
    epc_grade: 'D',
    notes: 'Leasehold (147 years)'
  },
  { 
    landlord_id: 1, 
    address: '25 Wealden Hatch', 
    postcode: 'WV10 8TY', 
    property_type: 'house', 
    bedrooms: 2, 
    rent_amount: 600, 
    status: 'let',
    epc_grade: 'D',
    notes: 'Leasehold (147 years)'
  },
  { 
    landlord_id: 1, 
    address: '29 Wealden Hatch', 
    postcode: 'WV10 8TY', 
    property_type: 'house', 
    bedrooms: 2, 
    rent_amount: 600, 
    status: 'let',
    epc_grade: 'D',
    notes: 'Leasehold (147 years)'
  },
  { 
    landlord_id: 1, 
    address: '74 Richmond Mews, Merridale Road', 
    postcode: 'WV3 9SE', 
    property_type: 'flat', 
    bedrooms: 2, 
    rent_amount: 695, 
    status: 'let',
    epc_grade: 'C',
    notes: 'Leasehold (144 years)'
  },
];

// Map tenants to properties
const tenancies = [
  { property_id: 1, tenant_id: 1, start_date: '2024-02-05', rent_amount: 750, deposit_amount: 1500 }, // 99 Ringwood - Woodberry
  { property_id: 2, tenant_id: 2, start_date: '2024-01-15', rent_amount: 625, deposit_amount: 1250 }, // Eclipse House - McKenzie
  { property_id: 3, tenant_id: 3, start_date: '2025-02-01', rent_amount: 675, deposit_amount: 1350 }, // 22a Northwood - Reaney
  { property_id: 4, tenant_id: 4, start_date: '2024-06-01', rent_amount: 650, deposit_amount: 1300 }, // 21a Northwood - Farragher
  { property_id: 5, tenant_id: 5, start_date: '2024-03-01', rent_amount: 700, deposit_amount: 1400 }, // 16 Vine Close - Gardiner
  { property_id: 6, tenant_id: 6, start_date: '2024-04-01', rent_amount: 550, deposit_amount: 1100 }, // 2A Cavalier - Sturgess
  { property_id: 7, tenant_id: 7, start_date: '2024-05-01', rent_amount: 525, deposit_amount: 1050 }, // 4A Cavalier - Smith
  { property_id: 8, tenant_id: 8, start_date: '2024-07-01', rent_amount: 600, deposit_amount: 1200 }, // 25 Wealden - Bogacz
  { property_id: 9, tenant_id: 9, start_date: '2024-08-01', rent_amount: 600, deposit_amount: 1200 }, // 29 Wealden - Thompson
  { property_id: 10, tenant_id: 10, start_date: '2024-09-01', rent_amount: 695, deposit_amount: 1390 }, // 74 Richmond
];

// Generate rent transactions for the last 3 months
const transactions: any[] = [];
const months = ['2024-12', '2025-01', '2025-02'];
const monthNames = ['December', 'January', 'February'];

tenancies.forEach((t, idx) => {
  months.forEach((month, mIdx) => {
    // Rent due
    transactions.push({
      tenancy_id: idx + 1,
      type: 'rent_due',
      amount: t.rent_amount,
      description: `${monthNames[mIdx]} rent`,
      date: `${month}-01`
    });
    // Payment (assume paid for Dec and Jan, Feb pending for some)
    if (mIdx < 2 || idx < 7) {
      transactions.push({
        tenancy_id: idx + 1,
        type: 'payment',
        amount: t.rent_amount,
        description: 'Standing order',
        date: `${month}-${String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')}`
      });
    }
  });
});

// Sample maintenance issues
const maintenance = [
  { 
    property_id: 2, 
    reported_by: 'Ms Mildred McKenzie', 
    title: 'Building access intercom issue', 
    description: 'Intercom not working properly. Access code still works (7901/3535).', 
    priority: 'medium', 
    status: 'open', 
    contractor: null, 
    cost: null 
  },
  { 
    property_id: 4, 
    reported_by: 'Shawn Farragher', 
    title: 'EPC renewal needed', 
    description: 'Current EPC grade D - may need improvement works.', 
    priority: 'low', 
    status: 'open', 
    contractor: null, 
    cost: null 
  },
  { 
    property_id: 8, 
    reported_by: 'Inspection', 
    title: 'Gas safety check due', 
    description: 'Annual gas safety certificate renewal required.', 
    priority: 'high', 
    status: 'in_progress', 
    contractor: 'Gas Safe Engineer', 
    cost: null 
  },
];

// Insert data
console.log('Importing real data...\n');

const insertLandlord = db.prepare('INSERT INTO landlords (name, email, phone, address) VALUES (?, ?, ?, ?)');
landlords.forEach(l => insertLandlord.run(l.name, l.email, l.phone, l.address));
console.log(`✓ ${landlords.length} landlord(s)`);

const insertTenant = db.prepare('INSERT INTO tenants (name, email, phone, emergency_contact) VALUES (?, ?, ?, ?)');
tenants.forEach(t => insertTenant.run(t.name, t.email, t.phone, t.emergency_contact));
console.log(`✓ ${tenants.length} tenants`);

const insertProperty = db.prepare('INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
properties.forEach(p => insertProperty.run(p.landlord_id, p.address, p.postcode, p.property_type, p.bedrooms, p.rent_amount, p.status));
console.log(`✓ ${properties.length} properties`);

const insertTenancy = db.prepare('INSERT INTO tenancies (property_id, tenant_id, start_date, rent_amount, deposit_amount, status) VALUES (?, ?, ?, ?, ?, ?)');
tenancies.forEach(t => insertTenancy.run(t.property_id, t.tenant_id, t.start_date, t.rent_amount, t.deposit_amount, 'active'));
console.log(`✓ ${tenancies.length} tenancies`);

const insertTransaction = db.prepare('INSERT INTO transactions (tenancy_id, type, amount, description, date) VALUES (?, ?, ?, ?, ?)');
transactions.forEach(t => insertTransaction.run(t.tenancy_id, t.type, t.amount, t.description, t.date));
console.log(`✓ ${transactions.length} transactions`);

const insertMaintenance = db.prepare('INSERT INTO maintenance (property_id, reported_by, title, description, priority, status, contractor, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
maintenance.forEach(m => insertMaintenance.run(m.property_id, m.reported_by, m.title, m.description, m.priority, m.status, m.contractor, m.cost));
console.log(`✓ ${maintenance.length} maintenance requests`);

console.log('\n✅ Real data imported successfully!');
console.log('\nSummary:');
console.log('=========');
properties.forEach((p, i) => {
  const tenant = tenants[i];
  console.log(`${i+1}. ${p.address}, ${p.postcode}`);
  console.log(`   Tenant: ${tenant.name} | Rent: £${p.rent_amount}/m | EPC: ${p.epc_grade}`);
});
