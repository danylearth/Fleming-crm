import {describe,it,expect} from 'vitest';
import {cleanMarketingHtml,marketingEmailHtml} from './marketing-html';
describe('uploaded marketing HTML',()=>{
 it('keeps email layouts and strips scripts, event handlers and executable links',()=>{
  const html=cleanMarketingHtml('<html><body><script>alert(1)</script><table><tr><td style="color:red">Hello<img src="https://example.test/logo.png" onerror="alert(1)"></td></tr></table><a href="javascript:alert(1)">Bad link</a><form action="https://example.test"><input></form></body></html>');
  expect(html).toContain('<table>');expect(html).toContain('color:red');expect(html).toContain('https://example.test/logo.png');
  for(const unsafe of ['<script','onerror','javascript:','<form','<input'])expect(html).not.toContain(unsafe);
 });
 it('includes a usable unsubscribe link inside the email body',()=>{
  const html=marketingEmailHtml('<html><body><h1>News</h1></body></html>','https://example.test/unsubscribe/abc');
  expect(html).toContain('href="https://example.test/unsubscribe/abc"');expect(html.indexOf('Unsubscribe')).toBeLessThan(html.indexOf('</body>'));
 });
});
