type Address={address:string;address_line_2?:string;city?:string;postcode:string};
const normalise=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
export function matchedCouncilTaxBand(rows:unknown,property:Address):string|null{
 if(!Array.isArray(rows)||!property.address.trim()||!property.postcode.trim())return null;
 const street=[property.address,property.address_line_2].filter(Boolean).join(' ');
 const expected=new Set([street,[street,property.city].filter(Boolean).join(' '),street+' '+property.postcode,[street,property.city,property.postcode].filter(Boolean).join(' ')].map(normalise));
 const matches=rows.filter(row=>row&&typeof row.address==='string'&&typeof row.band==='string'&&expected.has(normalise(row.address))&&/^[A-H]$/i.test(row.band.trim()));
 return matches.length===1?matches[0].band.trim().toUpperCase():null;
}
