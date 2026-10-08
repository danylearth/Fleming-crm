import {query} from './db-pg';
const ignored=new Set('what where when which who how is are was were the a an in on at for to of and with tell me show find about tenant tenants property properties please next due date eicr epc gas safety electrical certificate expires expiry expire does my our this that it details document documents read scan analyse analyze summarise summarize road street avenue drive lane flat house'.split(' '));
export const normaliseLookup=(value:string)=>value.toLowerCase().replace(/\b(rd|st|ave|ln|dr)\b/g,w=>({rd:'road',st:'street',ave:'avenue',ln:'lane',dr:'drive'}[w]!)).replace(/[^a-z0-9]+/g,' ').trim();
const transposed=(a:string,b:string)=>{if(a.length<5||a.length!==b.length||!/^[a-z]+$/.test(a))return false;const differences=[...a].map((c,i)=>c===b[i]?-1:i).filter(i=>i>=0);return differences.length===2&&differences[1]===differences[0]+1&&a[differences[0]]===b[differences[1]]&&a[differences[1]]===b[differences[0]];};
export function matchFlemoRecords<T extends {id:number;name:string;entity:string}>(catalog:T[],message:string,context?:{entityType?:string;entityId?:number}):T[]{
 const text=normaliseLookup(message),words=text.split(' ').filter(w=>w&&!ignored.has(w)),numbers=words.filter(w=>/^\d+[a-z]?$/.test(w));
 const exact=catalog.filter(r=>{const name=normaliseLookup(r.name);return name&&(' '+text+' ').includes(' '+name+' ');});if(exact.length)return exact;
 const ranked=catalog.map(r=>{const name=normaliseLookup(r.name),tokens=name.split(' ');if(r.entity==='properties'&&numbers.length&&!numbers.some(n=>tokens.includes(n)))return {r,score:0};const matched=words.filter(w=>tokens.includes(w));return {r,score:matched.filter(w=>!/^\d/.test(w)).length?(matched.length/words.length):0};}).filter(r=>r.score>0);
 const best=Math.max(0,...ranked.map(r=>r.score));if(best>=.5)return ranked.filter(r=>r.score===best).map(r=>r.r);
 // A swapped pair of letters is safe to offer only with an exact house number.
 if(numbers.length){const corrected=catalog.filter(r=>{const tokens=normaliseLookup(r.name).split(' ');return r.entity==='properties'&&numbers.some(n=>tokens.includes(n))&&words.filter(w=>!/^\d/.test(w)).every(w=>tokens.some(t=>t===w||transposed(w,t)));});if(corrected.length)return corrected;}
 const map:Record<string,string>={property:'properties',tenant:'tenants',enquiry:'enquiries',tenant_enquiry:'enquiries',landlord:'landlords'};
 if(!numbers.length&&/\b(this|that|it|here)\b/i.test(message)&&context?.entityId)return catalog.filter(r=>r.id===Number(context.entityId)&&r.entity===(map[context.entityType||'']||context.entityType));
 return [];
}
export function complianceQuestion(message:string){
 if(/\b(read|analyse|analyze|summari[sz]e|scan|contents|findings)\b/i.test(message))return null;
 if(!/\b(due|expir\w*|renew\w*|when|date)\b/i.test(message))return null;
 if(/\beicr\b|electrical.*(?:certificate|inspection|report)/i.test(message))return {label:'EICR',field:'eicr_expiry_date'};
 if(/\bepc\b|energy performance/i.test(message))return {label:'EPC',field:'epc_expiry_date'};
 if(/gas (?:safety|certificate)|\bcp12\b/i.test(message))return {label:'Gas safety certificate',field:'gas_safety_expiry_date'};
 return null;
}
export async function fastComplianceAnswer(message:string,portfolio:string,context?:{entityType?:string;entityId?:number}){
 const question=complianceQuestion(message);if(!question)return null;
 if(/\b(all|every|list|portfolio)\b/i.test(message))return null;
 const rows=await query(`SELECT p.id,p.address AS name,p.postcode,p.has_gas,p.${question.field}::text AS due_date,'properties' AS entity FROM properties p LEFT JOIN landlords l ON l.id=p.landlord_id WHERE p.archived_at IS NULL AND ($1='all' OR l.landlord_type=$1)`,[portfolio]);
 const matched=matchFlemoRecords(rows,message,context);
 if(!matched.length)return {text:'I couldn’t identify that property in your selected portfolio. Please give its full address or open the property and ask again.',actions:[]};
 if(matched.length>1)return {text:`Which property do you mean? ${matched.slice(0,5).map(r=>[r.name,r.postcode].filter(Boolean).join(', ')).join('; ')}.`,actions:matched.slice(0,5).map(r=>({id:`properties-${r.id}`,type:'link',label:r.name,href:`/properties/${r.id}`}))};
 const r=matched[0],today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
 const date=r.due_date?new Date(r.due_date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):null;
 return {text:question.field==='gas_safety_expiry_date'&&!r.has_gas?`${r.name} is recorded as having no gas supply.`:date?`${r.name}: the ${question.label} ${r.due_date<today?'expired on':'is next due on'} ${date}.${r.due_date===today?' It is due today.':''}`:`${r.name}: no ${question.label} expiry date is recorded. Open the property to add it.`,actions:[{id:`properties-${r.id}`,type:'link',label:r.name,href:`/properties/${r.id}`}]};
}
