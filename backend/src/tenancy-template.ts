import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { FLEMING_CLIENT_MONEY_ACCOUNT, type TenancyAgreementPdfInput } from './tenancy-agreement-pdf';
import {companyTemplateText,applyCompanyImages} from './company-document';

const exec = promisify(execFile);
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');

/** Keep account labels and numbers together, including agreement-only overrides. */
export function prepareClientPaymentTemplate(xml:string,serviceType:string|null|undefined):string {
 return xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g,table=>{
  let initial=table.includes('{{CLIENT_SORT_CODE}}');
  if(!initial&&!table.includes('{{BANK_SORT_CODE}}'))return table;
  return table.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,row=>{
   if(row.includes('{{BANK_SORT_CODE}}'))initial=false;
   if(row.includes('{{CLIENT_SORT_CODE}}'))initial=true;
   const text=row.replace(/<[^>]+>/g,'');
   const token=text.startsWith('Account Name:')?(initial?'INITIAL_ACCOUNT_NAME':'BANK_ACCOUNT_NAME'):text.startsWith('Bank Name:')?(initial?'INITIAL_BANK_NAME':'BANK_NAME'):null;
   if(!token)return row;
   let cell=0;
   return row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g,value=>{
    if(cell++!==1)return value;let first=true;
    return value.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g,(_whole,start,end)=>{const text=first?`{{${token}}}`:'';first=false;return start+text+end;});
   });
  });
 });
}

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
      table=table.slice(0,lastStart)+'</w:tbl>'+paragraphs(table.slice(lastStart,lastEnd));
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

