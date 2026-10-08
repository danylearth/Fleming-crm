import crypto from 'node:crypto';

export const GUARANTOR_EXECUTION_CONSENT_VERSION='guarantor-deed-2026-10-04';
export const guarantorDeclarations={
 readDeed:'I have read and understood this Deed of Guarantee.',
 readTenancy:'I have received and read the identified tenancy agreement supplied with this deed.',
 executeDeed:'I intend to sign this document as a deed on its stated terms.',
 presentNow:'My nominated witness is physically present and is watching me apply this signature.',
};
export const witnessDeclarations={
 witnessPresent:'I was physically present and saw the guarantor apply the signature recorded in this deed.',
 identity:'I confirm the full legal name and witness details recorded with my signature are correct.',
 independent:'I am aged 18 or over and am not a tenant, landlord or other party to this deed.',
 attest:'I attest the guarantor’s signature by applying my own signature below.',
};
const normal=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-GB');
export const executionHash=(value:Buffer|string)=>crypto.createHash('sha256').update(value).digest('hex');
export function ensureExecutionBeforeStart(startDate:string){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
 if(startDate<=today)throw Error('The stated tenancy start date has arrived. Ask the office to confirm corrected execution and delivery arrangements before signing');
}
export function executionConsent(role:'guarantor'|'witness',values:any){
 const declarations=role==='guarantor'?guarantorDeclarations:witnessDeclarations;
 if(!values||Object.keys(declarations).some(key=>values[key]!==true))throw Error('Read and confirm every signing declaration');
 return {version:GUARANTOR_EXECUTION_CONSENT_VERSION,statements:Object.entries(declarations).map(([key,text])=>({key,text,accepted:true}))};
}
export function validateExecutionIdentity(role:'guarantor'|'witness',form:any,name:string){
 if(typeof name!=='string'||!name.trim()||name.length>150)throw Error('Enter your full legal name');
 if(role==='guarantor'&&normal(name)!==normal(form.name))throw Error('Sign using your full legal name recorded on the deed');
 if(role==='witness'&&normal(name)===normal(form.name))throw Error('The witness must be a different person from the guarantor');
 if(normal(form.email)===normal(form.witnessEmail))throw Error('The witness must use their own email address');
 for(const key of ['name','email','witnessName','witnessEmail','witnessAddress'])if(!String(form[key]||'').trim())throw Error('Complete the guarantor and witness details before signing');
 for(const key of ['email','witnessEmail'])if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form[key]))throw Error('Enter valid guarantor and witness email addresses');
}

// Separate context from authentication tokens. Rotation of JWT_SECRET requires
// reissuing invitations rather than exposing stored signing tokens in plaintext.
function tokenKey(){
 const secret=process.env.JWT_SECRET;
 if(!secret||secret.length<32)throw Error('The signing token encryption key is unavailable');
 return crypto.createHmac('sha256',secret).update('fleming-guarantor-invitation-encryption-v1').digest();
}
export function sealGuarantorToken(token:string){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
 return Buffer.concat([iv,cipher.update(token,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function openGuarantorToken(encoded:string){
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length<29)throw Error('Stored invitation is unavailable');
 const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
}
