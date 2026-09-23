import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {emailTemplateLibrary} from './message-template-library';
import {prepareEmailHtml} from './email-presentation';
it('all template previews have explicit light presentation and existing absolute image assets',()=>{
 for(const template of emailTemplateLibrary()){
  expect(template.html,template.id).toContain('name="color-scheme" content="light only"');
  for(const image of template.html.matchAll(/src="([^"]+)"/g)){
   expect(image[1],template.id).toMatch(/^https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\//);
   expect(fs.existsSync(path.join(__dirname,'../../frontend/public/email-assets',image[1].split('/').pop()!)),image[1]).toBe(true);
  }
 }
});
it('preserves branded background colours and is idempotent',()=>{
 const html='<html><head></head><body><table style="background:#27083D;color:#ffffff"><tr><td>Visible white logo</td></tr></table></body></html>';
 const prepared=prepareEmailHtml(html);expect(prepared).toContain('background-image:linear-gradient(#27083D,#27083D)');expect(prepareEmailHtml(prepared)).toBe(prepared);
});
