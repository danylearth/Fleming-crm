const fs = require('node:fs');
for (const name of ['email-templates', 'agreement-assets']) fs.cpSync(`src/${name}`, `dist/${name}`, { recursive: true });
