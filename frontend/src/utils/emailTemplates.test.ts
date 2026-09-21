import {describe,it,expect} from 'vitest';
import {emailTemplateFields,fillTemplate,resolveKnownEmailImages} from './emailTemplates';
describe('email template composer',()=>{
 it('finds repeated fields once, escapes entered text and leaves missing details visible',()=>{
  const html='<h1>{{FIRST_NAME}}</h1><p>{{ADDRESS}} {{ADDRESS}}</p>';
  expect(emailTemplateFields(html)).toEqual(['FIRST_NAME','ADDRESS']);
  expect(fillTemplate(html,{FIRST_NAME:'A & B',ADDRESS:'<script>'})).toContain('&lt;script&gt;');
  expect(fillTemplate(html,{FIRST_NAME:'Sam'})).toContain('{{ADDRESS}}');
 });
 it('resolves supplied branding assets without guessing unknown image locations',()=>{
  const templates=[{id:'one',label:'one',subject:'one',fields:[],html:'<img src="https://crm.fleminglettings.co.uk/email-assets/logo.png">'}];
  expect(resolveKnownEmailImages('<img src="assets/logo.png"><img src="missing.jpg">',templates)).toBe('<img src="https://crm.fleminglettings.co.uk/email-assets/logo.png"><img src="missing.jpg">');
 });
});
