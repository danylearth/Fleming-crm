export const SIGNING_CONSENT_VERSION='2026-09-28';
export const SIGNING_ACKNOWLEDGEMENTS=[
 ['terms','I have read and understood the terms and conditions contained in this document and agree to them.'],
 ['legalEffect','I intend my electronic signature to have legal effect and understand that signing creates legally binding obligations.'],
 ['declaration','I confirm that I am the named signatory or an authorised representative, and that the information and declarations I provide are true to the best of my knowledge and belief.'],
] as const;
export type SigningConsentSnapshot={version:string;statements:{key:string;text:string;accepted:true}[]};
export function signingConsentSnapshot(body:any):SigningConsentSnapshot {
 if(body.consentVersion!==SIGNING_CONSENT_VERSION)throw Error('Refresh this page and review the signing declarations before signing');
 if(!SIGNING_ACKNOWLEDGEMENTS.every(([key])=>body.acknowledgements?.[key]===true))throw Error('Tick all three declarations before signing');
 return {version:SIGNING_CONSENT_VERSION,statements:SIGNING_ACKNOWLEDGEMENTS.map(([key,text])=>({key,text,accepted:true}))};
}
