import fs from 'node:fs';
import path from 'node:path';
import type {AgreementBankDetails} from './tenancy-agreement-pdf';

export interface CompanySettings {
  legalName:string; companyNumber:string; registeredAddress:string;
  email:string; phone:string; website:string; vatNumber:string;
  cmp:{provider:string;number:string;expiry:string};
  redress:{provider:string;number:string;expiry:string};
  operatingAccount:AgreementBankDetails; clientAccount:AgreementBankDetails;
  signer:{userId:number|null;name:string;title:string;signature:string};
}
export const COMPANY_DEFAULTS:Omit<CompanySettings,'signer'> = {
  legalName:'Fleming Lettings & Developments UK Limited',companyNumber:'13943597',
  registeredAddress:'Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, WV10 9TG',
  email:'enquiries@fleminglettings.co.uk',phone:'01902 212 415',website:'fleminglettings.co.uk',vatNumber:'',
  cmp:{provider:'Client Money Protect',number:'CMP012565',expiry:'2026-12-07'},
  redress:{provider:'Property Redress Scheme',number:'PRS042592',expiry:''},
  operatingAccount:{sortCode:'20-08-64',accountNumber:'53346137',accountName:'Fleming Lettings & Developments UK Limited',bankName:'Barclays Bank PLC'},
  clientAccount:{sortCode:'20-08-64',accountNumber:'03803880',accountName:'Fleming Lettings & Developments UK Limited',bankName:'Barclays Bank PLC'},
};
export function defaultCompanySettings():CompanySettings {
  return {...JSON.parse(JSON.stringify(COMPANY_DEFAULTS)),signer:{userId:null,name:'Robert Fleming',title:'Managing Director',signature:'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'agreement-assets/robert-fleming-signature.png')).toString('base64')}};
}
