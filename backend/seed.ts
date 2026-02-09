import db from './src/db';

// Seed data
const landlords = [
  { name: 'James Harrison', email: 'james.harrison@email.com', phone: '07712 345678', address: '45 Park Lane, Wolverhampton, WV1 4AB' },
  { name: 'Sarah Mitchell', email: 'sarah.m@landlords.co.uk', phone: '07834 567890', address: '12 Oak Drive, Stafford, ST16 2PQ' },
  { name: 'Robert & Linda Chen', email: 'chen.properties@gmail.com', phone: '07956 789012', address: '8 Victoria Road, Walsall, WS1 3QR' },
  { name: 'David Thompson', email: 'dthompson@btinternet.com', phone: '07623 456789', address: '92 High Street, Dudley, DY1 1PT' },
  { name: 'Wolverhampton Investments Ltd', email: 'info@wolveinvest.co.uk', phone: '01902 456789', address: 'Suite 4, Enterprise House, Wolverhampton, WV2 4BN' },
];

const tenants = [
  { name: 'Emma Williams', email: 'emma.w92@gmail.com', phone: '07445 123456', emergency_contact: 'Mother - 07445 999888' },
  { name: 'Michael & Sophie Brown', email: 'brownfamily@outlook.com', phone: '07556 234567', emergency_contact: "Michael's brother - 07556 111222" },
  { name: 'Aisha Patel', email: 'aisha.patel@yahoo.com', phone: '07667 345678', emergency_contact: 'Father - 07667 333444' },
  { name: 'Tom Richards', email: 'trichards@hotmail.com', phone: '07778 456789', emergency_contact: 'Partner - 07778 555666' },
  { name: 'Grace Okonkwo', email: 'grace.ok@gmail.com', phone: '07889 567890', emergency_contact: 'Sister - 07889 777888' },
  { name: 'James & Emily Foster', email: 'fosterhome@gmail.com', phone: '07990 678901', emergency_contact: "Emily's parents - 07990 999000" },
  { name: 'Daniel Murphy', email: 'dan.murphy@icloud.com', phone: '07321 789012', emergency_contact: 'Workplace - 01902 123456' },
  { name: 'Lisa Chen', email: 'lisa.chen88@gmail.com', phone: '07432 890123', emergency_contact: 'Partner - 07432 222333' },
];

const properties = [
  { landlord_id: 1, address: '24 Stafford Road', postcode: 'WV10 6AJ', property_type: 'house', bedrooms: 3, rent_amount: 850, status: 'let' },
  { landlord_id: 1, address: '67 Chapel Lane', postcode: 'WV11 2QP', property_type: 'house', bedrooms: 2, rent_amount: 725, status: 'let' },
  { landlord_id: 2, address: '15 Riverside Court, Flat 4', postcode: 'ST17 4YH', property_type: 'flat', bedrooms: 2, rent_amount: 695, status: 'let' },
  { landlord_id: 2, address: '89 Birmingham Road', postcode: 'WS1 2NB', property_type: 'house', bedrooms: 4, rent_amount: 1100, status: 'let' },
  { landlord_id: 3, address: '3 Maple Gardens', postcode: 'WV6 8RT', property_type: 'bungalow', bedrooms: 2, rent_amount: 795, status: 'let' },
  { landlord_id: 3, address: '112 Queens Street', postcode: 'WV1 3DX', property_type: 'flat', bedrooms: 1, rent_amount: 550, status: 'available' },
  { landlord_id: 4, address: '28 Compton Road', postcode: 'WV3 9PH', property_type: 'house', bedrooms: 3, rent_amount: 925, status: 'let' },
  { landlord_id: 4, address: '44 Dudley Street', postcode: 'DY1 1HP', property_type: 'flat', bedrooms: 2, rent_amount: 650, status: 'let' },
  { landlord_id: 5, address: '7 Waterloo Road', postcode: 'WV1 4QE', property_type: 'house', bedrooms: 5, rent_amount: 1450, status: 'let' },
  { landlord_id: 5, address: '19 Castle View', postcode: 'WV1 1TY', property_type: 'flat', bedrooms: 2, rent_amount: 750, status: 'maintenance' },
  { landlord_id: 5, address: '156 Penn Road', postcode: 'WV4 5JN', property_type: 'house', bedrooms: 3, rent_amount: 895, status: 'available' },
];

const tenancies = [
  { property_id: 1, tenant_id: 1, start_date: '2024-03-15', rent_amount: 850, deposit_amount: 1700 },
  { property_id: 2, tenant_id: 2, start_date: '2024-06-01', rent_amount: 725, deposit_amount: 1450 },
  { property_id: 3, tenant_id: 3, start_date: '2024-09-01', rent_amount: 695, deposit_amount: 1390 },
  { property_id: 4, tenant_id: 4, start_date: '2023-12-01', rent_amount: 1100, deposit_amount: 2200 },
  { property_id: 5, tenant_id: 5, start_date: '2024-01-15', rent_amount: 795, deposit_amount: 1590 },
  { property_id: 7, tenant_id: 6, start_date: '2024-04-01', rent_amount: 925, deposit_amount: 1850 },
  { property_id: 8, tenant_id: 7, start_date: '2024-07-01', rent_amount: 650, deposit_amount: 1300 },
  { property_id: 9, tenant_id: 8, start_date: '2024-02-01', rent_amount: 1450, deposit_amount: 2900 },
];

