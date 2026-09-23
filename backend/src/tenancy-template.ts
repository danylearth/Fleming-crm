import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { FLEMING_CLIENT_MONEY_ACCOUNT, type TenancyAgreementPdfInput } from './tenancy-agreement-pdf';

const exec = promisify(execFile);
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');

export function formalAgreementDate(d:Date):string {
  const day=Number(new Intl.DateTimeFormat('en-GB',{day:'numeric',timeZone:'Europe/London'}).format(d));
  const suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'} as Record<number,string>)[day%10]||'th';
  return `${day}${suffix} ${d.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'Europe/London'})}`;
}

// Layout-only changes: the contract's wording and document evidence remain intact.
export function formatContractLayout(xml:string):string {
  xml=xml.replace(/w:top="2160"/g,'w:top="2280"');
  const tables:{start:number;end:number}[]=[];let depth=0;let start=0;
  for(const tag of xml.matchAll(/<w:tbl(?=[\s>])[^>]*>|<\/w:tbl>/g)){
    if(tag[0].startsWith('</')){if(--depth===0)tables.push({start,end:tag.index!+tag[0].length});}
    else {if(depth++===0)start=tag.index!;}
  }
  let cursor=0;
  const pieces=tables.map((range,index)=>{
    let gap=xml.slice(cursor,range.start);cursor=range.end;
    if(index===1||index===2)gap=gap.replace(/<w:br w:type="page"\s*\/>/g,'');
    if(index===7)gap='';
    let table=xml.slice(range.start,range.end);
    if(index<5) {
      table=table.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
        const text=p.replace(/<[^>]+>/g,'').trim();
        if(!text)return '';
        p=p.replace(/<w:pPr>/,'<w:pPr><w:keepLines/>');
        if(/^(Tenancy Start Date|Tenancy Type|Rent|Permitted Occupiers|Shared Facilities|Utilities and Council Tax|Security Deposit|Right to Rent|Contact Details|Ending the Tenancy|Unfitness and Disrepair|Gas and Electrical Safety|Pets|Section [ABC])/.test(text)&&text.length<80)p=p.replace(/<w:spacing[^>]*\/>/g,'').replace(/<w:pPr>/,'<w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/>');
        return p;
      });
      // Word requires a paragraph in every cell, including spacer cells.
      table=table.replace(/(<w:tc(?:\s[^>]*)?>)([\s\S]*?)(<\/w:tc>)/g,(_all,start,content,end)=>start+content+(content.includes('<w:p')?'':'<w:p/>')+end);
    }
    if(index===4)return gap+(table.match(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)||[]).join('');
    if(index<4)table=table.replace(/<w:trPr>/g,'<w:trPr><w:cantSplit/>');
    if(index===0) {
      // The date row has two cells; narrow its first cell to bring the date alongside its label.
      const end=table.indexOf('</w:tr>');
      const first=table.slice(0,end).replace(/<w:tcW[^>]*\/>/,'<w:tcW w:w="2500" w:type="dxa"/>');
      table=first+table.slice(end);
    }
    if(index===7) {
      table=table.replace(/<w:trPr>/g,'<w:trPr><w:cantSplit/>').replace(/<w:trHeight[^>]*\/>/g,'<w:trHeight w:val="950" w:hRule="atLeast"/>');
    }
    if(index===7)return gap+'<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>'+table;
    return gap+table;
  });
  return pieces.join('')+xml.slice(cursor);
}

