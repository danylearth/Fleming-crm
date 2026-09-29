export type TenancyLandlordSigner={id:number;name:string;email:string;phone?:string;token:string;slug:string;signed_at?:string;signature?:string;signature_name?:string;signature_ip?:string;signature_user_agent?:string};
export function agreementLandlords(details:unknown):TenancyLandlordSigner[]{
 const parsed=typeof details==='string'?JSON.parse(details):details;
 return Array.isArray((parsed as any)?.landlordSigners)?(parsed as any).landlordSigners:[];
}
export function landlordSigningStage(signers:TenancyLandlordSigner[]){
 const waiting=signers.filter(s=>!s.signed_at||!s.signature);
 return {ready:signers.length>0&&waiting.length===0,waiting:waiting.map(s=>s.name)};
}
export function signTenancyLandlord(signers:TenancyLandlordSigner[],token:string,signature:{name:string;image:string;at:string;ip:string;agent:string}){
 const index=signers.findIndex(s=>s.token===token||s.slug===token);
 if(index<0)throw Error('This landlord signing link is not valid');
 if(signers[index].signed_at)throw Error('This landlord has already signed');
 const updated=signers.map((s,i)=>i===index?{...s,signed_at:signature.at,signature:signature.image,signature_name:signature.name,signature_ip:signature.ip,signature_user_agent:signature.agent}:s);
 return {signers:updated,...landlordSigningStage(updated)};
}
