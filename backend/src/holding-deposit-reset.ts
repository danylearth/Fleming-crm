export function validateHoldingDepositReset(
  allocations:{id:number;kind:string}[],
  participants:{allocation_id:number;enquiry_id:number|null}[],
  enquiryIds:number[],
) {
  if (!allocations.length) throw Error('This payment is no longer linked');
  if (allocations.some(a=>a.kind!=='holding_deposit')) throw Error('This payment has other allocations. Review it in Financials before resetting.');
  if (allocations.some(a=>!participants.some(p=>p.allocation_id===a.id)) || participants.some(p=>!p.enquiry_id || !enquiryIds.includes(Number(p.enquiry_id)))) {
    throw Error('This payment is linked to another application. Review it in Financials before resetting.');
  }
}