/** Client templates use paragraphs instead of the owned-property layout tables. */
export function formatClientContractLayout(xml:string):string {
  xml=xml.replace(/w:top="2160"/g,'w:top="2280"')
    .replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/g,'')
    .replace(/<w:pageBreakBefore[^>]*\/>/g,'');
  const pageBreak='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
  const paragraphs=(part:string)=>(part.match(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)||[]).join('');
  // The definitions table's final row contains the whole terms section, including
  // a nested heading table. Unwrap that row so paragraph pagination takes effect.
  const ranges:{start:number;end:number}[]=[];let depth=0,start=0;
  for(const tag of xml.matchAll(/<w:tbl(?=[\s>])[^>]*>|<\/w:tbl>/g)){
    if(tag[0].startsWith('</')){if(--depth===0)ranges.push({start,end:tag.index!+tag[0].length});}
    else if(depth++===0)start=tag.index!;
  }
  for(let index=ranges.length-1;index>=0;index--){
    const range=ranges[index];let table=xml.slice(range.start,range.end);
    if(index===1){
      let rowDepth=0,rowStart=0,lastStart=0,lastEnd=0;
      for(const tag of table.matchAll(/<w:tr(?=[\s>])[^>]*>|<\/w:tr>/g)){
        if(tag[0].startsWith('</')){if(--rowDepth===0){lastStart=rowStart;lastEnd=tag.index!+tag[0].length;}}
        else if(rowDepth++===0)rowStart=tag.index!;
      }
      table=pageBreak+table.slice(0,lastStart)+'</w:tbl>'+paragraphs(table.slice(lastStart,lastEnd));
    }
    if(index===2)table=paragraphs(table);
    if(index===3)table=pageBreak+table;
    xml=xml.slice(0,range.start)+table+xml.slice(range.end);
  }
  let signing=false;
  xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
    const text=p.replace(/<[^>]+>/g,'').trim();
    if(text==='Signed as an agreement')signing=true;
    if(text.startsWith('In addition to you/yourselves'))p=p.replace(/<w:br\s*\/>/g,'');
    if(!text){
      if(signing||/<w:br|<w:drawing|<w:sectPr/.test(p))return p;
      return '<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
    }
    p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');
    if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
    p=p.replace(/<w:keepLines[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepLines/>');
    const heading=text.length<100&&!text.endsWith(':')&&/<w:b(?:\s[^>]*)?\/>/.test(p);
    if(heading)p=p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');
    if(/^Section C -|^Addendum to Tenancy Agreement$/.test(text))p=p.replace('<w:pPr>','<w:pPr><w:pageBreakBefore/>');
    return p;
  });
  return xml.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,row=>{
    row=row.replace(/<w:trPr\s*\/>/,'<w:trPr></w:trPr>').replace(/<w:cantSplit[^>]*\/>/g,'');
    return row.includes('<w:trPr>')?row.replace('<w:trPr>','<w:trPr><w:cantSplit/>'):row.replace(/(<w:tr(?:\s[^>]*)?>)/,'$1<w:trPr><w:cantSplit/></w:trPr>');
  });
}

