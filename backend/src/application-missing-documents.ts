export const requests: Record<string,string> = {
  'Primary Identification': 'Please also provide your primary identification document.',
  'Secondary Identification': 'Please also provide your secondary identification document.',
  'Bank Statements': 'Please also provide three months’ bank statements.',
  'Proof of Income or Employment': 'Please also provide proof of income or employment.',
};
export type DocumentOverrides = Record<string,{status?:string;reviewed_at?:string;reviewed_by?:number}>;
export function requiredApplicationDocuments(employmentStatus: unknown):string[] {
  return Object.keys(requests).filter(type=>type!=='Proof of Income or Employment'||!['Student','Unemployed'].includes(String(employmentStatus)));
}
export function missingApplicationDocuments(employmentStatus: unknown, documents: {doc_type:string}[], overrides:DocumentOverrides={}): string[] {
  return requiredApplicationDocuments(employmentStatus).filter(type => !documents.some(document=>document.doc_type===type)&&overrides[type]?.status!=='overridden');
}
export function missingApplicationApprovals(employmentStatus:unknown,documents:{doc_type:string;review_status?:string}[],overrides:DocumentOverrides={}):string[] {
  return requiredApplicationDocuments(employmentStatus).filter(type=>{
    const matches=documents.filter(document=>document.doc_type===type);
    return matches.length ? !matches.some(document=>document.review_status==='approved') : overrides[type]?.status!=='overridden';
  });
}
export function includeMissingDocumentRequests(changes:string,employmentStatus:unknown,documents:{doc_type:string}[],overrides:DocumentOverrides={}):string {
  const lines=changes.trim()?changes.trim().split(/\n\s*\n/):[];
  for(const type of missingApplicationDocuments(employmentStatus,documents,overrides)) if(!changes.includes(requests[type]))lines.push(requests[type]);
  return lines.join('\n\n');
}
