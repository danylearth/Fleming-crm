import type {PoolClient} from 'pg';
type Address={address?:string|null;address_line_2?:string|null;city?:string|null;postcode?:string|null};
const compact=(value:unknown)=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
export function propertyIdentity(value:Address):string {
 const postcode=compact(value.postcode),city=compact(value.city);
 const parts=String(value.address||'').split(',').map(part=>part.trim()).filter(Boolean);
 while(parts.length>1&&[postcode,city].filter(Boolean).includes(compact(parts[parts.length-1])))parts.pop();
 const street=compact(parts.join(' ')),line2=compact(value.address_line_2);
 return postcode+'|'+street+(line2&&!street.endsWith(line2)?line2:'');
}
/** Called inside the same transaction as insertion; serialises concurrent creates/imports. */
export async function findDuplicateProperty(client:PoolClient,address:Address){
 await client.query('SELECT pg_advisory_xact_lock(826420,1)');
 const rows=await client.query("SELECT id,address,address_line_2,city,postcode,archived_at FROM properties WHERE regexp_replace(lower(COALESCE(postcode,'')),'[^a-z0-9]','','g')=$1 ORDER BY id",[compact(address.postcode)]);
 return rows.rows.find(row=>propertyIdentity(row)===propertyIdentity(address))||null;
}
