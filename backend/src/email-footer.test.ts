import {describe,it,expect,vi} from 'vitest';
import fs from 'fs';
import path from 'path';
import {addEmailFooter,emailSocialLinks} from './email-footer';
import {prepareEmailHtml} from './email-presentation';
import {marketingEmailHtml} from './marketing-html';
import {inlineEmailImages} from './email';
// Security codes intentionally have no marketing opt-out; covered by login-email-delivery.test.ts.
const files=['email-templates','email-signatures'].flatMap(folder=>fs.readdirSync(path.join(__dirname,folder)).filter(f=>f.endsWith('.html')&&f!=='40-two-factor-sign-in.html').map(file=>({folder,file})));
describe('footer coverage across every HTML template and signature',()=>{
 for(const {folder,file} of files)it(`${folder}/${file}: five linked images and one recipient footer survive both delivery paths`,()=>{
  const raw=fs.readFileSync(path.join(__dirname,folder,file),'utf8');
  expect(raw.match(/id="fleming-social-links"/g)).toHaveLength(1);
  expect(raw.match(/id="fleming-email-opt-out"/g)).toHaveLength(1);
  const filled=raw.replace(/\{\{[A-Z_]+\}\}/g,'Sample');
  for(const html of [prepareEmailHtml(addEmailFooter(filled,'https://example.test/preferences/recipient')),marketingEmailHtml(filled,'https://example.test/preferences/recipient')]){
   expect(html.match(/id="fleming-social-links"/g)).toHaveLength(1);expect(html.match(/id="fleming-email-opt-out"/g)).toHaveLength(1);
   expect(html).toContain('href="https://example.test/preferences/recipient"');expect(html).not.toContain('/email-preferences/preview');
   expect(html.indexOf('fleming-social-links')).toBeLessThan(html.indexOf('This email and any attachments'));
   expect(html.indexOf('fleming-email-opt-out')).toBeGreaterThan(html.indexOf('This email and any attachments'));
   for(const link of emailSocialLinks){expect(html).toContain(`href="${link.url}"`);expect(html).toContain(`alt="${link.name}"`);}
   const inline=inlineEmailImages(html);const icons=inline.attachments.filter(a=>a.filename.startsWith('social-'));
   expect(icons).toHaveLength(5);expect(new Set(icons.map(a=>a.filename)).size).toBe(5);
   for(const icon of icons){expect(icon.content.length).toBeGreaterThan(100);expect(inline.html).toContain(`cid:fleming-${icon.filename}`);}
   expect(prepareEmailHtml(html)).toBe(html);
  }
 });
 it('upgrades old saved marketing drafts without adding another disclaimer or unsubscribe row',()=>{
  const old='<p>News</p><table><tr><td><a href="https://example.test/old">Unsubscribe from Fleming Lettings marketing emails</a></td></tr></table>';
  const html=marketingEmailHtml(old,'https://example.test/new');expect(html).not.toContain('https://example.test/old');expect(html.match(/to unsubscribe from our marketing emails/g)).toHaveLength(1);
 });
});
