#!/usr/bin/env node

/**
 * Seed script for live production database
 * Seeds demo landlords, properties, tenants, enquiries, and maintenance requests
 */

const API_URL = 'https://fleming-crm-api-production-7e58.up.railway.app';
const LOGIN_EMAIL = 'admin@fleming.com';
const LOGIN_PASSWORD = 'admin123';

let token = '';

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
  });
  const data = await response.json();
  token = data.token;
  console.log('✅ Logged in as', data.user.email);
}

async function apiCall(endpoint, method = 'POST', body) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    console.error(`❌ Error on ${endpoint}:`, data);
    throw new Error(data.error || 'API call failed');
  }
  return data;
}

async function seedLandlords() {
  console.log('\n📋 Seeding landlords...');

  const landlords = [
    {
      name: 'John Smith',
      email: 'john.smith@email.com',
      phone: '07700900001',
      address: '123 High Street, London, SW1A 1AA',
      landlord_type: 'internal',
      portfolio_size: 5,
      notes: 'Long-term client, very responsive'
    },
    {
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      phone: '07700900002',
      address: '45 Park Avenue, Manchester, M1 2AB',
      landlord_type: 'external',
      portfolio_size: 3,
      notes: 'Prefers email communication'
    },
    {
      name: 'Property Investments Ltd',
      email: 'info@propertyinvest.co.uk',
      phone: '02012345678',
      address: '100 Business Park, Birmingham, B1 3CD',
      landlord_type: 'internal',
      portfolio_size: 12,
      company_number: '12345678',
      notes: 'Corporate landlord, monthly statements required'
    }
  ];

  const created = [];
  for (const landlord of landlords) {
    const result = await apiCall('/api/landlords', 'POST', landlord);
    created.push(result);
    console.log(`  ✓ Created landlord: ${landlord.name}`);
  }

  return created;
}

async function seedProperties(landlords) {
  console.log('\n🏠 Seeding properties...');

  const properties = [
    {
      landlord_id: landlords[0].id,
      address: '10 Oak Road, London, SW1A 2BB',
      postcode: 'SW1A 2BB',
      property_type: 'flat',
      bedrooms: 2,
      rent_amount: 1500,
      council_tax_band: 'C',
      epc_grade: 'C',
      notes: 'Modern 2-bed flat in central London'
    },
    {
      landlord_id: landlords[0].id,
      address: '22 Elm Street, London, SW1A 3CC',
      postcode: 'SW1A 3CC',
      property_type: 'flat',
      bedrooms: 1,
      rent_amount: 1200,
      council_tax_band: 'B',
      epc_grade: 'B',
      notes: 'Compact 1-bed flat, recently renovated'
    },
    {
      landlord_id: landlords[1].id,
      address: '5 Victoria Road, Manchester, M1 4DD',
      postcode: 'M1 4DD',
      property_type: 'house',
      bedrooms: 3,
      rent_amount: 1800,
      council_tax_band: 'D',
      epc_grade: 'D',
      notes: '3-bed house with garden'
    },
    {
      landlord_id: landlords[2].id,
      address: '78 King Street, Birmingham, B1 5EE',
      postcode: 'B1 5EE',
      property_type: 'flat',
      bedrooms: 2,
      rent_amount: 1400,
      council_tax_band: 'C',
      epc_grade: 'C',
      notes: 'City center apartment, 2 bedrooms'
    },
    {
      landlord_id: landlords[2].id,
      address: '92 Queen Avenue, Birmingham, B1 6FF',
      postcode: 'B1 6FF',
      property_type: 'flat',
      bedrooms: 1,
      rent_amount: 950,
      council_tax_band: 'A',
      epc_grade: 'B',
      notes: 'Affordable 1-bed flat near transport links'
    }
  ];

  const created = [];
  for (const property of properties) {
    const result = await apiCall('/api/properties', 'POST', property);
    created.push(result);
    console.log(`  ✓ Created property: ${property.address}`);
  }

  return created;
}

