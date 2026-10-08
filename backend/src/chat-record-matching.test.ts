import {it,expect,vi} from 'vitest';
vi.mock('./db-pg',()=>({query:vi.fn()}));
import {phoneMatchVariants,uniqueChatContact,findChatContact} from './chat-record-matching';
import {query} from './db-pg';
it('matches local, international and UK optional-zero formats without matching empty numbers',()=>{
 for(const phone of ['07460 874286','+44 7460 874286','00447460874286','+44 (0)7460 874286'])expect(phoneMatchVariants(phone)).toContain('07460874286');
 expect(phoneMatchVariants('')).toEqual([]);
 expect(phoneMatchVariants('+12025550123')).toEqual(['12025550123','0012025550123']);
});
it('deduplicates matches within one record but never guesses between different records',()=>{
 const sam={entity_type:'user',entity_id:3,name:'Sam Fleming'};
 expect(uniqueChatContact([sam,sam])).toEqual(sam);
 expect(uniqueChatContact([sam,{...sam,entity_type:'tenant'}])).toBeNull();
 expect(uniqueChatContact([])).toBeNull();
});
it('looks up names using the actual sender number and skips converted enquiry copies',async()=>{
 vi.mocked(query).mockResolvedValue([{entity_type:'tenant',entity_id:4,name:'Known Tenant'}]);
 expect(await findChatContact('+447460874286')).toMatchObject({name:'Known Tenant'});
 expect(vi.mocked(query).mock.calls[0][1]).toEqual([phoneMatchVariants('+447460874286')]);
 expect(vi.mocked(query).mock.calls[0][0]).toContain("status NOT IN ('converted'");
});
