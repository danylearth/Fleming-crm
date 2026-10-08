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
it('prepares every template after marketing sanitisation and includes the shared footer in operational emails',()=>{
 for(const template of emailTemplateLibrary()){
  const filled=template.html.replace(/\{\{[A-Z_]+\}\}/g,'Sample');
  const operational=prepareEmailHtml(filled);
  expect(operational,template.id).not.toContain('Unsubscribe from Fleming Lettings marketing emails');
  expect(operational,template.id).not.toContain('content="light dark"');
  expect(operational,template.id).not.toContain('background-color: inherit !important');
  const sent=marketingEmailHtml(cleanMarketingHtml(filled),'https://example.test/preferences');
  expect(sent,template.id).toContain('name="color-scheme"');
  expect(sent,template.id).toContain('background-image:linear-gradient(#27083D,#27083D)');
  expect(sent.match(/id="fleming-email-opt-out"/g),template.id).toHaveLength(1);
  expect(sent,template.id).not.toContain('{{');
  expect(sent,template.id).toContain('<title>');
 }
});
it('wraps standalone user and department signatures and keeps prepared content idempotent',()=>{
 for(const signature of emailSignatures([{id:1,name:'Sample User',email:'sample@example.test',department:'Office',phone:'07700900123'}],1)){
  const html=prepareEmailHtml('<p>Sample message</p>'+signature.html);
  expect(html,signature.id).toContain('<head>');expect(html,signature.id).toContain('name="color-scheme"');
  expect(html,signature.id).toContain('-webkit-text-fill-color:#ffffff');
  expect(html,signature.id).toContain('width="130"');
  expect(html,signature.id).toContain('width:600px; max-width:600px;');
  expect(prepareEmailHtml(html),signature.id).toBe(html);
 }
});
it('preserves original template dimensions and natural button widths through both send paths',()=>{
 for(const template of emailTemplateLibrary()){
  const original=fs.readFileSync(path.join(__dirname,'email-templates',template.id),'utf8');
  const dimensions=(html:string)=>[...html.matchAll(/(?:font-size|line-height|padding|width|height)\s*:\s*[^;"}]+/g)].map(m=>m[0].replace(/\s+/g,""));
  for(const rendered of [template.html,marketingEmailHtml(template.html,'https://example.test/preferences')]){
   expect(rendered,template.id).not.toMatch(/table\s*\{[^}]*width:100%\s*!important/);
   expect(rendered,template.id).not.toContain('table-layout:fixed');
   expect(rendered,template.id).not.toContain('table[width="600"]');
   for(const dimension of dimensions(original))expect(dimensions(rendered),template.id).toContain(dimension);
  }
 }
});
it('removes the earlier layout overrides from saved prepared drafts',()=>{
 const old='<html><head><meta name="fleming-presentation" content="1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>table[width="600"]{width:100%!important}@media(max-width:620px){table{width:100%!important;table-layout:fixed!important}}</style></head><body>Saved draft</body></html>';
 const updated=prepareEmailHtml(old);
 expect(updated).not.toContain('table-layout:fixed');
 expect(updated).toContain('name="fleming-presentation" content="2"');
 expect(prepareEmailHtml(updated)).toBe(updated);
});

it('all action buttons use table-cell padding for Outlook and remain idempotent',()=>{
 for(const t of emailTemplateLibrary()){
  expect(prepareEmailHtml(t.html),t.id).toBe(t.html);
  for(const m of t.html.matchAll(/<td\b([^>]*)>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/td>/gi)){
   if(!/bgcolor=|background(?:-color)?\s*:/i.test(m[1])||!/(?:font-weight\s*:\s*bold|color\s*:\s*#fff)/i.test(m[2]))continue;
   expect(m[1],t.id).toMatch(/padding\s*:\s*\d+px \d+px/);expect(m[2],t.id).not.toMatch(/(?:^|;)\s*padding\s*:/);expect(m[2],t.id).toContain('href=');
  }
 }
});
