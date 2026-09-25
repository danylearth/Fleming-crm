import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {emailTemplateLibrary} from './message-template-library';
import {prepareEmailHtml} from './email-presentation';
import {cleanMarketingHtml,marketingEmailHtml} from './marketing-html';
import {emailSignatures} from './marketing-files';
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
it('prepares every template after marketing sanitisation and keeps operational emails free of marketing footers',()=>{
 for(const template of emailTemplateLibrary()){
  const filled=template.html.replace(/\{\{[A-Z_]+\}\}/g,'Sample');
  const operational=prepareEmailHtml(filled);
  expect(operational,template.id).not.toContain('Unsubscribe from Fleming Lettings marketing emails');
  expect(operational,template.id).not.toContain('content="light dark"');
  expect(operational,template.id).not.toContain('background-color: inherit !important');
  const sent=marketingEmailHtml(cleanMarketingHtml(filled),'https://example.test/preferences');
  expect(sent,template.id).toContain('name="color-scheme"');
  expect(sent,template.id).toContain('background-image:linear-gradient(#27083D,#27083D)');
  expect(sent.match(/Unsubscribe from Fleming Lettings marketing emails/g),template.id).toHaveLength(1);
  expect(sent,template.id).not.toContain('{{');
  expect(sent,template.id).toContain('<title>');
 }
});
it('wraps standalone user and department signatures and keeps prepared content idempotent',()=>{
 for(const signature of emailSignatures([{id:1,name:'Sample User',email:'sample@example.test',department:'Office',phone:'07700900123'}],1)){
  const html=prepareEmailHtml('<p>Sample message</p>'+signature.html);
  expect(html,signature.id).toContain('<head>');expect(html,signature.id).toContain('name="color-scheme"');
  expect(html,signature.id).toContain('-webkit-text-fill-color:#ffffff');
  expect(html,signature.id).not.toContain('width="130"');
  expect(prepareEmailHtml(html),signature.id).toBe(html);
 }
});
