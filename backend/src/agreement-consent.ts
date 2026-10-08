import type {SigningConsentSnapshot} from './signing-consent';
export const APT_DECLARATIONS=[
 ['accepted_terms','I confirm that I have read and agree to the tenancy agreement.'],
 ['accepted_binding','I intend my electronic signature to be legally binding for the agreement and its addendum.'],
 ['accepted_payment_schedule','I have read and agree to the rent, deposit and payment schedule in the agreement.'],
] as const;
export const SERVICE_DECLARATIONS=[
 ['accepted_terms','I have read and agree to this service agreement and the Landlord Terms of Business, and am authorised to sign.'],
 ['start_immediately','I instruct Fleming Lettings to start the services immediately and acknowledge the cancellation provisions in clause 17.'],
 ['bank_approved','I have checked and verify that these details are correct.'],
] as const;
export function agreementConsentSnapshot(kind:'apt'|'service',body:Record<string,unknown>):SigningConsentSnapshot{
 const declarations=kind==='apt'?APT_DECLARATIONS:SERVICE_DECLARATIONS;
 if(!declarations.every(([key])=>body[key]===true))throw Error('Accept every signing declaration');
 return {version:kind+'-2026-10-05',statements:declarations.map(([key,text])=>({key,text,accepted:true as const}))};
}

