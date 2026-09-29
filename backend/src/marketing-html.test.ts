import {describe,it,expect} from 'vitest';
import {cleanMarketingHtml,marketingEmailHtml,marketingRecipientHtml} from './marketing-html';
describe('uploaded marketing HTML',()=>{
 it('keeps email layouts and strips scripts, event handlers and executable links',()=>{
  const html=cleanMarketingHtml('<html><body><script>alert(1)</script><table><tr><td style="color:red">Hello<img src="https://example.test/logo.png" onerror="alert(1)"></td></tr></table><a href="javascript:alert(1)">Bad link</a><form action="https://example.test"><input></form></body></html>');
  expect(html).toContain('<table>');expect(html).toContain('color:red');expect(html).toContain('https://example.test/logo.png');
  for(const unsafe of ['<script','onerror','javascript:','<form','<input'])expect(html).not.toContain(unsafe);
 });
 it('includes a usable unsubscribe link inside the email body',()=>{
  const html=marketingEmailHtml('<html><body><h1>News</h1></body></html>','https://example.test/unsubscribe/abc');
  expect(html).toContain('href="https://example.test/unsubscribe/abc"');expect(html.indexOf('to unsubscribe from our emails')).toBeLessThan(html.indexOf('</body>'));
 });
 it('personalises an uploaded landlord greeting and resolves its existing footer without duplicates',()=>{
  const source='<html><body><p>Hi there LANDLORD NAME,</p><a href="X_LINK">X</a><a href="LINKEDIN_LINK">LinkedIn</a><a href="YOUTUBE_LINK">YouTube</a><table><tr><td>This email and any attachments are confidential</td></tr><tr><td>If you would no longer like to hear from us, please <a href="UNSUBSCRIBE_LINK">click here</a> to unsubscribe from our emails.</td></tr></table></body></html>';
  for(const draft of [source,cleanMarketingHtml(source)]){
   const html=marketingRecipientHtml(draft,'Ms. Alex Example','https://example.test/preferences/recipient');
   expect(html).toContain('Hi there Alex,');
   expect(html).not.toMatch(/LANDLORD NAME|X_LINK|LINKEDIN_LINK|YOUTUBE_LINK|UNSUBSCRIBE_LINK|\{\{FIRST_NAME\}\}/);
   expect(html).toContain('https://x.com/FlemingLettings');
   expect(html).toContain('https://www.linkedin.com/company/fleming-lettings');
   expect(html).toContain('https://www.youtube.com/@FlemingLettings');
   expect(html).toContain('href="https://example.test/preferences/recipient"');
   expect(html.match(/If you would no longer like to hear from us/g)).toHaveLength(1);
  }
 });
 it('escapes the recipient name and supports an absent first name',()=>{
  expect(marketingRecipientHtml('<p>Hi there LANDLORD NAME,</p>','<Alex> Example','https://example.test/unsubscribe')).toContain('Hi there &lt;Alex&gt;,');
  expect(marketingRecipientHtml('<p>Hi there LANDLORD NAME,</p>','','https://example.test/unsubscribe')).toContain('Hi there there,');
 });
});
