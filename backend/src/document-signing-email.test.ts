import {it,expect} from 'vitest';
import {completedDocumentEmail,inlineEmailImages} from './email';
import {addEmailFooter} from './email-footer';
it('uses the supplied completed-document design with escaped values and all supplied images',()=>{
 const message=completedDocumentEmail('Mr. Sam Fleming','Inventory & <Keys>.pdf','2026-09-28T10:00:00Z','21a Northwood Park Road');
 expect(message.html).toContain('All done Sam!');expect(message.html).toContain('Inventory &amp; &lt;Keys&gt; - 21a Northwood Park Road');expect(message.html).toContain('28/09/2026');
 expect(message.html).not.toMatch(/FIRSTNAME|DOCUMENT NAME|PROPERTY ADDRESS|DATE SIGNED|X_LINK|LINKEDIN_LINK|YOUTUBE_LINK|UNSUBSCRIBE_LINK|\{\{/);
 const final=addEmailFooter(message.html,'https://example.test/preferences');expect(final.match(/id="fleming-email-opt-out"/g)).toHaveLength(1);expect(final).toContain('https://example.test/preferences');
 expect(inlineEmailImages(final).attachments).toHaveLength(7);
 expect(inlineEmailImages(final).attachments.every(a=>a.content.length>0)).toBe(true);
});
it('does not duplicate a property already in the document name or invent an address',()=>{
 expect(completedDocumentEmail('Sam','Inventory - 21a Northwood Park Road','2026-09-28','21a Northwood Park Road, Wolverhampton').subject).toBe('Your signed document - Inventory - 21a Northwood Park Road');
 const html=completedDocumentEmail('Sam','Service contract','2026-09-28').html;expect(html).toContain('Service contract');expect(html).not.toContain('PROPERTY ADDRESS');
});