/** Presentation shared by owned and client APTs, before personal fields are filled. */
export function formatAptPresentation(xml:string,hasGas:boolean):string {
  xml=xml.replace(/<w:tr\b(?:(?!<w:tr\b)[\s\S])*?<\/w:tr>/g,row=>{
    if(!row.includes('This agreement is dated')||!row.includes('{{AGREEMENT_DATE}}'))return row;
    return '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="11160" w:type="dxa"/><w:gridSpan w:val="2"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:keepLines/><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>This agreement is dated {{AGREEMENT_DATE}}.</w:t></w:r></w:p></w:tc></w:tr>';
  });
  const text=(part:string)=>[...part.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
  xml=xml.replace(/<w:tr\b(?:(?!<w:tr\b)[\s\S])*?<\/w:tr>/g,row=>{
    const label=text(row.match(/<w:tc\b[\s\S]*?<\/w:tc>/)?.[0]||row);
    if(/^The Renters[’'] Rights Act Information Sheet 2026$/.test(label))return '';
    return !hasGas&&['Gas Safety Certificate','{{GAS_ACKNOWLEDGEMENT}}'].includes(label)?'':row;
  });
  const subheadings=new Set(['Rent and other payments','Utilities','Use of the property','Leaving the property empty','Condition of the property','Letters and notices','Access to the property','Keys and alarm codes']);
  const minor=new Set(['a','an','the','and','or','but','of','in','on','at','by','for','to','as','if']);
  const titleCase=(s:string)=>s.replace(/[A-Za-z]+/g,(word,offset)=>minor.has(word.toLowerCase())&&offset>s.search(/[A-Za-z]/)?word.toLowerCase():word[0].toUpperCase()+word.slice(1));
  xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
    const value=text(p),heading=/^\d+\.\s+[A-Za-z]/.test(value)||subheadings.has(value),sectionC=value==='Section C - Terms and Conditions';
    // The stored last-rendered break is stale after repagination.
    p=p.replace(/<w:lastRenderedPageBreak\s*\/>/g,'');
    if(/^Section A\s*[-–]\s*Main Terms of the Agreement$/i.test(value)){
      p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');
      if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
      return p.replace(/<w:spacing[^>]*\/>/g,'').replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/><w:spacing w:before="480" w:after="120"/>');
    }
    if(value.includes('is not a party to this')&&value.includes('Fleming')){
      p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');
      if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
      return p.replace(/<w:spacing[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:spacing w:before="480" w:after="120"/><w:keepLines/>');
    }
    if(!heading&&!sectionC&&!/^[•\s]*\d+\.\d+\s/.test(value))return p;
    p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');
    if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
    p=p.replace(/<w:keepLines[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepLines/>');
    if(heading){
      p=p.replace(/<w:u\b[^>]*\/>/g,'').replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,(whole,content)=>whole.replace(content,titleCase(content)));
    }
    if(heading||sectionC)p=p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');
    if(sectionC)p=p.replace(/<w:pageBreakBefore[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:pageBreakBefore/>');
    return p;
  });
  const title='<w:p><w:pPr><w:keepNext/><w:keepLines/><w:jc w:val="center"/><w:spacing w:before="0" w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>Assured Periodic Tenancy Agreement</w:t></w:r></w:p>';
  return xml.replace('<w:body>','<w:body>'+title);
}

/** Free narrative clauses from oversized table rows so normal pagination can work. */
export function formatAgreementFlow(xml:string,values:Record<string,string>):string {
 xml=xml.replace(/<w:p\s*\/>/g,'');
 const text=(part:string)=>[...part.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
 const ranges:{start:number;end:number}[]=[];let depth=0,start=0;
 for(const tag of xml.matchAll(/<w:tbl(?=[\s>])[^>]*>|<\/w:tbl>/g)){
  if(tag[0].startsWith('</')){if(--depth===0)ranges.push({start,end:tag.index!+tag[0].length});}
  else if(depth++===0)start=tag.index!;
 }
 for(const range of ranges.reverse()){
  const table=xml.slice(range.start,range.end),content=text(table);
  if(!/This agreement is dated|Shared Facilities|Ending the Tenancy/.test(content)||content.includes('Section B - Definitions'))continue;
  const properties=table.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]||'',grid=table.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]||'';
  let result='',rows='';const flush=()=>{if(rows){result+='<w:tbl>'+properties+grid+rows+'</w:tbl>';rows='';}};
  for(const match of table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)){
   const cells=[...match[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)];
   if(cells.length===1){flush();result+=cells[0][0].replace(/^<w:tc(?:\s[^>]*)?>/,'').replace(/<\/w:tc>$/,'').replace(/<w:tcPr>[\s\S]*?<\/w:tcPr>/,'');}
   else rows+=match[0];
  }
  flush();xml=xml.slice(0,range.start)+result+xml.slice(range.end);
 }
 const paragraphSpacing=(p:string,before:number,after:number)=>{
  p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
  return p.replace(/<w:spacing[^>]*\/>/g,'').replace(/<w:contextualSpacing[^>]*\/>/g,'').replace('<w:pPr>',`<w:pPr><w:contextualSpacing w:val="0"/><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>`);
 };
 let narrative=true,addendum=false,receiptPage=false,mainTerms=true;
 xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  const value=text(p);
  if(/^Section B/.test(value))mainTerms=false;
  if(value==='Signed as an agreement')narrative=false;
  if(value==='Addendum to Tenancy Agreement'){narrative=true;addendum=true;}
  if(value.startsWith('Please sign below')){narrative=false;addendum=false;receiptPage=true;}
  if(receiptPage&&value==='{{TENANT_NAMES}}')p=paragraphSpacing(p,240,60);
  if(p.includes('{{TENANT_SIGNING_SECTIONS}}'))p=p.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g,run=>run.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g,'').replace(/(<w:r(?:\s[^>]*)?>)/,'$1<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'));
  if(!narrative)return p;
  if(!value&&!/<w:drawing|<w:pict|<w:sectPr|<w:pageBreakBefore|<w:br[^>]*w:type="page"/.test(p))return '';
  if(value==='{{DEPOSIT_CONTRIBUTOR}}'&&!values.DEPOSIT_CONTRIBUTOR)return '';
  p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
  const heading=value.length<110&&/<w:b(?:\s[^>]*)?\/>/.test(p)&&/<w:u\b/.test(p);
  const longField=[...value.matchAll(/\{\{([A-Z_]+)\}\}/g)].some(m=>(values[m[1]]||'').length>700);
  p=p.replace(/<w:keepLines[^>]*\/>/g,'').replace(/<w:widowControl[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:widowControl/><w:keepLines'+(longField?' w:val="0"':'')+'/>');
  if(heading)p=p.replace(/<w:spacing[^>]*\/>/g,'').replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60" w:line="276" w:lineRule="auto"/>');
  if(mainTerms&&!heading&&value.length>110&&!p.includes('<w:numPr>'))p=paragraphSpacing(p,0,120);
  if(mainTerms&&/account details are:|cleared funds to:/.test(value))p=p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');
  if(value.startsWith('Your contact details provided'))p=p.replace(/<w:pageBreakBefore[^>]*\/>/g,'').replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');
  if(addendum&&value){
   const label=['It is agreed that:','between the Landlord:','and you, the Tenant(s):'].includes(value);
   p=paragraphSpacing(p,0,value==='Addendum to Tenancy Agreement'||value==='{{TENANT_NAMES}}'?160:label?40:p.includes('<w:numPr>')?100:120);
   if(label)p=p.replace('<w:pPr>','<w:pPr><w:keepNext/>');
  }
  if(value.includes('{{OCCUPIERS}}')){p=p.replace(/<w:br\s*\/>/g,'').replace('property:{{OCCUPIERS}}','property: {{OCCUPIERS}}');if(!longField)p=p.replace('<w:pPr>','<w:pPr><w:keepNext/>');}
  if(value==='Parking (if allocated):'||value.endsWith('shared facilities and common parts:'))p=p.replace('<w:pPr>','<w:pPr><w:keepNext/>');
  return p;
 });
 xml=xml.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,row=>{
  const label=text(row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/)?.[0]||'');
  const receipt=/^(Written Statement of Terms|EPC$|EICR$|Gas Safety Certificate$|\{\{GAS_ACKNOWLEDGEMENT\}\}$)/.test(label),intro=label.startsWith('Please sign below');
  if(!receipt&&!intro)return row;
  row=row.replace(/<w:trHeight[^>]*\/>/g,'');
  if(receipt)row=row.replace('<w:trPr>','<w:trPr><w:trHeight w:val="760" w:hRule="atLeast"/>');
  row=row.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
   if(text(p).startsWith('Written Statement of Terms')){
    const note=text(p).slice('Written Statement of Terms'.length).trim();
    return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Written Statement of Terms</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:br/><w:t>'+note+'</w:t></w:r></w:p>';
   }
   if(!text(p)&&!/<w:drawing|<w:pict/.test(p))return '';
   p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
   p=p.replace(/<w:spacing[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:spacing w:before="0" w:after="'+(intro?'120':'0')+'" w:line="240" w:lineRule="auto"/>');
   if(receipt)p=p.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g,run=>run.includes('<w:rPr>')?run.replace('<w:rPr>','<w:rPr><w:b/><w:bCs/>'):run.replace(/(<w:r(?:\s[^>]*)?>)/,'$1<w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'));return p;
  });
  return row.replace(/<w:tcPr>/g,'<w:tcPr><w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tcMar>');
 });
 xml=xml.replace(/<w:tbl\b(?:(?!<w:tbl\b)[\s\S])*?<\/w:tbl>/g,table=>{
  const contact=text(table).startsWith('Name(s):');
  if(!contact&&(!/\{\{(?:CLIENT_|BANK_)SORT_CODE\}\}/.test(table)||!text(table).startsWith('Sort Code:')))return table;
  const rows=[...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)];let index=0;
  return table.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,row=>{
   const keep=++index<rows.length||contact;
   return row.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext w:val="'+(keep?'1':'0')+'"/>'));
  });
 });
 xml=xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g,table=>text(table).startsWith('Addendum to Tenancy Agreement')?table.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,row=>!text(row)&&!/<w:drawing|<w:pict/.test(row)?'':row.replace(/<w:trHeight[^>]*\/>/g,'').replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>!text(p)&&!/<w:drawing|<w:pict|<w:sectPr|<w:pageBreakBefore|<w:br[^>]*w:type="page"/.test(p)?'':p)):table);
 // A break-only paragraph can itself spill onto a new page, creating a blank
 // sheet. Attach its break to the following content instead.
 let pendingBreak=false;
 xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  if(!text(p)&&/<w:br[^>]*w:type="page"/.test(p)&&!/<w:drawing|<w:pict|<w:sectPr/.test(p)){pendingBreak=true;return '';}
  if(pendingBreak&&text(p)){pendingBreak=false;p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');p=p.replace(/<w:pageBreakBefore[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:pageBreakBefore/>');}return p;
 });
 return xml.replace(/(<w:tc(?:\s[^>]*)?>)([\s\S]*?)(<\/w:tc>)/g,(_all,open,content,close)=>open+content+(content.includes('<w:p')?'':'<w:p/>')+close);
}

