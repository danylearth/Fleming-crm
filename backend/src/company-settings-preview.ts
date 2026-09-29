import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {generateTenancyAgreementPdf} from './tenancy-agreement-pdf';
import {servicePdf} from './service-agreement-pdf';
import {finalBalanceHandoverEmail} from './email';
import type {CompanySettings} from './company-settings-values';
export const companyPreviewKinds=['apt','apt-client','apt-let-only','service','service-rent-collection','service-let-only','balance-operating','balance-client'] as const;
export type CompanyPreviewKind=typeof companyPreviewKinds[number];
export function companyMessagePreview(data:CompanySettings,kind:'balance-operating'|'balance-client') {
 return finalBalanceHandoverEmail({firstName:'Alex',propertyAddress:'1 Example Road, Wolverhampton, WV1 1AA',securityDeposit:900,monthlyRent:800,holdingDeposit:150,balanceDue:1550,bankDetails:kind==='balance-operating'?data.operatingAccount:data.clientAccount,paymentReference:'EXAMPLE ONLY'});
}
export async function companySettingsPreview(data:CompanySettings,kind:CompanyPreviewKind):Promise<Buffer> {
 const date=new Date();date.setUTCHours(12,0,0,0);
 const isApt=kind.startsWith('apt'),internal=kind==='apt',letOnly=kind==='apt-let-only';
 const exampleBank={accountName:'Example Landlord',bankName:'Example Bank',sortCode:'00-00-00',accountNumber:'00000000'};
 const bytes=isApt?await generateTenancyAgreementPdf({companySettings:data,enquiryId:0,agreementType:internal?'internal':'client',serviceType:internal?undefined:letOnly?'let_only':'full_management',agreementDate:date,tenancyStartDate:date,rent:800,deposit:900,propertyAddress:'1 Example Road, Wolverhampton, WV1 1AA',hasGas:true,landlord:internal?{name:data.legalName,address:data.registeredAddress,email:data.email,phone:data.phone}:{name:'Example Landlord',address:'2 Sample Road',email:'landlord@example.test',phone:'07700 900001'},tenants:[{name:'Alex Example',email:'alex@example.test',phone:'07700 900000',address:'2 Sample Road'}],paymentReference:'EXAMPLE ONLY',bankDetails:internal?data.operatingAccount:letOnly?exampleBank:data.clientAccount,paymentRoute:internal?'fleming_operating':letOnly?'landlord':'fleming_client_money',complianceDocuments:[]}):await servicePdf({service_type:kind==='service-let-only'?'let_only':kind==='service-rent-collection'?'rent_collection':'full_management',setup_fee:50,monthly_fee:10,details:{companySettings:data,agreement_date:date.toISOString().slice(0,10),landlord_name:'Alex Example',landlord_address:'2 Sample Road, Wolverhampton, WV1 1AA',landlord_email:'alex@example.test',landlord_phone:'07700 900000',property_address:'1 Example Road, Wolverhampton, WV1 1AA',asking_rent:800,entity_type:'individual'},bank_details:{account_name:'Example Landlord',bank_name:'Test Bank',sort_code:'00-00-00',account_number:'00000000'}});
 const pdf=await PDFDocument.load(bytes),font=await pdf.embedFont(StandardFonts.HelveticaBold);
 for(const page of pdf.getPages()){page.drawRectangle({x:0,y:0,width:page.getWidth(),height:22,color:rgb(1,.95,.8)});page.drawText('TEST PREVIEW - SAMPLE DATA - NOT FOR SIGNING',{x:40,y:8,size:10,font,color:rgb(.5,.1,.2)});}
 return Buffer.from(await pdf.save());
}
