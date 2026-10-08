import {expect,it} from 'vitest';
import {guarantorRequestEmail,guarantorWitnessEmail,guarantorCompletedEmail,guarantorChangesEmail} from './email';
const details={guarantorName:'Robin Taylor',tenantNames:['Zoe Woodberry'],propertyAddress:'99 Ringwood Road, WV10 9ER'};
it('renders the four approved emails without preview claims or unresolved links',()=>{
 const messages=[guarantorRequestEmail({...details,monthlyRent:1100,applicationUrl:'https://example.test/guarantor#secure'}),guarantorWitnessEmail({...details,witnessName:'Morgan Reed',applicationUrl:'https://example.test/guarantor#witness'}),guarantorCompletedEmail({...details,witnessName:'Morgan Reed',tenancyStartDate:'2026-11-06',completedAt:'2026-10-04T12:00:00Z'}),guarantorChangesEmail('Robin Taylor','Replace your proof of address','https://example.test/guarantor#secure')];
 for(const message of messages){expect(message.html).not.toMatch(/\{\{[^}]+\}\}|(?:X|LINKEDIN|YOUTUBE|UNSUBSCRIBE)_LINK|cannot create a legal commitment|test only|signing completed/i);expect(message.html).toContain('fleming-email-canvas');expect(message.html).toContain('viewport');}
 expect(messages[0].html).toContain('£1,100.00');
 expect(messages[2].html).toContain('6 November 2026');
 expect(messages[2].html).toMatch(/Completed:/);
 expect(messages[2].html).not.toContain('Attached:');
 expect(messages[2].html).not.toContain('If you have any questions, reply to this email');
});
it('chooses sole/joint labels and escapes user-supplied values',()=>{
 const sole=guarantorCompletedEmail({...details,witnessName:'Morgan Reed',tenancyStartDate:'2026-11-06',completedAt:'2026-10-04T12:00:00Z'}).html;
 expect(sole).toContain('Tenant:');expect(sole).toContain('Guarantor:');expect(sole).not.toContain('Tenant(s)');
 const joint=guarantorCompletedEmail({...details,tenantNames:['Zoe Woodberry','<Mathew>'],guarantorNames:['Robin Taylor','Alex & Sam'],witnessName:'Morgan Reed',tenancyStartDate:'2026-11-06',completedAt:'2026-10-04T12:00:00Z'}).html;
 expect(joint).toContain('Tenants:');expect(joint).toContain('Guarantors:');expect(joint).toContain('&lt;Mathew&gt;');expect(joint).toContain('Alex &amp; Sam');
 expect(guarantorRequestEmail({...details,tenantNames:['Zoe','Mathew'],monthlyRent:1100,applicationUrl:'https://example.test'}).html).toContain('Zoe and Mathew have');
 expect(guarantorChangesEmail('Robin','<script>alert(1)</script>\nAddress','https://example.test').html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>Address');
});
