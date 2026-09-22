export function pricePaidLabel(value:any):string {
 if(Array.isArray(value))return value.map(pricePaidLabel).filter(Boolean).join(', ');
 return typeof value==='string'?value:typeof value?._value==='string'?value._value:'';
}
export function normalisePricePaid(item:any){return {address:[item.propertyAddress?.saon,item.propertyAddress?.paon,item.propertyAddress?.street].filter(Boolean).join(' '),postcode:item.propertyAddress?.postcode,price:Number(item.pricePaid),date:item.transactionDate,property_type:pricePaidLabel(item.propertyType?.label),estate_type:pricePaidLabel(item.estateType?.label),transaction_id:item.transactionId};}
