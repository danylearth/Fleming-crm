export const PHONE_PLACEHOLDER='+44 7700 900123';
export function normaliseUkPhone(value:string){
 const v=value.replace(/[\s().-]/g,'');
 if(/^0\d{10}$/.test(v))return '+44'+v.slice(1);
 if(/^0044\d{10}$/.test(v))return '+'+v.slice(2);
 if(/^44\d{10}$/.test(v))return '+'+v;
 return v;
}
export const validUkPhone=(value:string)=>/^\+44[1-9]\d{9}$/.test(normaliseUkPhone(value));
