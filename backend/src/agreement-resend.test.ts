import {describe,it,expect} from 'vitest';
import {agreementResendRecipient} from './agreement-resend';
const a={status:'pending',requires_landlord_signature:1,requires_joint_tenant_signature:1,landlord_signed_at:null,agreement_details:{landlordSigners:[{id:7,name:'First',slug:'first'},{id:8,name:'Second',slug:'second',signed_at:'2026-09-01'}]}};
describe('individual agreement resend',()=>{
 it('selects only the requested landlord',()=>expect(agreementResendRecipient(a,'landlord:7').owner?.slug).toBe('first'));
 it('rejects strangers and signed landlords',()=>{expect(()=>agreementResendRecipient(a,'landlord:99')).toThrow();expect(()=>agreementResendRecipient(a,'landlord:8')).toThrow('already signed');});
 it('holds tenant invitations until landlords finish',()=>expect(()=>agreementResendRecipient(a,'tenant')).toThrow('All landlords'));
 it('selects the second tenant without targeting the first',()=>expect(agreementResendRecipient({...a,landlord_signed_at:'2026-09-01'},'joint_tenant').key).toBe('joint_tenant'));
 it('rejects signed tenants and completed or void agreements',()=>{expect(()=>agreementResendRecipient({...a,landlord_signed_at:'2026-09-01',tenant_signed_at:'2026-09-02'},'tenant')).toThrow('already signed');for(const status of ['void','completed'])expect(()=>agreementResendRecipient({...a,status},'landlord:7')).toThrow();});
});
