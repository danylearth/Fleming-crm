// Fetch HTML only: fictional tokens must never record customer opening events.
const assert = require('node:assert/strict');
const base = process.argv[2];
assert(base && /^https?:\/\//.test(base), 'Usage: node check-deployment.cjs https://deployment-host');
const routes = [
  ['/', '/index.html'],
  ['/apt-routing-check-fictional', '/agreement.html'],
  ['/agreement/routing-check-fictional', '/agreement.html'],
  ['/onboarding/routing-check-fictional', '/application.html'],
  ['/routing-check-fictional', '/application.html'],
  ['/guarantor', '/guarantor/index.html'],
  ['/inventory/routing-check-fictional', '/inventory.html'],
  ['/report', '/report.html'],
  ['/example-contract1-abcdefghijklmnopqrstuv', '/service-agreement.html'],
  ['/example-contract1-abcdefghijklmnopqrstuv/signed', '/service-agreement-signed.html'],
];
async function html(route) {
  const response = await fetch(new URL(route, base));
  assert.equal(response.status, 200, route + ' must return 200');
  const text = await response.text();
  assert(!/Login – Vercel|Authentication Required/.test(text), 'Deployment protection blocked verification');
  return text;
}
(async () => {
  for (const [route, file] of routes) {
    assert.equal(await html(route), await html(file), route + ' must serve ' + file);
    console.log('PASS ' + route + ' → ' + file);
  }
})().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
