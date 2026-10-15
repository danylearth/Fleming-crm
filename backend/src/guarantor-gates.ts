import type {PoolClient} from 'pg';
import {isDeepStrictEqual} from 'node:util';
import {guarantorTenancyContext} from './guarantor-tenancy';

// Called while the applicant rows are locked by the business operation.
export async function assertGuarantorsReady(client:PoolClient,ids:number[],allowIssuedLegacy=false){
 const rows=(await client.query(`SELECT e.id,e.guarantor_required,g.id AS verification_id,g.status,g.workflow,x.status AS execution_status,x.signed_pdf
  FROM tenant_enquiries e LEFT JOIN guarantor_verifications g ON g.enquiry_id=e.id LEFT JOIN guarantor_executions x ON x.id=g.execution_id WHERE e.id=ANY($1::int[])`,[ids])).rows;
 let legacy=false;
 if(allowIssuedLegacy)legacy=!!(await client.query("SELECT id FROM tenancy_agreements WHERE enquiry_id=ANY($1::int[]) AND status<>'void' AND NOT(agreement_details ? 'guarantorWorkflowVersion') LIMIT 1",[ids])).rowCount;
 if(rows.length!==ids.length)throw Error('Confirm every applicant before continuing');
 for(const row of rows){
  if(row.guarantor_required==null&&!(legacy&&!row.verification_id))throw Error('Confirm whether each applicant requires a guarantor');
  if(row.guarantor_required===true&&(row.status!=='verified'||row.execution_status!=='completed'||!row.signed_pdf||row.workflow?.deedNeedsResigning||row.workflow?.reviewStatus!=='approved'||!row.workflow?.credit?.credit_check_completed))throw Error('Complete the guarantor application review, credit check and witnessed deed for each applicant first');
 }
}

export async function assertCurrentGuarantorTerms(client:PoolClient,verificationId:number){
 const row=(await client.query('SELECT g.enquiry_id,x.tenancy_snapshot FROM guarantor_verifications g JOIN guarantor_executions x ON x.id=g.execution_id WHERE g.id=$1',[verificationId])).rows[0];
 if(!row?.tenancy_snapshot?.agreementInput)return;
 const current=await guarantorTenancyContext(client,row.enquiry_id),stored=row.tenancy_snapshot;
 // Formatting and generated timestamps are not obligations; the frozen agreement
 // inputs and particulars otherwise have to match the reviewed source.
 const normalized=(input:any)=>{const copy=JSON.parse(JSON.stringify(input));delete copy.enquiryId;delete copy.agreementDate;return copy;};
 if(!isDeepStrictEqual(normalized(current.input),normalized(stored.agreementInput)))throw Error('The proposed tenancy has changed since this deed was prepared. The office must arrange an updated deed before signing');
}

export async function assertIssuedAgreementMatchesGuarantees(client:PoolClient,ids:number[],details:any,tenantNames:string[],propertyAddress:string){
 await assertGuarantorsReady(client,ids,true);
 const rows=(await client.query('SELECT g.id,x.tenancy_snapshot FROM guarantor_verifications g JOIN guarantor_executions x ON x.id=g.execution_id JOIN tenant_enquiries e ON e.id=g.enquiry_id WHERE e.id=ANY($1::int[]) AND e.guarantor_required=TRUE',[ids])).rows;
 const text=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
 for(const row of rows){
  await assertCurrentGuarantorTerms(client,row.id);
  const saved=row.tenancy_snapshot,source=saved.agreementInput;
  // The deed fixes the tenancy's parties, address, start date, rent and deposit.
  // The issued APT completes the tenant-signing presentation and may add the
  // occupier, facilities and parking particulars. Payment-display fields are
  // not terms of the guarantee and must never prevent that APT being issued.
  if(saved.startDate!==details.tenancyStartDate||Number(saved.monthlyRent)!==Number(details.rent)||Number(saved.deposit)!==Number(details.deposit)||text(saved.landlord)!==text(details.landlordName)||text(saved.propertyAddress)!==text(propertyAddress)||JSON.stringify([...saved.tenantNames].map(text).sort())!==JSON.stringify([...tenantNames].map(text).sort()))throw Error('The tenancy agreement differs from the terms in the signed guarantee. Arrange an updated guarantee before issuing this agreement');
 }
}
