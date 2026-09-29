export const mainOfficeAddress='Creative Industries Centre, Wolverhampton Science Park, Wolverhampton, WV10 9TG';
export type HandoverOffice={id:number;name:string;office_address?:string};
export function handoverLocation(type:unknown,other:unknown,propertyAddress:string,offices:HandoverOffice[]){
 const selected=String(type||'property');
 const address=selected==='property'?propertyAddress:selected==='office'?mainOfficeAddress:selected==='other'?String(other||'').trim():offices.find(o=>'office:'+o.id===selected)?.office_address?.trim();
 if(!address||address.length>1000)throw Error('Choose a handover location and enter its full address');
 return {type:selected,address};
}
