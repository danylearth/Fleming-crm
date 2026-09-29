import {it,expect,vi,beforeEach} from 'vitest';
const queryOne=vi.hoisted(()=>vi.fn());
vi.mock('./db-pg',()=>({queryOne}));
import {emailPreferencesUrl} from './email-preferences';
beforeEach(()=>queryOne.mockReset());
it('uses the stored recipient token without resetting consent or opt-outs',async()=>{
 queryOne.mockResolvedValue({unsubscribe_token:'existing-token'});
 expect(await emailPreferencesUrl(' Person@Example.test ')).toContain('/api/public/marketing/unsubscribe/existing-token');
 const [sql,values]=queryOne.mock.calls[0];expect(values[0]).toBe('person@example.test');expect(sql).toContain("VALUES('email',$1,FALSE");expect(sql.split('ON CONFLICT')[1]).not.toMatch(/SET\s+(allowed|unsubscribe_token|evidence)/i);
});
it('does not send a broken preferences URL or accept an invalid recipient',async()=>{
 await expect(emailPreferencesUrl('invalid')).rejects.toThrow('Invalid email');expect(queryOne).not.toHaveBeenCalled();
 queryOne.mockResolvedValue(null);await expect(emailPreferencesUrl('a@example.test')).rejects.toThrow('Could not create');
});
