import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {companyTemplateText,applyCompanyImages} from './company-document';
import sharp from 'sharp';
import {COMPANY_DEFAULTS,type CompanySettings} from './company-settings-values';
it.each(['full_management','let_only','rent_collection'])('omits CMP expiry while retaining membership and other dates: %s',service=>{
 const c:CompanySettings={...COMPANY_DEFAULTS,redress:{...COMPANY_DEFAULTS.redress,expiry:'2027-02-03'},signer:{name:'Example',title:'Director',userId:null,signature:''}};
 const zip=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',`service-${service}.docx`)));
 const text=companyTemplateText(zip.file('word/document.xml')!.asText(),c,'service').replace(/<[^>]+>/g,'');
 expect(text).toContain('Client Money Protect – membership no. CMP012565');
 expect(text).not.toContain('07/12/2026');
 expect(text).toContain('03/02/2027');
 expect(c.cmp.expiry).toBe('2026-12-07');
});
it.each(['client-let-only-aug26.docx','client-rent-collection-aug26.docx','assured-periodic-tenancy-template.docx','service-full_management.docx'])('preserves the full-width white margin below the letterhead: %s',async name=>{
 const zip=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',name)));
 const rel=Object.keys(zip.files).find(n=>/^word\/_rels\/header\d+\.xml\.rels$/.test(n))!;
 const target='word/'+zip.file(rel)!.asText().match(/Target="(media\/[^"]+)"/)![1];
 const original=await sharp(zip.file(target)!.asNodeBuffer()).removeAlpha().raw().toBuffer({resolveWithObject:true});
 await applyCompanyImages(zip,{...COMPANY_DEFAULTS,signer:{name:'Example',title:'Director',userId:null,signature:''}},false);
 const updated=await sharp(zip.file(target)!.asNodeBuffer()).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const width=original.info.width,channels=original.info.channels,y=original.info.height-1;
 for(const x of [Math.floor(width*.5),Math.floor(width*.75),width-1]){const i=(y*width+x)*channels;expect([...updated.data.subarray(i,i+3)]).toEqual([...original.data.subarray(i,i+3)]);}
});