/** Keep name-to-signature spacing equal in both main and addendum signing blocks. */
export function formatSignatureSpacing(xml:string,preserveLandlordSignature=false):string {
 const text=(p:string)=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
 const spacing=(p:string,before:number,after:number)=>{
  p=p.replace(/<w:pPr\s*\/>/,'<w:pPr></w:pPr>');if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
  return p.replace(/<w:spacing[^>]*\/>/g,'').replace(/<w:contextualSpacing[^>]*\/>/g,'').replace('<w:pPr>',`<w:pPr><w:contextualSpacing w:val="0"/><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>`);
 };
 let signing=false,afterName=false,mainSigning=false,mainDate=0;
 return xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  const value=text(p);
  if(value==='Signed as an agreement'){signing=true;mainSigning=true;afterName=false;return spacing(p,360,180).replace('<w:pPr>','<w:pPr><w:keepNext/>');}
  if(/^Addendum to|^Please sign below/.test(value)){signing=false;mainSigning=false;afterName=false;}
  if(/^Signed by the parties/.test(value))signing=true;
  if(!signing)return p;
  if(mainSigning){
   if(value==='{{TENANT_SIGNING_SECTIONS}}')return spacing(p,0,0).replace('<w:pPr>','<w:pPr><w:keepNext/><w:keepLines/>');
   if(!value&&!/<w:br|<w:drawing|<w:sectPr/.test(p))return '';
   if(/^(Between the Landlord:|And you, the Tenant\(s\):)$/.test(value))return spacing(p,value.startsWith('And')?360:0,80).replace('<w:pPr>','<w:pPr><w:keepNext/>');
   if(['{{LANDLORD_SIGNATORY}}','{{TENANT_NAMES}}'].includes(value)||value.includes('(Managing Director)')){p=p.replace(/<w:sz(?:Cs)?\b[^>]*\/>/g,'').replace('<w:rPr>','<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/>');return spacing(p,0,80).replace('<w:pPr>','<w:pPr><w:keepNext/>');}
   if(value==='Landlord signature and date:')return spacing(p,0,preserveLandlordSignature?0:900).replace('<w:pPr>','<w:pPr><w:keepNext/>');
   if(value==='Signature:')return spacing(p.replace(/<w:drawing\b[\s\S]*?<\/w:drawing>|<w:drawing\b[^>]*\/>/g,''),0,preserveLandlordSignature?0:720).replace('<w:pPr>','<w:pPr><w:keepNext/>');
   if(value==='Date:'){const date=spacing(p,0,0);return ++mainDate===1?date.replace('<w:pPr>','<w:pPr><w:keepNext/>'):date;}
  }
  if(!value&&signing&&!/<w:br|<w:drawing|<w:sectPr/.test(p))return '';
  if(['{{LANDLORD_SIGNATORY}}','{{TENANT_NAMES}}'].includes(value)||value.includes('(Managing Director)')){afterName=true;return spacing(p,0,80).replace('<w:pPr>','<w:pPr><w:keepNext/>');}
  if(value){afterName=false;if(value==='Signed:')return spacing(p,0,preserveLandlordSignature?0:1080).replace(/<w:keepNext[^>]*\/>/g,'');if(/^(?:Signature:|Landlord signature and date:)$/.test(value))return spacing(p,0,0);}
  return p;
 });
}

