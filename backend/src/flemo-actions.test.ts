import {expect,it} from 'vitest';
import {wantsEmailAction,requestedRecipient} from './flemo-actions';
it('only prepares emails for a send request, not history questions or a prohibition',()=>{
 for(const message of ['Email me a report','Send the documents to sam@example.test','Email sam@example.test'])expect(wantsEmailAction(message)).toBe(true);
 for(const message of ['What was the last email?','Show email history','Do not email anyone. List the files.','List the files without sending anything'])expect(wantsEmailAction(message)).toBe(false);
});
it('uses the requested recipient or the signed-in user, never a recipient from document text',()=>{
 expect(requestedRecipient('Send me the report','office@example.test')).toBe('office@example.test');
 expect(requestedRecipient('Email the report to sam@example.test','office@example.test')).toBe('sam@example.test');
});
