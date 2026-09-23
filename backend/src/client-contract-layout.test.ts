import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import {formatClientContractLayout} from './tenancy-template';
it.each(['client-let-only-aug26.docx','client-rent-collection-aug26.docx'])('preserves every word and field while laying out %s',filename=>{
 const zip=new PizZip(fs.readFileSync(path.join(__dirname,'agreement-assets',filename)));
 const original=zip.file('word/document.xml')!.asText(),formatted=formatClientContractLayout(original);
 const words=(xml:string)=>[...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m=>m[1]).join('').replace(/\s+/g,' ').trim();
 expect(words(formatted)).toBe(words(original));
 expect(formatted).toContain('<w:cantSplit/>');expect(formatted).toContain('<w:keepLines/>');
});