async function seedTenants(properties) {
  console.log('\n👥 Seeding tenants...');

  const tenants = [
    {
      name: 'Alice Williams',
      email: 'alice.w@email.com',
      phone: '07700900101',
      current_address: properties[0].address,
      property_id: properties[0].id,
      move_in_date: '2024-01-15',
      lease_end_date: '2025-01-14',
      rent_amount: 1500,
      deposit_amount: 1500,
      deposit_scheme: 'DPS',
      notes: 'Excellent tenant, always pays on time'
    },
    {
      name: 'Bob Martinez',
      email: 'bob.martinez@email.com',
      phone: '07700900102',
      current_address: properties[2].address,
      property_id: properties[2].id,
      move_in_date: '2023-06-01',
      lease_end_date: '2025-05-31',
      rent_amount: 1800,
      deposit_amount: 1800,
      deposit_scheme: 'MyDeposits',
      notes: 'Works from home, prefers digital communication'
    },
    {
      name: 'Carol Davis',
      email: 'carol.davis@email.com',
      phone: '07700900103',
      current_address: properties[3].address,
      property_id: properties[3].id,
      move_in_date: '2024-03-01',
      lease_end_date: '2025-02-28',
      rent_amount: 1400,
      deposit_amount: 1400,
      deposit_scheme: 'TDS',
      notes: 'Young professional, first-time renter'
    }
  ];

  const created = [];
  for (const tenant of tenants) {
    const result = await apiCall('/api/tenants', 'POST', tenant);
    created.push(result);
    console.log(`  ✓ Created tenant: ${tenant.name}`);
  }

  return created;
}

async function seedEnquiries() {
  console.log('\n📧 Seeding enquiries...');

  const enquiries = [
    {
      name: 'David Thompson',
      email: 'david.t@email.com',
      phone: '07700900201',
      property_interest: 'Looking for 2-bed flat in London',
      notes: 'Young couple, both professionals'
    },
    {
      name: 'Emma Wilson',
      email: 'emma.wilson@email.com',
      phone: '07700900202',
      property_interest: '1-bed flat, Birmingham area',
      notes: 'Student, needs guarantor'
    },
    {
      name: 'Frank Brown',
      email: 'frank.brown@email.com',
      phone: '07700900203',
      property_interest: '3-bed house with garden',
      notes: 'Family with 2 children, pet-friendly required'
    }
  ];

  const created = [];
  for (const enquiry of enquiries) {
    const result = await apiCall('/api/tenant-enquiries', 'POST', enquiry);
    created.push(result);
    console.log(`  ✓ Created enquiry: ${enquiry.name}`);
  }

  return created;
}

async function seedBDM() {
  console.log('\n💼 Seeding BDM prospects...');

  const prospects = [
    {
      name: 'George Anderson',
      email: 'george.a@email.com',
      phone: '07700900301',
      notes: 'Interested in full management service - 8 property portfolio'
    },
    {
      name: 'Helen Parker',
      email: 'helen.parker@email.com',
      phone: '07700900302',
      notes: 'Currently with another agent, contract ends Q2 - 4 houses'
    },
    {
      name: 'Investment Properties UK Ltd',
      email: 'contact@investprop-uk.com',
      phone: '02087654321',
      notes: 'Large portfolio (25 properties), looking to consolidate management'
    }
  ];

  const created = [];
  for (const prospect of prospects) {
    const result = await apiCall('/api/landlords-bdm', 'POST', prospect);
    created.push(result);
    console.log(`  ✓ Created BDM prospect: ${prospect.name}`);
  }

  return created;
}

