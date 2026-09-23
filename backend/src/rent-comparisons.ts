import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import type {Express} from 'express';
import * as XLSX from 'xlsx';
import {authMiddleware} from './auth';
import {query,queryOne,run} from './db-pg';
export const onsDataset='https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics';
function onsCollector(){
 let names:string[]|undefined;const areas:Record<string,any>={};
 const row=(r:any[])=>{if(r[0]==='Time period'&&r[1]==='Area code'){names=r;return;}if(!names||typeof r[0]!=='number'||typeof r[1]!=='string')return;
  const date=XLSX.SSF.parse_date_code(r[0]);const month=`${date.y}-${String(date.m).padStart(2,'0')}`;if(areas[r[1]]?.month>=month)return;
  const value=(name:string)=>typeof r[names!.indexOf(name)]==='number'?r[names!.indexOf(name)]:null;
  areas[r[1]]={code:r[1],name:r[2],month,average:value('Rental price'),annual_change:value('Annual change'),bedrooms:{one:value('Rental price one bed'),two:value('Rental price two bed'),three:value('Rental price three bed'),four_plus:value('Rental price four or more bed')},property_types:{detached:value('Rental price detached'),semi_detached:value('Rental price semidetached'),terraced:value('Rental price terraced'),flat:value('Rental price flat maisonette')}};
 };
 return {row,result:()=>{if(Object.keys(areas).length<100)throw Error('ONS rent data incomplete');return areas;}};
}
export function parseOnsRents(buffer:Buffer){const w=XLSX.read(buffer,{type:'buffer'}),sheet=w.Sheets['Table 1'];if(!sheet)throw Error('ONS rent table unavailable');const c=onsCollector();XLSX.utils.sheet_to_json<any[]>(sheet,{header:1}).forEach(c.row);return c.result();}
const decodeXml=(s:string)=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x]!));
// The ONS workbook contains millions of cells. Stream its XML rather than expanding the entire workbook in the API process.
export async function parseOnsRentsFile(file:string){
 const unzip=async(entry:string)=>(await promisify(execFile)('unzip',['-p',file,entry],{maxBuffer:8*1024*1024})).stdout;
 const workbook=await unzip('xl/workbook.xml'),relId=workbook.match(/<sheet\b[^>]*name="Table 1"[^>]*r:id="([^"]+)"/)?.[1];if(!relId)throw Error('ONS rent table unavailable');
 const rels=await unzip('xl/_rels/workbook.xml.rels');const rel=[...rels.matchAll(/<Relationship\b[^>]*>/g)].find(m=>m[0].includes(`Id="${relId}"`))?.[0];const target=rel?.match(/Target="([^"]+)"/)?.[1];if(!target||!/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target))throw Error('ONS worksheet unavailable');
 let strings:string[]=[];try{strings=[...(await unzip('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>decodeXml([...m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));}catch{/* Inline-string workbooks do not need a shared string table. */}
 const collector=onsCollector(),entry=target.replace(/^\//,'').replace(/^(?!xl\/)/,'xl/');
 await new Promise<void>((resolve,reject)=>{const child=spawn('unzip',['-p',file,entry]),decoder=new StringDecoder('utf8');let buffer='';const timer=setTimeout(()=>{child.kill();reject(Error('ONS parsing timed out'));},90000);
  child.stdout.on('data',chunk=>{buffer+=decoder.write(chunk);let end:number;while((end=buffer.indexOf('</row>'))>=0){const xml=buffer.slice(0,end+6);buffer=buffer.slice(end+6);const row:any[]=[];for(const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const col=match[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!col)continue;let index=0;for(const ch of col)index=index*26+ch.charCodeAt(0)-64;const value=match[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];row[index-1]=/\bt="s"/.test(match[1])?strings[Number(value)]:/\bt="inlineStr"/.test(match[1])?decodeXml([...match[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')):value!==undefined?Number(value):null;}collector.row(row);}});
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('ONS XML could not be read'));});
 });return collector.result();
}
let refreshing:Promise<any>|undefined;
export async function refreshOnsRents(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const cached=await queryOne('SELECT * FROM ons_rent_cache WHERE id=TRUE');if(cached&&Date.now()-new Date(cached.fetched_at).getTime()<28*86400000)return cached;
  const json=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`ONS unavailable (${r.status})`);return r.json() as Promise<any>;};
  const editions=await json(onsDataset+'/data');const uri=editions.datasets?.[0]?.uri;if(typeof uri!=='string'||!uri.startsWith('/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/'))throw Error('ONS edition unavailable');
  const edition=await json('https://www.ons.gov.uk'+uri+'/data');const file=edition.downloads?.find((d:any)=>/^[a-z0-9-]+\.xlsx$/i.test(d.file))?.file;if(!file)throw Error('ONS workbook unavailable');
  const url='https://www.ons.gov.uk/file?uri='+encodeURIComponent(uri+'/'+file);const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error(`ONS download unavailable (${response.status})`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>40*1024*1024)throw Error('ONS workbook too large');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ons-rents-'));let areas:Record<string,any>;try{const file=path.join(dir,'rents.xlsx');await fs.writeFile(file,bytes);areas=await parseOnsRentsFile(file);}finally{await fs.rm(dir,{recursive:true,force:true});}const payload={edition:edition.description?.edition,areas};await run('INSERT INTO ons_rent_cache(id,payload,source_url) VALUES(TRUE,$1,$2) ON CONFLICT(id) DO UPDATE SET payload=$1,source_url=$2,fetched_at=NOW()',[JSON.stringify(payload),url]);return await queryOne('SELECT * FROM ons_rent_cache WHERE id=TRUE');
 })();try{return await refreshing;}finally{refreshing=undefined;}
}
export const streetKey=(address:string)=>address.split(',')[0].toLowerCase().replace(/^\s*(?:flat\s+\w+[,\s]+)?\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?\s*/,'').replace(/\s+/g,' ').trim();
export function crmRentSamples(property:any,records:any[]){
 const postcode=String(property.postcode||'').replace(/\s/g,'').toUpperCase(),street=streetKey(property.address);
 const group=(rows:any[])=>({count:rows.length,average:rows.length?Math.round(rows.reduce((sum,r)=>sum+Number(r.monthly_rent),0)/rows.length*100)/100:null});
 return {postcode:group(records.filter(r=>postcode&&String(r.postcode||'').replace(/\s/g,'').toUpperCase()===postcode)),street:group(records.filter(r=>street&&streetKey(r.address)===street&&String(r.postcode||'').split(' ')[0]===String(property.postcode||'').split(' ')[0]))};
}
export function registerRentComparisons(app:Express){
 app.get('/api/properties/:id/rent-comparisons',authMiddleware,async(req,res)=>{
  const p=await queryOne('SELECT id,address,postcode,bedrooms,property_type FROM properties WHERE id=$1',[req.params.id]);if(!p)return res.sendStatus(404);
  const records=await query("SELECT DISTINCT ON (p.id) p.id,p.address,p.postcode,t.monthly_rent FROM properties p JOIN tenants t ON t.property_id=p.id WHERE p.archived_at IS NULL AND t.status='active' AND t.monthly_rent>0 AND (t.tenancy_start_date IS NULL OR t.tenancy_start_date<=CURRENT_DATE) AND (t.tenancy_end_date IS NULL OR t.tenancy_end_date>=CURRENT_DATE) ORDER BY p.id,t.tenancy_start_date DESC NULLS LAST,t.id");
  let cached=await queryOne('SELECT * FROM ons_rent_cache WHERE id=TRUE'),message:string|null=null,area:any=null;
  try{cached=await refreshOnsRents();}catch{message=cached?'ONS refresh unavailable; showing the last saved release.':'ONS data is temporarily unavailable. Local CRM averages remain available.';}
  try{const r=await fetch('https://api.postcodes.io/postcodes/'+encodeURIComponent(p.postcode),{signal:AbortSignal.timeout(10000)}),d:any=await r.json();const code=d.result?.codes?.admin_district;area=cached?.payload?.areas?.[code]||null;}catch{message='Could not resolve the property’s local authority. Local CRM averages remain available.';}
  res.json({property:p,crm:crmRentSamples(p,records),ons:area,edition:cached?.payload?.edition,fetched_at:cached?.fetched_at,source_url:onsDataset,message:message||(!area?'No ONS local authority match is available for this postcode.':null),as_of:new Date().toISOString()});
 });
}
