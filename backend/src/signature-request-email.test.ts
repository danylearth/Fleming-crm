import {it,expect} from 'vitest';
import {signatureRequestEmail,signatureRequestPreview,inlineEmailImages} from './email';
it('uses the supplied signature email design and escapes editable text',()=>{
 const html=signatureRequestEmail('Alex<Morgan>','Inventory & Keys','Please review.\nThank you <script>','https://crm.fleminglettings.co.uk/sign-document/test');
 expect(html).toContain('Hi there Alex&lt;Morgan&gt;');expect(html).toContain('Inventory &amp; Keys');expect(html).toContain('Please review.<br>Thank you &lt;script&gt;');expect(html).toContain('https://crm.fleminglettings.co.uk/sign-document/test');expect(html).toContain('signature-request-band.png');expect(html).not.toMatch(/RECIPIENT NAME|DOCUMENT NAME|FREE TEXT|\{\{/);
 expect(inlineEmailImages(html).attachments.filter(a=>!a.filename.startsWith('social-')).map(a=>a.filename).sort()).toEqual(['signature-request-band.png','signature-request-logo.png']);
});
it('renders the same template in preview with embedded assets and no live signing token',()=>{const html=signatureRequestPreview('Alex','Inventory','Please review');expect(html).toContain('data:image/png;base64,');expect(html).toContain('#preview-only');expect(html).not.toContain('cid:');});
it('greets the recipient by first name in both the sent email and preview, omitting titles and other names',()=>{
 for(const name of ['William Alan Rushforth',' Mr. William Alan Rushforth ']){
  for(const html of [signatureRequestEmail(name,'Inventory','','https://example.com/sign'),signatureRequestPreview(name,'Inventory','')]){
   expect(html).toContain('Hi there William,');expect(html).not.toContain('Alan Rushforth');expect(html).not.toContain('Mr. William');
  }
 }
});
