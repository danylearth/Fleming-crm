import {agreementLandlords} from './tenancy-landlord-signers';
export function agreementResendRecipient(agreement:any,key:unknown){
 if(agreement.status==='void'||agreement.status==='completed')throw Error('This agreement is no longer awaiting signatures');
 if(key==='tenant'||key==='joint_tenant'){
  if(key==='joint_tenant'&&!agreement.requires_joint_tenant_signature)throw Error('This agreement has no second tenant');
  if(agreement.requires_landlord_signature&&!agreement.landlord_signed_at)throw Error('All landlords must sign before a tenant invitation can be resent');
  if(agreement[`${key}_signed_at`])throw Error('This person has already signed');
  return {key,kind:'tenant' as const};
 }
 if(!agreement.requires_landlord_signature)throw Error('Choose a recipient on this agreement');
 const owners=agreementLandlords(agreement.agreement_details);
 const owner=owners.find(p=>`landlord:${p.id}`===key);
 if(owner){if(owner.signed_at)throw Error('This person has already signed');return {key:String(key),kind:'landlord' as const,owner};}
 if(key==='landlord'&&!owners.length){
  if(agreement.landlord_signed_at)throw Error('This person has already signed');
  const details=typeof agreement.agreement_details==='string'?JSON.parse(agreement.agreement_details):agreement.agreement_details||{};
  return {key,kind:'landlord' as const,owner:{id:0,name:details.landlordName,email:details.landlordEmail,phone:details.landlordPhone,slug:agreement.landlord_slug||agreement.landlord_token}};
 }
 throw Error('Choose a recipient on this agreement');
}
