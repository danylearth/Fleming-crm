const assert=require('assert/strict'),{randomUUID}=require('crypto');const url=new URL(process.env.DATABASE_URL||'');assert(process.env.NODE_ENV==='test'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/fleming_crm_test'));
// Allow individual integration scenarios to exercise provider failures without sending email.
const failedRecipients=new Set((process.env.TEST_EMAIL_FAILURE_RECIPIENTS||'').split(',').filter(Boolean));
const sdk=require('resend');sdk.Resend=class{constructor(){this.emails={send:async payload=>{
  const recipients=Array.isArray(payload.to)?payload.to:[payload.to];
  if(recipients.some(recipient=>failedRecipients.has(recipient)))return {data:null,error:{message:'Simulated email provider failure'}};
  return {data:{id:'isolated-test-'+randomUUID()},error:null};
}};}};
