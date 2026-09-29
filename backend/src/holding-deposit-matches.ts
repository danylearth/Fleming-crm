import {finalBalanceMatch} from './final-balance-matches';

type Applicant={id:number;first_name_1?:string;last_name_1?:string;first_name_2?:string;last_name_2?:string;status?:string;linked_property_id?:number;holding_deposit_requested?:unknown;holding_deposit_amount?:unknown;holding_deposit_bank_amount?:unknown;holding_deposit_manual_amount?:unknown};
type Payment={amount:unknown;currency?:string;match_status?:string;description?:string;display_name?:string;merchant_name?:string};

export function holdingDepositMatch(payment:Payment,applicants:Applicant[]) {
 if(payment.currency!=='GBP'||payment.match_status!=='unmatched'||!applicants.length)return null;
 if(applicants.some(e=>!e.linked_property_id||!e.holding_deposit_requested||['converted','rejected','closed','archived','not_interested'].includes(e.status||'')))return null;
 if(new Set(applicants.map(e=>Number(e.linked_property_id))).size!==1)return null;
 return finalBalanceMatch(payment,applicants.map(e=>({...e,balance_due_amount:e.holding_deposit_amount,balance_bank_amount:e.holding_deposit_bank_amount,balance_manual_amount:e.holding_deposit_manual_amount})));
}