/** Preserve the supplied contract's clauses, tables, headers and page settings. */
export async function generateSourceTenancyPdf(input: TenancyAgreementPdfInput): Promise<Buffer> {
  if (pending >= 1) throw new Error('Other agreements are being prepared. Please try again shortly.');
  pending++;
  const work = queue.then(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fleming-agreement-'));
    try {
      const isClient=input.agreementType==='client';
      const template = await fs.readFile(path.join(__dirname, isClient?(input.serviceType==='let_only'?'agreement-assets/client-let-only-aug26.docx':'agreement-assets/client-rent-collection-aug26.docx'):'agreement-assets/assured-periodic-tenancy-template.docx'));
      const zip = new PizZip(template);
      const date = formalAgreementDate;
      const names = input.tenants.map(t => t.name).join(' and ');
      const values: Record<string, string> = {
        LANDLORD_NAME:input.landlord.name,
        LANDLORD_IDENTITY:`${input.landlord.name}, of ${input.landlord.address || ''}${input.landlord.companyNumber ? ', Company number: '+input.landlord.companyNumber : ''}`,
        LANDLORD_SIGNATORY:input.landlord.signingName||input.landlord.name,
        LANDLORD_EMAIL:input.landlord.email||'',LANDLORD_PHONE:input.landlord.phone||'',
        SERVICE_ADDRESS:input.landlord.serviceAddress||input.landlord.address||'',EMERGENCY_CONTACT:input.landlord.emergencyContact||'',
        CLIENT_SORT_CODE:FLEMING_CLIENT_MONEY_ACCOUNT.sortCode,CLIENT_ACCOUNT_NUMBER:FLEMING_CLIENT_MONEY_ACCOUNT.accountNumber,BANK_ACCOUNT_NAME:input.bankDetails.accountName,BANK_NAME:input.bankDetails.bankName||'Not supplied',
        BANK_SORT_CODE:input.bankDetails.sortCode,BANK_ACCOUNT_NUMBER:input.bankDetails.accountNumber,
        HOLDING_DEPOSIT:Number(input.holdingDeposit||0).toLocaleString('en-GB',{minimumFractionDigits:2}),DEPOSIT_SCHEME:input.depositScheme||'',
        AGREEMENT_DATE: date(input.tenancyStartDate), START_DATE: date(input.tenancyStartDate),
        RENT_DAY: isClient ? date(input.tenancyStartDate).split(' ')[0] : input.tenancyStartDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' }),
        TENANT_NAMES: names, PROPERTY_ADDRESS: input.propertyAddress,
        RENT: input.rent.toLocaleString('en-GB',{minimumFractionDigits:2}), DEPOSIT: input.deposit.toLocaleString('en-GB',{minimumFractionDigits:2}), PAYMENT_REFERENCE: input.paymentReference,
        OCCUPIERS: input.permittedOccupiers || 'None', SHARED_FACILITIES: input.sharedFacilities || 'None', PARKING: input.parking || 'None',
        TENANT_EMAILS: input.tenants.map(t => t.email).filter(Boolean).join('; '),
        TENANT_PHONES: input.tenants.map(t => t.phone).filter(Boolean).join('; '),
        TENANT_ADDRESSES: input.tenants.map(t => `${t.name}: ${t.address || 'Not supplied'}`).join('\n'),
        TENANT_SIGNING_SECTIONS: input.tenants.map((t, i) => `Tenant ${i + 1}: ${t.name}\nSignature and date:\n\n`).join('\n'),
        DEPOSIT_CONTRIBUTOR: input.depositContributorDetails ? `Deposit contribution disclosed by the tenant(s): ${input.depositContributorDetails}` : '',
        GAS_ACKNOWLEDGEMENT: input.hasGas ? 'Gas Safety Certificate' : 'Gas Safety Certificate: not applicable (no gas connection)',
      };
      let xml = zip.file('word/document.xml')!.asText();
      xml=isClient?formatClientContractLayout(xml):formatContractLayout(xml);
      if(!input.hasGas)xml=xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g,row=>row.includes('{{GAS_ACKNOWLEDGEMENT}}')?'':row);
      xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,paragraph=>paragraph.replace(/<[^>]+>/g,'').includes('The electronic signature certificate records each named tenant')?'':paragraph);
      xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
        if (!(key in values)) throw new Error(`Unfilled agreement field: ${key}`);
        return xmlText(values[key]);
      });
      if (/#####|\{\{[A-Z_]+\}\}/.test(xml)) throw new Error('Agreement template contains an unfilled field');
      // Filled fields are final contract text; remove the template's drafting highlights.
      xml=xml.replace(/<w:highlight[^>]*\/>/g,'').replace(/<w:shd[^>]*w:fill="FFFF00"[^>]*\/>/gi,'');
      // Keep the supplied wording and layout while applying the requested body font.
      xml=xml.replace(/<w:rFonts[^>]*\/>/g, '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      xml=xml.replace(/(<w:t[^>]*>)Signed:(<\/w:t>)/g, '$1Signed: signatures and dates for each party are recorded in the electronic signature certificate, applying to this addendum.$2');
      zip.file('word/document.xml', xml);
      const styles=zip.file('word/styles.xml');
      if(styles)zip.file('word/styles.xml',styles.asText().replace(/<w:rFonts[^>]*\/>/g,'<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'));
      const docx = path.join(dir, 'agreement.docx');
      await fs.writeFile(docx, zip.generate({ type: 'nodebuffer' }));
      await exec(process.env.LIBREOFFICE_PATH || 'soffice', [
        `-env:UserInstallation=${pathToFileURL(path.join(dir, 'profile')).href}`,
        '--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', dir, docx,
      ], { timeout: 60000, maxBuffer: 1024 * 1024 });
      const pdf = await fs.readFile(path.join(dir, 'agreement.pdf'));
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The agreement could not be rendered as a PDF');
      const document = await PDFDocument.load(pdf);
      document.setTitle(`Assured Periodic Tenancy - ${input.propertyAddress}`);
      return Buffer.from(await document.save());
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  queue = work.catch(() => undefined);
  try { return await work; } finally { pending--; }
}
