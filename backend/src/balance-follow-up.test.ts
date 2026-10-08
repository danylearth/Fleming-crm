import {it,expect,vi,beforeEach} from 'vitest';
const {query,release}=vi.hoisted(()=>({query:vi.fn(),release:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:async()=>({query,release})}}));
import {saveBalanceFollowUp} from './balance-follow-up';
const user={id:1,name:'Administrator',email:'admin@example.test'};
beforeEach(()=>{vi.clearAllMocks();query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM tenant_enquiries')?[{id:83,first_name_1:'Jamie',last_name_1:'Taylor',balance_payment_received:0}]:[]}));});
it('saves joint notes privately and assigns a dated payment reminder to the staff user',async()=>{
 await saveBalanceFollowUp([83,84],'2026-10-03','Check bank before chasing',user);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE tenant_enquiries SET balance_follow_up_date'),['2026-10-03','Check bank before chasing',[83,84]]);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'),[expect.stringContaining('Jamie Taylor'),expect.stringContaining('Check bank before chasing'),83,'2026-10-03','Administrator']);
 expect(query).toHaveBeenCalledWith('COMMIT');expect(release).toHaveBeenCalled();
});
it('does not create a chase reminder after payment has been received',async()=>{
 query.mockResolvedValue({rows:[{id:83,balance_payment_received:1}]});
 await expect(saveBalanceFollowUp([83],'2026-10-03','',user)).rejects.toThrow('already been received');
 expect(query).toHaveBeenCalledWith('ROLLBACK');expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO tasks'))).toBe(false);
});
