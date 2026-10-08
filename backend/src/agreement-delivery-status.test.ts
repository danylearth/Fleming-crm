import {it,expect} from 'vitest';
import {agreementDeliveryStatus} from './agreement-delivery-status';
const parties=[{key:'tenant',slug:'tenant-one'},{key:'joint_tenant',slug:'tenant-two'},{key:'landlord:4',slug:'landlord-four'}];
it('marks only the recipient whose invitation bounced',()=>expect(agreementDeliveryStatus(parties,[{id:1,status:'bounced',body_html:'<a href="https://apply.example/tenant-two">Sign</a>'}])).toEqual({joint_tenant:{status:'invalid_email',label:'Invalid email - please update and resend',email:undefined}}));
it('clears an old failure after a newer successful resend and does not mix signing links',()=>expect(agreementDeliveryStatus(parties,[{id:1,status:'bounced',body_html:'/tenant-one"'},{id:2,status:'sent',body_html:'/tenant-one"'},{id:3,status:'failed',body_html:'/tenant-one-new"'}])).toEqual({}));
it('distinguishes invalid email from a temporary service failure',()=>{
 expect(agreementDeliveryStatus(parties,[{id:1,status:'failed',body_html:'/landlord-four"',error_message:'Invalid email address'}])['landlord:4'].status).toBe('invalid_email');
 expect(agreementDeliveryStatus(parties,[{id:1,status:'failed',body_html:'/landlord-four"',error_message:'Service timeout'}])['landlord:4'].status).toBe('failed');
});
