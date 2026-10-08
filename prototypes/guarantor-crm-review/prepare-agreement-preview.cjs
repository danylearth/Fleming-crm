const fs=require('fs');
const source=fs.readFileSync('backend/src/company-settings-values.ts','utf8');
const account=name=>Object.fromEntries([...source.match(new RegExp(name+':\\{([^}]+)\\}'))[1].matchAll(/(\w+):'([^']*)'/g)].map(m=>[m[1],m[2]]));
const banks={operatingAccount:account('operatingAccount'),clientAccount:account('clientAccount')};
for(const root of ['tmp/guarantor-crm-preview/frontend/public','tmp/guarantor-crm-preview/frontend/dist']){if(!fs.existsSync(root+'/guarantor'))continue;fs.writeFileSync(root+'/guarantor/agreement-test.html',require('./agreement-signing-page.cjs')());fs.writeFileSync(root+'/guarantor/company-bank-details.json',JSON.stringify(banks));fs.copyFileSync('backend/src/email-templates/06-tenancy-agreement.html',root+'/guarantor/tenancy-agreement-email.html');}

require('./prepare-agreement-document.cjs');
