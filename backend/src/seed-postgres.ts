import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seed() {
  const client = await pool.connect();
  try {
    // Check if already seeded
    const existing = await client.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Database already seeded');
      return;
    }

    console.log('Seeding database...');

    // Create admin user
    const hashedPassword = await bcrypt.hash('test123', 10);
    await client.query(
      'INSERT INTO users (email, password, name, role, is_active) VALUES ($1, $2, $3, $4, $5)',
      ['d@planet.earth', hashedPassword, 'Danyl', 'admin', 1]
    );
    console.log('Created admin user: d@planet.earth / test123');

    // Create Fleming Lettings as landlord
    const landlordResult = await client.query(
      'INSERT INTO landlords (name, email, phone, notes) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Fleming Lettings', 'info@fleminglettings.co.uk', '020 1234 5678', 'Primary landlord account']
    );
    const landlordId = landlordResult.rows[0].id;

    // Create sample properties
    const properties = [
      { address: '12 Oak Street', postcode: 'SW1A 1AA', type: 'house', beds: 3, rent: 1500 },
      { address: '45 Maple Avenue', postcode: 'SW1A 2BB', type: 'flat', beds: 2, rent: 1200 },
      { address: '78 Pine Road', postcode: 'SW1A 3CC', type: 'house', beds: 4, rent: 1800 },
      { address: '23 Elm Close', postcode: 'SW1A 4DD', type: 'flat', beds: 1, rent: 900 },
      { address: '56 Birch Lane', postcode: 'SW1A 5EE', type: 'house', beds: 3, rent: 1400 },
    ];

    for (const p of properties) {
      await client.query(
        `INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'let')`,
        [landlordId, p.address, p.postcode, p.type, p.beds, p.rent]
      );
    }
    console.log('Created 5 sample properties');

    // Create sample tenants
    const tenants = [
      { name: 'John Smith', email: 'john.smith@email.com', phone: '07700 900001' },
      { name: 'Jane Doe', email: 'jane.doe@email.com', phone: '07700 900002' },
      { name: 'Bob Johnson', email: 'bob.j@email.com', phone: '07700 900003' },
      { name: 'Alice Brown', email: 'alice.b@email.com', phone: '07700 900004' },
      { name: 'Charlie Wilson', email: 'charlie.w@email.com', phone: '07700 900005' },
    ];

    for (let i = 0; i < tenants.length; i++) {
      const t = tenants[i];
      await client.query(
        `INSERT INTO tenants (name, first_name_1, last_name_1, email, phone, property_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [t.name, t.name.split(' ')[0], t.name.split(' ')[1], t.email, t.phone, i + 1]
      );
    }
    console.log('Created 5 sample tenants');

    // Create sample maintenance requests
    await client.query(
      `INSERT INTO maintenance (property_id, title, description, priority, status) VALUES
       (1, 'Boiler not heating', 'Tenant reports boiler not producing hot water', 'high', 'open'),
       (2, 'Leaky tap in bathroom', 'Bathroom sink tap dripping constantly', 'low', 'open'),
       (3, 'Broken window lock', 'Bedroom window lock mechanism broken', 'medium', 'in_progress')`
    );
    console.log('Created 3 sample maintenance requests');

    console.log('Seeding complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