/**
 * Fleming-owned APTs carry Robert's standing signature in the source template.
 * Put that signature directly below each landlord label, including the addendum,
 * instead of retaining it in the source paragraph before the label.
 */
export function placeCompanySignatureBelowLandlordLabels(xml:string,drawing:string):string {
  if(!drawing)return xml;
  let copy=0;
  const text=(paragraph:string)=>[...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match=>match[1]).join('').trim();
  return xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,paragraph=>{
    if(text(paragraph)!=='Landlords Signature:')return paragraph;
    const id=900+copy++;
    let numberedDrawing=drawing.replace(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>|<a:ln\b[^>]*\/>/g,'').replace('</pic:spPr>','<a:ln><a:noFill/></a:ln></pic:spPr>').replace(/<wp:docPr\b([^>]*)>/,(_match,attributes)=>{
      const withId=/\bid="[^"]*"/.test(attributes)?attributes.replace(/\bid="[^"]*"/,` id="${id}"`):`${attributes} id="${id}"`;
      return `<wp:docPr${/\bname="/.test(withId)?withId.replace(/\bname="[^"]*"/,` name="Fleming company signature ${id}"`):`${withId} name="Fleming company signature ${id}"`}>`;
    });
    numberedDrawing=numberedDrawing.replace(/<pic:cNvPr\b([^>]*)>/,(_match,attributes)=>{
      const withId=/\bid="[^"]*"/.test(attributes)?attributes.replace(/\bid="[^"]*"/,` id="${id}"`):`${attributes} id="${id}"`;
      return `<pic:cNvPr${/\bname="/.test(withId)?withId.replace(/\bname="[^"]*"/,` name="Fleming company signature ${id}"`):`${withId} name="Fleming company signature ${id}"`}>`;
    });
    const signatureParagraph='<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:r>'+numberedDrawing+'</w:r></w:p>';
    const addendumDate=copy>1?'<w:p><w:pPr><w:spacing w:before="0" w:after="280" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>Dated Signed: {{AGREEMENT_DATE}}</w:t></w:r></w:p>':'';
    return paragraph+signatureParagraph+addendumDate;
  });
}