const transactions = [
  // January
  { tenancy_id: 1, type: 'rent_due', amount: 850, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 1, type: 'payment', amount: 850, description: 'Bank transfer', date: '2025-01-03' },
  { tenancy_id: 2, type: 'rent_due', amount: 725, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 2, type: 'payment', amount: 725, description: 'Standing order', date: '2025-01-01' },
  { tenancy_id: 3, type: 'rent_due', amount: 695, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 3, type: 'payment', amount: 695, description: 'Standing order', date: '2025-01-02' },
  { tenancy_id: 4, type: 'rent_due', amount: 1100, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 4, type: 'payment', amount: 1100, description: 'Bank transfer', date: '2025-01-05' },
  { tenancy_id: 5, type: 'rent_due', amount: 795, description: 'January rent', date: '2025-01-15' },
  { tenancy_id: 5, type: 'payment', amount: 795, description: 'Standing order', date: '2025-01-15' },
  { tenancy_id: 6, type: 'rent_due', amount: 925, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 6, type: 'payment', amount: 925, description: 'Standing order', date: '2025-01-01' },
  { tenancy_id: 7, type: 'rent_due', amount: 650, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 7, type: 'payment', amount: 650, description: 'Standing order', date: '2025-01-03' },
  { tenancy_id: 8, type: 'rent_due', amount: 1450, description: 'January rent', date: '2025-01-01' },
  { tenancy_id: 8, type: 'payment', amount: 1450, description: 'Bank transfer', date: '2025-01-02' },
  // February
  { tenancy_id: 1, type: 'rent_due', amount: 850, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 1, type: 'payment', amount: 850, description: 'Bank transfer', date: '2025-02-03' },
  { tenancy_id: 2, type: 'rent_due', amount: 725, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 2, type: 'payment', amount: 725, description: 'Standing order', date: '2025-02-01' },
  { tenancy_id: 3, type: 'rent_due', amount: 695, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 4, type: 'rent_due', amount: 1100, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 4, type: 'payment', amount: 550, description: 'Partial payment', date: '2025-02-05' },
  { tenancy_id: 5, type: 'rent_due', amount: 795, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 5, type: 'payment', amount: 795, description: 'Standing order', date: '2025-02-01' },
  { tenancy_id: 6, type: 'rent_due', amount: 925, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 6, type: 'payment', amount: 925, description: 'Standing order', date: '2025-02-01' },
  { tenancy_id: 7, type: 'rent_due', amount: 650, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 7, type: 'payment', amount: 650, description: 'Standing order', date: '2025-02-01' },
  { tenancy_id: 8, type: 'rent_due', amount: 1450, description: 'February rent', date: '2025-02-01' },
  { tenancy_id: 8, type: 'payment', amount: 1450, description: 'Bank transfer', date: '2025-02-02' },
];

const maintenance = [
  { property_id: 1, reported_by: 'Emma Williams', title: 'Boiler not heating water', description: 'Hot water stopped working yesterday evening. Heating still works fine but no hot water from taps.', priority: 'high', status: 'in_progress', contractor: 'BG HomeServe', cost: null },
  { property_id: 4, reported_by: 'Tom Richards', title: 'Broken window latch - bedroom', description: 'Window in master bedroom won\'t close properly. Latch mechanism seems broken.', priority: 'medium', status: 'open', contractor: null, cost: null },
  { property_id: 9, reported_by: 'Lisa Chen', title: 'Leak under kitchen sink', description: 'Noticed water pooling under the sink. Appears to be coming from the waste pipe connection.', priority: 'high', status: 'completed', contractor: 'Dave\'s Plumbing', cost: 85 },
  { property_id: 5, reported_by: 'Grace Okonkwo', title: 'Garden fence panel blown down', description: 'Storm damage - one fence panel completely down, another loose.', priority: 'low', status: 'open', contractor: null, cost: null },
  { property_id: 2, reported_by: 'Sophie Brown', title: 'Smoke alarm beeping', description: 'Smoke alarm in hallway beeping intermittently - probably needs new battery.', priority: 'medium', status: 'completed', contractor: null, cost: 12 },
  { property_id: 10, reported_by: 'Inspection', title: 'Damp in bathroom ceiling', description: 'Found during routine inspection. Possible leak from flat above or ventilation issue.', priority: 'high', status: 'in_progress', contractor: 'ABC Damp Solutions', cost: null },
  { property_id: 7, reported_by: 'James Foster', title: 'Front door lock sticking', description: 'Key difficult to turn in lock, getting worse over time.', priority: 'medium', status: 'open', contractor: null, cost: null },
];

// Insert data
console.log('Seeding database...\n');

const insertLandlord = db.prepare('INSERT INTO landlords (name, email, phone, address) VALUES (?, ?, ?, ?)');
landlords.forEach(l => insertLandlord.run(l.name, l.email, l.phone, l.address));
console.log(`✓ ${landlords.length} landlords`);

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

console.log('\n✅ Database seeded successfully!');
