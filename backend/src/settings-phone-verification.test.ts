import {beforeEach,expect,it,vi} from 'vitest';
import {createHmac,createHash} from 'crypto';
const db=vi.hoisted(()=>({row:null as any,phone:'+447700900000',attempts:0,consumed:false,queries:[] as string[]}));
vi.mock('./db-pg',()=>({default:{},queryOne:vi.fn()}));
vi.mock('./sms',()=>({normalizeUkPhone:(value:string)=>'+'+value.replace(/\D/g,'').replace(/^0/,'44'),sendSecurityCode:vi.fn()}));
import {consumePhoneChallenge,payloadHash,trustedPhone} from './settings-phone-verification';
const req:any={user:{id:3},headers:{authorization:'Bearer session-a'},body:{verification:{challengeId:'11111111-1111-4111-8111-111111111111',codes:['123456']}}};
const payload={version:3,data:{account:'12345678'}};
const client:any={query:async(sql:string)=>{
 db.queries.push(sql);
 if(sql.startsWith('SELECT trusted_phone'))return {rows:[{trusted_phone:db.phone}]};
 if(sql.startsWith('SELECT *'))return {rows:db.row?[{...db.row,attempts:db.attempts,consumed_at:db.consumed?new Date():null}]:[]};
 if(sql.includes('attempts=attempts+1'))db.attempts++;
 if(sql.startsWith('UPDATE settings_phone_challenges SET consumed'))db.consumed=true;
 return {rows:[]};
}};
beforeEach(()=>{
 process.env.JWT_SECRET='test-only-secret';db.phone='+447700900000';db.attempts=0;db.consumed=false;db.queries=[];
 req.body.verification.codes=['123456'];req.headers.authorization='Bearer session-a';
 db.row={id:req.body.verification.challengeId,purpose:'company-settings',session_hash:createHash('sha256').update('Bearer session-a').digest('hex'),payload_hash:payloadHash(payload),trusted_phone:db.phone,valid_time:true,code_hashes:[createHmac('sha256',process.env.JWT_SECRET).update(`${req.body.verification.challengeId}:0:123456`).digest('hex')]};
});
it('consumes the correct code once, within the protected transaction',async()=>{expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(true);expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);expect(db.attempts).toBe(1);});
it('blocks after five wrong codes even if the sixth is correct',async()=>{req.body.verification.codes=['999999'];for(let i=0;i<5;i++)expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);req.body.verification.codes=['123456'];expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);expect(db.attempts).toBe(5);});
it('binds approval to the exact changes and version',async()=>{expect(await consumePhoneChallenge(client,req,'company-settings',{...payload,version:4})).toBe(false);expect(await consumePhoneChallenge(client,req,'company-settings',{version:3,data:{account:'99999999'}})).toBe(false);});
it('rejects another session, purpose, changed phone and expired code',async()=>{req.headers.authorization='Bearer session-b';expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);req.headers.authorization='Bearer session-a';expect(await consumePhoneChallenge(client,req,'staff-trusted-phone',payload)).toBe(false);db.phone='+447700900001';expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);db.phone=db.row.trusted_phone;db.row.valid_time=false;expect(await consumePhoneChallenge(client,req,'company-settings',payload)).toBe(false);});
it('does not allow missing verification',async()=>{expect(await consumePhoneChallenge(client,{...req,body:{}} as any,'company-settings',payload)).toBe(false);});
it('normalises the supplied mobiles and office landline',()=>{expect(trustedPhone('07460874286')).toBe('+447460874286');expect(trustedPhone('44 7817 917355')).toBe('+447817917355');expect(trustedPhone('07754 003068')).toBe('+447754003068');expect(trustedPhone('07961 056812')).toBe('+447961056812');expect(trustedPhone('01902 212 331')).toBe('+441902212331');expect(()=>trustedPhone('123')).toThrow();});
