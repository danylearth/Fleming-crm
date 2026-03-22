// Test script for EPC API
const fs = require('fs');
const path = require('path');

// Manually load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      process.env[key] = value;
    }
  });
}

const API_EMAIL = process.env.EPC_API_EMAIL;
const API_KEY = process.env.EPC_API_KEY;

console.log('🔍 Testing EPC API...\n');
console.log(`Email: ${API_EMAIL ? '✓ Configured' : '✗ Missing'}`);
console.log(`API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}\n`);

if (!API_EMAIL || !API_KEY) {
  console.error('❌ EPC API credentials not configured');
  process.exit(1);
}

// Test with a known residential postcode
const testPostcode = 'M1 1AE'; // Manchester city center - residential properties

console.log(`Testing with postcode: ${testPostcode}\n`);

const url = `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(testPostcode)}&size=5`;
const auth = Buffer.from(`${API_EMAIL}:${API_KEY}`).toString('base64');

fetch(url, {
  headers: {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  }
})
  .then(response => {
    console.log(`Status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      return response.text().then(text => {
        console.error('❌ API Error Response:', text);
        throw new Error(`HTTP ${response.status}`);
      });
    }
    return response.text();
  })
  .then(text => {
    if (!text || text.length === 0) {
      console.log('⚠️  Empty response from API');
      return;
    }

    const data = JSON.parse(text);
    const results = data.rows || [];

    console.log(`\n✅ Success! Found ${results.length} EPC certificates\n`);

    if (results.length > 0) {
      results.slice(0, 3).forEach((r, i) => {
        console.log(`${i + 1}. ${r.address}`);
        console.log(`   Rating: ${r['current-energy-rating']} (Efficiency: ${r['current-energy-efficiency']})`);
        console.log(`   Property Type: ${r['property-type']}`);
        console.log(`   Inspection: ${r['inspection-date']}`);
        console.log('');
      });
    }
  })
  .catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  });
