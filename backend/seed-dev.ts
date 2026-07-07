import pool, { initDb } from './src/db-pg';
import bcrypt from 'bcryptjs';

// Local development seed — small, deterministic demo dataset.
// Usage: npm run seed:dev   (never run against production)
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV is production');
    process.exit(1);
  }

  await initDb();
  const client = await pool.connect();
  try {
    const users = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (users.rows[0].count > 0 && process.env.FORCE_RESEED !== 'true') {
      console.log('Database not empty — set FORCE_RESEED=true to wipe and re-seed');
      process.exit(0);
    }

    if (process.env.FORCE_RESEED === 'true') {
      const tables = ['property_viewings', 'property_expenses', 'rent_payments', 'maintenance', 'tasks', 'tenancies',
        'tenant_enquiries', 'tenants', 'properties', 'landlords_bdm', 'directors', 'property_landlords',
        'landlords', 'audit_log', 'documents', 'sms_messages', 'email_messages', 'users'];
      for (const t of tables) {
        await client.query(`DELETE FROM ${t}`).catch(() => {});
      }
    }

    const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(password, 10);
    await client.query(`INSERT INTO users (email, password, name, role) VALUES ($1, $2, 'Admin', 'admin')`, ['admin@fleming.com', hash]);

    const daysFromNow = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n);
      return d.toISOString().split('T')[0];
    };

    const landlords = [
      ['James MacPherson', 'j.macpherson@email.com', '07700 700100', 'internal'],
      ['Sarah Henderson', 's.henderson@email.com', '07700 700200', 'external'],
      ['Fleming Lettings Ltd', 'office@fleming.com', '0131 555 0100', 'internal'],
    ];
    const landlordIds: number[] = [];
    for (const [name, email, phone, type] of landlords) {
      const r = await client.query(
        `INSERT INTO landlords (name, email, phone, landlord_type, kyc_completed) VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [name, email, phone, type]
      );
      landlordIds.push(r.rows[0].id);
    }

    const properties = [
      [landlordIds[0], '12A Leith Walk, Edinburgh EH6 5DT', 'EH6 5DT', 2, 950, 'let_agreed', 1, daysFromNow(8)],
      [landlordIds[0], '7/3 Easter Road, Edinburgh EH7 5PL', 'EH7 5PL', 1, 750, 'to_let', 1, daysFromNow(75)],
      [landlordIds[1], '15 Constitution Street, Edinburgh EH6 7BG', 'EH6 7BG', 3, 1200, 'full_management', 1, daysFromNow(-20)],
      [landlordIds[2], '21 Morningside Road, Edinburgh EH10 4DR', 'EH10 4DR', 2, 1100, 'to_let', 0, null],
      [landlordIds[2], '4 Stockbridge Crescent, Edinburgh EH3 5LR', 'EH3 5LR', 3, 1400, 'let_agreed', 1, daysFromNow(40)],
    ];
    const propertyIds: number[] = [];
    for (const [lid, address, postcode, beds, rent, status, hasGas, gasExpiry] of properties) {
      const r = await client.query(
        `INSERT INTO properties (landlord_id, address, postcode, bedrooms, rent_amount, status, has_gas, gas_safety_expiry_date, eicr_expiry_date, epc_expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [lid, address, postcode, beds, rent, status, hasGas, gasExpiry, daysFromNow(200), daysFromNow(400)]
      );
      propertyIds.push(r.rows[0].id);
    }

    const enquiries = [
      ['Sophie', 'Taylor', 'sophie.t@email.com', '07700 900201', 'viewing_booked', propertyIds[3]],
      ['Tom', 'Anderson', 'tom.a@email.com', '07700 900202', 'viewing_booked', propertyIds[1]],
      ['Ahmed', 'Hassan', 'ahmed.h@email.com', '07700 900203', 'awaiting_response', null],
      ['Jenny', 'Liu', 'jenny.l@email.com', '07700 900204', 'new', null],
    ];
    for (const [first, last, email, phone, status, propId] of enquiries) {
      await client.query(
        `INSERT INTO tenant_enquiries (first_name_1, last_name_1, email_1, phone_1, status, linked_property_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [first, last, email, phone, status, propId]
      );
    }

    await client.query(
      `INSERT INTO tasks (title, description, priority, status, due_date, task_type) VALUES
       ('Chase gas safety certificate', 'Gas safety expiring for 12A Leith Walk. Book engineer ASAP.', 'high', 'pending', $1, 'manual'),
       ('Quarterly compliance audit', 'Review all property compliance dates.', 'high', 'pending', $2, 'manual'),
       ('Follow up with Ahmed Hassan', 'Waiting for completed application and proof of income.', 'medium', 'pending', $3, 'manual')`,
      [daysFromNow(5), daysFromNow(20), daysFromNow(3)]
    );

    console.log(`Seeded: ${landlordIds.length} landlords, ${propertyIds.length} properties, ${enquiries.length} enquiries, 3 tasks`);
    console.log(`Login: admin@fleming.com / ${password === 'admin123' ? 'admin123 (dev default)' : '(from SEED_ADMIN_PASSWORD)'}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().then(() => process.exit(0)).catch(err => { console.error('Seed failed:', err); process.exit(1); });