/** Keep the visible agreement date and remove certificate notes from the agreement body. */
export function finaliseSigningBlock(xml:string,agreementDate:string):string {
  const text=(paragraph:string)=>[...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match=>match[1]).join('').trim();
  return xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,paragraph=>{
    const value=text(paragraph);
    if(/recorded electronically|electronic signature certificate|signature.+signing certificate/i.test(value))return '';
    if(value!=='Dated Signed:'||!agreementDate)return paragraph;
    let first=true;
    return paragraph.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g,(_match,open,close)=>{
      const replacement=first?`Dated Signed: ${agreementDate}`:'';first=false;return open+replacement+close;
    });
  });
}

/** Separate paragraphs reserve a signature and actual-signing-date slot per tenant. */
export function tenantSigningParagraphs(names:string[]):string {
  const paragraph=(value:string,after:number,keep:boolean)=>`<w:p><w:pPr><w:keepLines/>${keep?'<w:keepNext/>':''}<w:spacing w:before="0" w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>${xmlText(value)}</w:t></w:r></w:p>`;
  const signatureSpace='<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="868" w:lineRule="exact"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
  return names.map(name=>paragraph(name,80,true)+paragraph('Tenants Signature:',0,true)+signatureSpace+paragraph('Dated Signed:',200,false)).join('');
}

/** Client landlords use the same reserved signing space, dated only on signing. */
export function clientLandlordSigningBlocks(xml:string):string {
  const paragraphs=[...xml.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)];
  const text=(p:string)=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
  for(let i=0;i<paragraphs.length;i++){
    const p=paragraphs[i][0];if(text(p)!=='Landlords Signature:')continue;
    let old=p;
    for(let j=i+1;j<paragraphs.length;j++){
      const next=paragraphs[j][0],value=text(next);
      if(value==='Dated Signed:'){old+=next;break;}
      if(value||next.includes('<w:drawing'))break;
      old+=next;
    }
    const block=tenantSigningParagraphs(['']).replace(/<w:p>[\s\S]*?<\/w:p>/,'').replace('Tenants Signature:','Landlords Signature:');
    xml=xml.replace(old,block);
  }
  return xml;
}

