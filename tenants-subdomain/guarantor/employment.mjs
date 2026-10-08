const yesNo=['Yes','No'];
export const choices={employment:['Employed','Part-time Employed','Self-Employed','Retired'],businessType:['Sole Trader','Contractor','Limited Company'],employmentFurtherInfo:yesNo,selfAssessments:yesNo,provideAccountant:yesNo,additionalIncome:yesNo,hasLoans:yesNo,hasCreditCards:yesNo,legalProceedings:yesNo,referenceAuthority:yesNo,hasEmployerReference:yesNo,hasPersonalReference:yesNo};
const referenceFields=label=>[['reference',label+' Name/Department'],['referencePhone','Contact Number','tel'],['referenceEmail','Email Address','email'],['employeeId','Employee ID/Reference','text',undefined,false],['referenceAuthority','I understand that Fleming Lettings needs to contact this referee to verify my employment or income, and I authorise that contact for my guarantor application.','checkbox']];
export function fieldsFor(group,form){if(!['Employment & Income','Financial Details','Bank Details','References'].includes(group.title))return group.fields;const status=choices.employment.includes(form.employment)?form.employment:'';
 if(group.title==='Employment & Income'){
  const fields=[['employment','Employment Status','select']];
  if(['Employed','Part-time Employed'].includes(status)){fields.push(['employer','Name of Employer'],['jobTitle','Job Title'],['employmentStart','Start Date With Employer','date'],['department','Department'],['employerAddressLine1','First Line of Employer Address'],['employerCity','Town/City'],['employerPostcode','Postcode']);}
  if(status==='Self-Employed'){fields.push(['businessType','How are you self-employed?','choice']);if(['Sole Trader','Limited Company'].includes(form.businessType)){fields.push(['businessName','Business Name']);if(form.businessType==='Limited Company')fields.push(['companyNumber','Company Number']);fields.push(['yearsTrading','Years Trading','nonnegative']);}if(form.businessType==='Contractor')fields.push(['contractLength','Length of Employment']);fields.push(['selfAssessments','Have you completed previous self-assessments?','choice'],['provideAccountant','Would you like to provide accountant details?','choice']);if(form.provideAccountant==='Yes')fields.push(['accountantDetails','Accountant Details','textarea']);}
  if(status==='Retired')fields.push(['pensionProvider','Pension Provider'],['pensionType','Type of Pension']);
  return fields;
 }
 if(!status)return [];
 if(group.title==='Bank Details')return [['bankAccountName','Account Name'],['bankSort','Sort Code','sortcode'],['bankAccount','Account Number','accountnumber']];
 if(group.title==='Financial Details')return [
  ['income','Gross Annual Income (£)','money'],
  ...(['Employed','Part-time Employed'].includes(status)?[['employmentFurtherInfo','Is there any further information you would like to provide us with regarding this employment?','choice'],...(form.employmentFurtherInfo==='Yes'?[['employmentFurtherDetails','Further Employment Information','textarea']]:[])]:[]),
  ['additionalIncome','Do you have any additional income?','choice'],...(form.additionalIncome==='Yes'?[['additionalIncomeDetails','Amounts and Sources of Additional Income','textarea']]:[]),
  ['hasLoans','Do you have any loans?','choice'],...(form.hasLoans==='Yes'?[['loanDetails','Loan Details','textarea']]:[]),
  ['hasCreditCards','Do you have any credit or store cards?','choice'],...(form.hasCreditCards==='Yes'?[['creditCardDetails','Credit or Store Card Details','textarea']]:[]),
  ['legalProceedings','Have you had any CCJs, been insolvent or bankrupt, made arrangements with creditors, or been involved in criminal or civil court proceedings in the last six years?','choice'],...(form.legalProceedings==='Yes'?[['legalDetails','Details of CCJs, Bankruptcy or Proceedings','textarea']]:[])
 ];
 if(group.title==='References')return [...(['Employed','Part-time Employed'].includes(status)?referenceFields('Employer'):status==='Self-Employed'?[['hasEmployerReference','Do you have an employer reference to support your application?','choice'],...(form.hasEmployerReference==='Yes'?referenceFields('Contractor / Professional Referee'):[])]:[]),['hasPersonalReference','Do you have a personal referee to support your application?','choice'],...(form.hasPersonalReference==='Yes'?[['personalReferenceName','Personal Referee Name','text',undefined,false],['personalReferencePhone','Personal Referee Phone','tel',undefined,false],['personalReferenceEmail','Personal Referee Email','email',undefined,false],['personalReferenceAddress','Personal Referee Address','text',undefined,false]]:[])];
 return group.fields;
}
export function formatMoney(input){const clean=input.value.replace(/[^\d.]/g,'');const parts=clean.split('.');const whole=parts.shift()||'';input.value=whole.replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')+(parts.length?'.'+parts.join('').slice(0,2):'');}
