import {it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn(),queryOne:vi.fn()}));
import {query} from './db-pg';
import {rentReminderRecipients,rentReminderTemplate} from './tenant-message-templates';
it('does not search unrelated tenants when no property or tenancy exists',async()=>{expect(await rentReminderRecipients({id:1})).toEqual([{id:1}]);expect(query).not.toHaveBeenCalled();});
it('scopes joint recipients to the same property and tenancy with reciprocal links',async()=>{vi.mocked(query).mockResolvedValueOnce([{id:2}]);expect(await rentReminderRecipients({id:1,linked_tenant_id:2,property_id:10,tenancy_start_date:'2026-01-01'})).toHaveLength(2);expect(query).toHaveBeenLastCalledWith(expect.stringContaining('linked_tenant_id=$1'),[1,2,10,'2026-01-01']);expect(vi.mocked(query).mock.calls.at(-1)?.[0]).toContain('property_id=$3 AND tenancy_start_date=$4');});
it('personalises both channels and formats outstanding amounts',()=>{const result=rentReminderTemplate({name:'Casey Taylor'},{due_date:'2026-10-05',amount_due:1500,amount_paid:400},'99 Ringwood Road, Wolverhampton, WV10 9ER');expect(result.sms).toContain('Hi Casey,');expect(result.sms).toContain('£1,100.00');expect(result.html).toContain('&pound;1,100.00');});
