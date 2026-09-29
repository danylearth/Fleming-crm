type Applicant={id?:number;joint_partner_id?:number|null;credit_check_completed?:number|boolean};

export function isValidCreditScore(value:string):boolean {
 return /^\d+$/.test(value.trim())&&Number.isSafeInteger(Number(value.trim()));
}

export function creditChecksComplete(enquiry:Applicant,partner?:Applicant|null):boolean {
 return Boolean(enquiry.credit_check_completed)&&(!enquiry.joint_partner_id||Boolean(partner?.id===Number(enquiry.joint_partner_id)&&partner.credit_check_completed));
}