/** Reclaim clause spacing before joint client signatures without shrinking the signing slots. */
export function compactClientJointSigningFlow(xml:string):string {
  let mainSigning=false;
  return xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
    const value=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
    if(value==='Signed as an agreement')mainSigning=true;
    if(value==='Addendum to Tenancy Agreement')mainSigning=false;
    const clause=/^[•\s]*(?:9\.4|10\.\d+|11\.\d+)\s/.test(value);
    const heading=/^(?:10|11)\.\s/.test(value);
    const closing=mainSigning&&value.includes('is not a party to this');
    if(clause||heading||value==='Signed as an agreement'||closing){
      if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');
      const before=clause?0:heading?80:160,after=clause?0:heading?40:80;
      p=p.replace(/<w:spacing[^>]*\/>/g,'').replace('<w:pPr>',`<w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>`);
    }
    if(mainSigning&&!closing)p=p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');
    if(closing)mainSigning=false;
    return p;
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
      const initialAccount=input.companySettings?.clientAccount||FLEMING_CLIENT_MONEY_ACCOUNT;
      const landlordAddress=(isClient?input.landlord.serviceAddress?.trim():null)||input.landlord.address||'';
      const values: Record<string, string> = {
        LANDLORD_NAME:input.landlord.name,
        LANDLORD_IDENTITY:`${input.landlord.name}, of ${landlordAddress}${input.landlord.companyNumber ? ', Company number: '+input.landlord.companyNumber : ''}`,
        LANDLORD_SIGNATORY:input.landlord.signingName||input.landlord.name,
        LANDLORD_EMAIL:input.landlord.email||'',LANDLORD_PHONE:input.landlord.phone||'',
        SERVICE_ADDRESS:input.landlord.serviceAddress||input.landlord.address||'',EMERGENCY_CONTACT:input.landlord.emergencyContact||'',
        CLIENT_SORT_CODE:initialAccount.sortCode,CLIENT_ACCOUNT_NUMBER:initialAccount.accountNumber,INITIAL_ACCOUNT_NAME:initialAccount.accountName,INITIAL_BANK_NAME:initialAccount.bankName||'Not supplied',BANK_ACCOUNT_NAME:input.bankDetails.accountName,BANK_NAME:input.bankDetails.bankName||'Not supplied',
        BANK_SORT_CODE:input.bankDetails.sortCode,BANK_ACCOUNT_NUMBER:input.bankDetails.accountNumber,
        HOLDING_DEPOSIT:Number(input.holdingDeposit||0).toLocaleString('en-GB',{minimumFractionDigits:2}),DEPOSIT_SCHEME:input.depositScheme||'',
        AGREEMENT_DATE: date(input.agreementDate), START_DATE: date(input.tenancyStartDate),
        RENT_DAY: isClient ? date(input.tenancyStartDate).split(' ')[0] : input.tenancyStartDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' }),
        TENANT_NAMES: names, PROPERTY_ADDRESS: input.propertyAddress,
        RENT: input.rent.toLocaleString('en-GB',{minimumFractionDigits:2}), DEPOSIT: input.deposit.toLocaleString('en-GB',{minimumFractionDigits:2}), PAYMENT_REFERENCE: input.paymentReference,
        OCCUPIERS: input.permittedOccupiers || 'None', SHARED_FACILITIES: input.sharedFacilities || 'None', PARKING: input.parking || 'None',
        TENANT_EMAILS: input.tenants.map(t => t.email).filter(Boolean).join('; '),
        TENANT_PHONES: input.tenants.map(t => t.phone).filter(Boolean).join('; '),
        TENANT_ADDRESSES: input.tenants.map(t => `${t.name}: ${t.address || 'Not supplied'}`).join('\n'),
        TENANT_SIGNING_SECTIONS: input.tenants.map(t => `${t.name}\nTenants Signature:\n\n\n\n`).join('\n\n'),
        DEPOSIT_CONTRIBUTOR: input.depositContributorDetails ? `Deposit contribution disclosed by the tenant(s): ${input.depositContributorDetails}` : '',
        GAS_ACKNOWLEDGEMENT: input.hasGas ? 'Gas Safety Certificate' : 'Gas Safety Certificate: not applicable (no gas connection)',
      };
      let xml = zip.file('word/document.xml')!.asText();
      // The supplied internal APT contains one image: the company signature.
      // Capture it before repaginating so it can be placed below both labels.
      const companySignatureDrawing=input.agreementType==='internal'?xml.match(/<w:drawing\b[\s\S]*?<\/w:drawing>/)?.[0]||'':'';
      if(isClient)xml=prepareClientPaymentTemplate(xml,input.serviceType);
      xml=isClient?formatClientContractLayout(xml):formatContractLayout(xml);
      xml=formatSignatureSpacing(formatAgreementFlow(formatAptPresentation(xml,input.hasGas),values),input.agreementType==='internal');
      // Only the signing labels change; preserve the surrounding agreement wording.
      let signatureRole='Landlords',mainSignatureLabels=false;
      xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
        const value=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
        if(value==='Signed as an agreement')mainSignatureLabels=true;
        if(value.startsWith('Addendum to'))mainSignatureLabels=false;
        if(/Between the Landlord:|between the Landlord:/.test(value)||value==='{{LANDLORD_SIGNATORY}}'||value.includes('(Managing Director)'))signatureRole='Landlords';
        if(/(?:And|and) you, the Tenant\(s\):/.test(value)||value==='{{TENANT_NAMES}}')signatureRole='Tenants';
        const label=value==='Landlord signature and date:'?'Landlords Signature:':['Signature:','Signed:'].includes(value)?`${signatureRole} Signature:`:value==='Date:'||mainSignatureLabels&&value.startsWith('Date:')?'Dated Signed:':null;
        if(!label)return p;let first=true;
        return p.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g,(_m,open,close)=>{const replacement=first?label:'';first=false;return open+replacement+close;});
      });
      if(input.agreementType==='internal')xml=placeCompanySignatureBelowLandlordLabels(xml,companySignatureDrawing);
      if(input.companySettings){xml=companyTemplateText(xml,input.companySettings,isClient?'client':'internal');await applyCompanyImages(zip,input.companySettings,!isClient);}
      xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
        if (!(key in values)) throw new Error(`Unfilled agreement field: ${key}`);
        return xmlText(values[key]);
      });
      if (/#####|\{\{[A-Z_]+\}\}/.test(xml)) throw new Error('Agreement template contains an unfilled field');
      // Filled fields are final contract text; remove the template's drafting highlights.
      xml=xml.replace(/<w:highlight[^>]*\/>/g,'').replace(/<w:shd[^>]*w:fill="FFFF00"[^>]*\/>/gi,'');
      // Keep the supplied wording and layout while applying the requested body font.
      xml=xml.replace(/<w:rFonts[^>]*\/>/g, '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
      xml=finaliseSigningBlock(xml,isClient?'':values.AGREEMENT_DATE);
      // Keep the tenant date blank until the captured signing timestamp exists.
      const tenantBlocks=tenantSigningParagraphs(input.tenants.map(tenant=>tenant.name));
      // The addendum has a separate names paragraph followed by its signature label.
      const paragraphs=[...xml.matchAll(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g)];
      const paragraphText=(p:string)=>[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('').trim();
      for(let index=0;index<paragraphs.length-1;index++){
        const first=paragraphs[index][0],second=paragraphs[index+1][0];
        if(paragraphText(first)===xmlText(names)&&paragraphText(second)==='Tenants Signature:')xml=xml.replace(first+second,tenantBlocks);
      }
      xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
        const text=paragraphText(p);
        return text.includes('Tenants Signature:')&&text!=='Tenants Signature:'?tenantBlocks:p;
      });
      if(isClient)xml=clientLandlordSigningBlocks(xml);
      if(isClient&&input.tenants.length>1)xml=compactClientJointSigningFlow(xml);
      let previousSigningText='';
      xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
        const value=paragraphText(p);
        if(value==='Dated Signed:'&&previousSigningText===value)return '';
        if(value)previousSigningText=value;
        return p;
      });
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
