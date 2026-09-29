import pool from './db-pg';
export const emailExistsSql=`SELECT 1 FROM tenant_enquiries WHERE LOWER(BTRIM(email_1))=$1 OR LOWER(BTRIM(email_2))=$1 UNION ALL SELECT 1 FROM tenants WHERE LOWER(BTRIM(email))=$1 LIMIT 1`;
export class DuplicateEnquiryEmail extends Error { constructor(){super('This email address has already been used. Please contact the office to update your enquiry.');} }
export async function withUniqueEnquiryEmails<T>(values:string[],work:(client:any)=>Promise<T>):Promise<T>{
 const emails=values.map(value=>value.trim().toLowerCase()).sort();
 if(new Set(emails).size!==emails.length)throw new DuplicateEnquiryEmail();
 const client=await pool.connect();try{
  await client.query('BEGIN');
  for(const email of emails)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['public-enquiry-email:'+email]);
  for(const email of emails)if((await client.query(emailExistsSql,[email])).rows.length)throw new DuplicateEnquiryEmail();
  const result=await work(client);await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
