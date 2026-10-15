import {normalizePropertyAddress} from './property-address';
import type {PoolClient} from 'pg';
import {getCompanySettings} from './company-settings';
import {clientAgreementContext,validateClientDetails} from './client-agreement-details';
import {generateTenancyAgreementPdf,resolveAgreementType,resolvePaymentRoute,bankDetailsForRoute,type TenancyAgreementPdfInput} from './tenancy-agreement-pdf';
import {generateGuarantorDeed,markUnsignedTenancy,type GuaranteeParticulars} from './guarantor-deed-pdf';
import {prepareGuarantorExecution} from './guarantor-execution';
import {dateOnly} from './tenant-lifecycle';

export async function guarantorTenancyContext(client:PoolClient,enquiryId:number){
 const e=(await client.query(`SELECT e.*,p.address AS property_address,p.postcode AS property_postcode,p.service_type,p.has_gas,p.landlord_id,l.name AS landlord_name,l.landlord_type,l.home_address,l.address AS landlord_address,l.email AS landlord_email,l.phone AS landlord_phone
  FROM tenant_enquiries e JOIN properties p ON p.id=e.linked_property_id JOIN landlords l ON l.id=p.landlord_id WHERE e.id=$1`,[enquiryId])).rows[0];
 if(!e)throw Error('Link the applicant to a property and landlord first');
 const joint=e.joint_partner_id?(await client.query('SELECT * FROM tenant_enquiries WHERE id=$1',[e.joint_partner_id])).rows[0]:null;
 if(e.joint_partner_id&&(!joint||joint.linked_property_id!==e.linked_property_id))throw Error('Confirm both joint applicants and their property');
 const applicants=[e,...joint?[joint]:[]].sort((a,b)=>a.id-b.id);
 const tenants=applicants.map(person=>({name:[...(person.id===Math.min(...applicants.map(a=>a.id))?[person.title_1]:[]),person.first_name_1,person.last_name_1].filter(Boolean).join(' '),email:person.email_1,phone:person.phone_1,address:person.current_address_1}));
 if(!joint&&(e.first_name_2||e.last_name_2))tenants.push({name:[e.title_2,e.first_name_2,e.last_name_2].filter(Boolean).join(' '),email:e.email_2,phone:e.phone_2,address:e.current_address_2});
 const start=dateOnly(e.app_form_data?.tenancy_start_date),rent=Number(e.monthly_rent_agreed),deposit=Number(e.security_deposit_amount);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(rent)||rent<=0||e.security_deposit_amount===null||!Number.isFinite(deposit)||deposit<0)throw Error('Save the proposed tenancy start date, monthly rent and deposit before inviting the guarantor');
 const company=(await getCompanySettings()).data,agreementType=resolveAgreementType(e.landlord_type),paymentRoute=resolvePaymentRoute(agreementType,e.service_type);
 const context=agreementType==='client'?await clientAgreementContext(enquiryId):null;
 if(context){const error=validateClientDetails(context.details,context.isCompany);if(error)throw Error(error);}
 const landlord=agreementType==='internal'?{name:company.legalName,email:company.email,phone:company.phone,address:company.registeredAddress,serviceAddress:company.registeredAddress,emergencyContact:company.phone}:context?{name:context.details.landlordName,email:context.details.landlordEmail,phone:context.details.landlordPhone,address:context.details.landlordAddress,serviceAddress:context.details.serviceAddress,emergencyContact:context.details.emergencyContact,companyNumber:context.details.companyNumber,signingName:context.details.directorName}:null;
 if(!landlord)throw Error('Confirm the landlord details before preparing the deed');
 const bankDetails=context?.paymentAccount||bankDetailsForRoute(paymentRoute,{sortCode:context?.bank?.sort_code,accountNumber:context?.bank?.account_number,accountName:context?.bank?.account_name,bankName:context?.bank?.bank_name},company);
 const input:TenancyAgreementPdfInput={companySettings:company,enquiryId,agreementType,serviceType:e.service_type,agreementDate:new Date(start+'T12:00:00Z'),tenancyStartDate:new Date(start+'T12:00:00Z'),rent,deposit,propertyAddress:normalizePropertyAddress(e.property_address,e.property_postcode),hasGas:Boolean(e.has_gas),landlord,tenants,
  holdingDeposit:e.source_tenant_id?0:Number(e.holding_deposit_received_amount||e.holding_deposit_amount||0),depositScheme:context?.details.depositScheme||'',
  permittedOccupiers:'To be confirmed during tenancy onboarding',sharedFacilities:'To be confirmed during tenancy onboarding',parking:'To be confirmed during tenancy onboarding',
  paymentReference:`${String(e.property_address||'').match(/^\s*\d+[A-Za-z]?/)?.[0]?.trim()||'PROPERTY'} ${String(e.property_postcode||'').replace(/\s/g,'').toUpperCase()} - ${String(e.last_name_1||'TENANT').toUpperCase()}`,bankDetails,paymentRoute,complianceDocuments:[]};
 const particulars:GuaranteeParticulars={tenantNames:tenants.map(person=>person.name),landlord:landlord.name,landlordType:e.landlord_type,landlordAddress:landlord.serviceAddress,officeAddress:company.registeredAddress,serviceType:e.service_type,propertyAddress:input.propertyAddress,startDate:start,monthlyRent:rent,deposit};
 return {enquiry:e,applicants,input,particulars};
}

export async function prepareApplicationDeed(client:PoolClient,verification:any){
 const context=await guarantorTenancyContext(client,verification.enquiry_id);
 const unsigned=await markUnsignedTenancy(await generateTenancyAgreementPdf(context.input));
 const deed=await generateGuarantorDeed(verification.form,context.particulars,unsigned);
 const tenancy={...context.particulars,agreementInput:context.input,tenancyHash:deed.tenancyHash,deedVersion:deed.version};
 return prepareGuarantorExecution(client,verification.id,{pdf:deed.pdf,fields:deed.fields,form:verification.form,tenancy});
}
