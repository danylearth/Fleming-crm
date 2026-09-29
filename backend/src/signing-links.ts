import crypto from 'node:crypto';

const slugPart=(text:string,limit:number)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,limit).replace(/-$/,'');
export function createSigningSlug(name:string,title:string){
 const surname=name.replace(/\([^)]*\)/g,'').trim().split(/\s+/).slice(-1)[0]||'recipient';
 // A random 128-bit number keeps these bearer links unguessable, unlike an invoice ID.
 const number=BigInt('0x'+crypto.randomBytes(16).toString('hex')).toString().padStart(39,'0');
 return `${slugPart(surname,24)||'recipient'}-${slugPart(title.replace(/\.(pdf|docx?|html?)$/i,''),40)||'document'}-${number}`;
}
export const isSigningSlug=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)+-\d{39}$/.test(value)&&value.length<=105;
export const isSigningReference=(value:unknown):value is string=>typeof value==='string'&&(/^[a-f0-9]{64}$/.test(value)||isSigningSlug(value));
