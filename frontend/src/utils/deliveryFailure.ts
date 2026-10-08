export function deliveryFailureReason(error:unknown):string {
 const message=typeof error==='string'?error.trim():'';
 if(/invalid.*(?:phone|number)|not a valid.*number|21211/i.test(message))return 'Invalid phone number — update the number and resend.';
 if(/invalid.*email|email.*invalid|bounc/i.test(message))return 'Invalid email address — update the address and resend.';
 if(/no .*email|missing.*email/i.test(message))return 'No email address is recorded — add one and resend.';
 if(/no .*phone|missing.*phone/i.test(message))return 'No phone number is recorded — add one and resend.';
 return message||'The message could not be delivered. Please try again.';
}
