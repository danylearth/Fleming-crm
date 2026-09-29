import type {AgreementBankDetails} from './tenancy-agreement-pdf';

export function normaliseAgreementAccount(value:any):AgreementBankDetails {
 const accountName=String(value?.accountName||'').trim();
 const sortCode=String(value?.sortCode||'').replace(/[ -]/g,'');
 const accountNumber=String(value?.accountNumber||'').trim();
 if(!accountName||accountName.length>150||!/^\d{6}$/.test(sortCode)||!/^\d{8}$/.test(accountNumber))throw Error('Enter an account name, six-digit sort code and eight-digit account number');
 return {accountName,sortCode:sortCode.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),accountNumber,bankName:String(value?.bankName||'').trim().slice(0,150)};
}
export function sameAgreementAccount(a:AgreementBankDetails|null,b:AgreementBankDetails|null):boolean {
 if(!a||!b)return a===b;
 return a.accountName===b.accountName&&a.sortCode.replace(/-/g,'')===b.sortCode.replace(/-/g,'')&&a.accountNumber===b.accountNumber;
}
export function confirmedAgreementPayment(saved:any,serviceType:string,suggested:AgreementBankDetails|null){
 if(!saved?.confirmedAt||saved.serviceType!==serviceType)return null;
 try{
  const account=normaliseAgreementAccount(saved.account);
  if(saved.override===true)return account;
  return sameAgreementAccount(account,suggested)?account:null;
 }catch{return null;}
}
export function defaultAgreementPaymentInstructions(serviceType:string|null|undefined):string {
 return serviceType==='let_only'?'Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments will then be paid directly to the Landlord’s nominated account below.':'Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments continue to be paid into the client money account.';
}
