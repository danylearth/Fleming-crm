const fs = require('node:fs');
for (const name of ['email-signatures', 'email-templates', 'email-assets', 'agreement-assets', 'public-pages']) fs.cpSync(`src/${name}`, `dist/${name}`, { recursive: true });