async function seedMaintenance(properties, tenants) {
  console.log('\n🔧 Seeding maintenance requests...');

  const requests = [
    {
      property_id: properties[0].id,
      reported_by: tenants[0].id,
      title: 'Leaking kitchen tap',
      description: 'The kitchen tap has been dripping constantly for the past week',
      priority: 'medium',
      status: 'pending',
      category: 'plumbing'
    },
    {
      property_id: properties[2].id,
      reported_by: tenants[1].id,
      title: 'Boiler making strange noises',
      description: 'Boiler is making loud banging sounds when heating turns on',
      priority: 'high',
      status: 'in_progress',
      category: 'heating'
    },
    {
      property_id: properties[3].id,
      reported_by: tenants[2].id,
      title: 'Broken window latch',
      description: 'Bedroom window latch is broken, cannot secure window properly',
      priority: 'medium',
      status: 'completed',
      category: 'general',
      resolved_date: '2026-03-20'
    },
    {
      property_id: properties[4].id,
      title: 'Full property inspection needed',
      description: 'Property needs full inspection before new tenant moves in',
      priority: 'low',
      status: 'pending',
      category: 'inspection'
    }
  ];

  const created = [];
  for (const request of requests) {
    const result = await apiCall('/api/maintenance', 'POST', request);
    created.push(result);
    console.log(`  ✓ Created maintenance: ${request.title}`);
  }

  return created;
}

async function seedTasks(properties) {
  console.log('\n✅ Seeding tasks...');

  const tasks = [
    {
      title: 'Schedule gas safety inspection',
      description: 'Annual gas safety check due for 10 Oak Road',
      entity_type: 'property',
      entity_id: properties[0].id,
      priority: 'high',
      status: 'pending',
      due_date: '2026-05-15',
      task_type: 'gas_reminder'
    },
    {
      title: 'Inventory check for new tenant',
      description: 'Complete inventory before Alice Williams moves in',
      entity_type: 'property',
      entity_id: properties[1].id,
      priority: 'medium',
      status: 'completed',
      due_date: '2026-01-10',
      completed_date: '2026-01-08',
      task_type: 'manual'
    },
    {
      title: 'EPC renewal required',
      description: 'EPC certificate expiring soon for 78 King Street',
      entity_type: 'property',
      entity_id: properties[3].id,
      priority: 'medium',
      status: 'in_progress',
      due_date: '2026-08-25',
      task_type: 'epc_reminder'
    },
    {
      title: 'Follow up with tenant enquiry',
      description: 'Call David Thompson to discuss viewing times',
      entity_type: 'tenant_enquiry',
      priority: 'high',
      status: 'pending',
      due_date: '2026-03-25',
      task_type: 'manual'
    }
  ];

  const created = [];
  for (const task of tasks) {
    const result = await apiCall('/api/tasks', 'POST', task);
    created.push(result);
    console.log(`  ✓ Created task: ${task.title}`);
  }

  return created;
}

async function main() {
  console.log('🚀 Starting live database seeding...\n');
  console.log(`API URL: ${API_URL}`);

  try {
    await login();

    const landlords = await seedLandlords();
    const properties = await seedProperties(landlords);
    const tenants = await seedTenants(properties);

    let enquiries = [];
    try {
      enquiries = await seedEnquiries();
    } catch (e) {
      console.log('  ⚠️  Skipping enquiries (API error)');
    }

    let bdmProspects = [];
    try {
      bdmProspects = await seedBDM();
    } catch (e) {
      console.log('  ⚠️  Skipping BDM prospects (API error)');
    }

    const maintenance = await seedMaintenance(properties, tenants);
    const tasks = await seedTasks(properties);

    console.log('\n✅ Seeding completed!\n');
    console.log('Summary:');
    console.log(`  - ${landlords.length} landlords`);
    console.log(`  - ${properties.length} properties`);
    console.log(`  - ${tenants.length} tenants`);
    console.log(`  - ${enquiries.length} enquiries`);
    console.log(`  - ${bdmProspects.length} BDM prospects`);
    console.log(`  - ${maintenance.length} maintenance requests`);
    console.log(`  - ${tasks.length} tasks`);
    console.log('\n🎉 Demo data is ready!');
    console.log(`\nVisit: https://fleming-portal.vercel.app`);
    console.log(`Login: admin@fleming.com / admin123`);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
