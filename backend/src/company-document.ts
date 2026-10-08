import type PizZip from 'pizzip';
import sharp from 'sharp';
import {COMPANY_DEFAULTS,type CompanySettings} from './company-settings-values';
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decode=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

/** Replace literals even when Word splits them over runs, preserving drawings and styles. */
export function replaceCompanyText(xml:string,values:Record<string,string>):string {
  const keys=Object.keys(values).sort((a,b)=>b.length-a.length);
  const pattern=new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  return xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
    const runs=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    const text=runs.map(r=>decode(r[1])),starts:number[]=[];let offset=0;
    text.forEach(s=>{starts.push(offset);offset+=s.length;});
    const matches=[...text.join('').matchAll(pattern)];
    for(const match of matches.reverse()){
      const start=match.index!,end=start+match[0].length;
      const first=starts.findIndex((pos,i)=>start>=pos&&start<pos+decode(runs[i][1]).length);
      let last=first;while(last+1<starts.length&&starts[last+1]<end)last++;
      const before=text[first].slice(0,start-starts[first]),after=text[last].slice(end-starts[last]);
      text[first]=before+values[match[0]]+(last===first?after:'');
      for(let i=first+1;i<=last;i++)text[i]=i===last?after:'';
    }
    let i=0;return p.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g,(_all,a,b)=>a+escape(text[i++])+b);
  });
}
export function companyTemplateText(xml:string,c:CompanySettings,kind:'internal'|'client'|'service') {
  const date=(v:string)=>v?v.split('-').reverse().join('/'):'';
  // The bank-name rows must be replaced before the surrounding company prose.
  const account=kind==='internal'?c.operatingAccount:c.clientAccount;
  xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
    const text=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>decode(m[1])).join('').trim();
    if(kind!=='service'&&['Fleming Lettings & Developments UK LTD','Fleming Lettings & Developments UK Ltd','Barclays Bank PLC'].includes(text))return replaceCompanyText(p,{[text]:text==='Barclays Bank PLC'?'__COMPANY_BANK_NAME__':'__COMPANY_ACCOUNT_NAME__'});
    return p;
  });
  const values:Record<string,string>={
    'Mr. Robert Fleming (Managing Director)':`${c.signer.name} (${c.signer.title})`,
    "Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, West Midlands, WV10 9TG":c.registeredAddress,
    'Fleming Lettings and Developments UK Limited':c.legalName,
    'Fleming Lettings & Developments UK Limited':c.legalName,
    '13943597':c.companyNumber,
    'Client Money Protect':c.cmp.provider,'CMP012565':c.cmp.number,
    'Property Redress Scheme':c.redress.provider,'PRS042592':c.redress.number,
    'enquiries@fleminglettings.co.uk':c.email,'01902 212 415':c.phone,
    'fleminglettings.co.uk/privacy-policy':`${c.website.replace(/\/$/,'')}/privacy-policy`,
    'fleminglettings.co.uk/terms-and-conditions':`${c.website.replace(/\/$/,'')}/terms-and-conditions`,
  };
  if(kind==='internal'){values['20-08-64']=account.sortCode;values['53346137']=account.accountNumber;}
  if(kind==='service'){
    values['Client Account:\tDesignated client account at Barclays Bank PLC']=`Client Account: ${c.clientAccount.accountName}, ${c.clientAccount.bankName}, Sort code: ${c.clientAccount.sortCode}, Account: ${c.clientAccount.accountNumber}`;
    values['Barclays Bank PLC']=c.clientAccount.bankName;
    values['Client Money Protection:\tClient Money Protect – membership no. CMP012565']=`Client Money Protection: ${c.cmp.provider} – membership no. ${c.cmp.number}`;
    values['Redress scheme:\tProperty Redress Scheme – membership no. PRS042592']=`Redress scheme: ${c.redress.provider} – membership no. ${c.redress.number}${c.redress.expiry?' – expires '+date(c.redress.expiry):''}`;
    if(c.vatNumber)values['Company No. 13943597']=`Company No. ${c.companyNumber}; VAT No. ${c.vatNumber}`;
  }
  return replaceCompanyText(replaceCompanyText(xml,values),{'__COMPANY_BANK_NAME__':account.bankName,'__COMPANY_ACCOUNT_NAME__':account.accountName});
}
export async function applyCompanyImages(zip:PizZip,c:CompanySettings,hasCompanySignature:boolean) {
  if(hasCompanySignature){
    const rels=zip.file('word/_rels/document.xml.rels')!.asText();
    // Supplied templates have one body image: the company's signature.
    for(const rel of rels.match(/<Relationship\b[^>]*\/?>/g)||[]){
      if(!rel.includes('/image"'))continue;
      const target=rel.match(/Target="([^"]+)"/)?.[1];
      if(target)zip.file('word/'+target,Buffer.from(c.signer.signature.split(',')[1],'base64'));
    }
  }
  for(const relName of Object.keys(zip.files).filter(n=>/^word\/_rels\/(header|footer)\d+\.xml\.rels$/.test(n))){
    const header=relName.includes('/header'),rel=zip.file(relName)!.asText();
    if(header&&c.registeredAddress==="Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, West Midlands, WV10 9TG")continue;
    if(!header&&c.phone===COMPANY_DEFAULTS.phone&&c.email===COMPANY_DEFAULTS.email&&c.website===COMPANY_DEFAULTS.website)continue;
    const target=rel.match(/Target="(media\/[^"]+)"/)?.[1];if(!target)continue;
    const image=zip.file('word/'+target);if(!image)continue;
    const bytes=image.asNodeBuffer(),meta=await sharp(bytes).metadata(),w=meta.width!,h=meta.height!;
    let svg:string;
    if(header){
      const lines:string[]=[];for(const part of c.registeredAddress.split(/,\s*|\n/)){for(const word of part.split(/\s+/)){if(!lines.length||lines[lines.length-1].length+word.length>32)lines.push(word);else lines[lines.length-1]+=' '+word;}}
      const x=Math.floor(w*.62),font=Math.min(w*.016,h*.7/Math.max(lines.length,1));
      const {data,info}=await sharp(bytes).removeAlpha().extract({left:Math.floor(w*.5),top:0,width:1,height:h}).raw().toBuffer({resolveWithObject:true});
      const background=data.subarray(Math.floor(h*.5)*info.channels,Math.floor(h*.5)*info.channels+3);
      // The source letterhead includes a white bottom margin. Preserve it when
      // replacing the address, otherwise the right-hand edge extends below the logo.
      let bottom=h;while(bottom>h/2&&background.some((v,c)=>Math.abs(data[(bottom-1)*info.channels+c]-v)>8))bottom--;
      svg=`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" width="${w-x}" height="${bottom}" fill="rgb(${background[0]},${background[1]},${background[2]})"/><text fill="white" font-family="Arial" font-size="${font}">${lines.map((line,i)=>`<tspan x="${x+15}" y="${h*.15+(i+1)*font*1.2}">${escape(line)}</tspan>`).join('')}</text></svg>`;
    }else{
      svg=`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><path d="M40 ${h*.3} H${w-40}" stroke="#DC006D" stroke-width="2"/><g fill="#26083b" font-family="Arial" font-size="${w*.015}"><text x="40" y="${h*.65}">${escape(c.phone)}</text><text x="${w*.5}" y="${h*.65}" text-anchor="middle">${escape(c.website)}</text><text x="${w-40}" y="${h*.65}" text-anchor="end">${escape(c.email)}</text></g></svg>`;
    }
    zip.file('word/'+target,await sharp(bytes).composite([{input:Buffer.from(svg)}]).png().toBuffer());
  }
}
