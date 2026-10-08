import {it,expect} from 'vitest';
import {deliveryFailureReason} from './deliveryFailure';
it('explains invalid recipient details without exposing raw provider text',()=>{
 expect(deliveryFailureReason("Invalid 'To' Phone Number: +44770090XXXX")).toBe('Invalid phone number — update the number and resend.');
 expect(deliveryFailureReason('Email bounced')).toBe('Invalid email address — update the address and resend.');
 expect(deliveryFailureReason('Temporary provider outage')).toBe('Temporary provider outage');
});
