import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Install Node.js 24.x, then run this command again.');
  process.exit(1);
}

for (const folder of ['backend', 'frontend']) {
  const target = path.join(root, folder, '.env');
  if (existsSync(target)) {
    console.log(`${folder}/.env already exists; kept unchanged.`);
    continue;
  }
  let content = readFileSync(`${target}.example`, 'utf8')
    .replace(/GENERATE_LOCAL_[A-Z_]+/g, () => randomBytes(32).toString('hex'));
  if (folder === 'backend') {
    const office = [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      'C:/Program Files/LibreOffice/program/soffice.exe',
    ].find(candidate => existsSync(candidate));
    if (office) content += `\nLIBREOFFICE_PATH="${office}"\n`;
    if (existsSync('C:/Windows/Fonts/arial.ttf')) {
      content += '\nPDF_ARIAL_REGULAR="C:/Windows/Fonts/arial.ttf"\nPDF_ARIAL_BOLD="C:/Windows/Fonts/arialbd.ttf"\n';
    }
  }
  writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  console.log(`Created ${folder}/.env with local-only settings.`);
}
console.log('Local login: admin@fleming.com. Password: SEED_ADMIN_PASSWORD in backend/.env (after seeding).');
