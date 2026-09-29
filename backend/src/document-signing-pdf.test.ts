import {it,expect} from 'vitest';import {PDFDocument,degrees} from 'pdf-lib';import sharp from 'sharp';import {validateSignatureFields,completeSigningPdf,prepareSigningPdf,signingPagePng} from './document-signing-pdf';
import {appendSigningCertificate} from './signing-certificate';
const field={recipient_id:1,page:0,x:.1,y:.7,width:.3,height:.1},pages=[{width:595,height:842}];
it('records IP, local date/time and UTC timestamp only once every recipient has signed',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();
 await expect(appendSigningCertificate(pdf,[{name:'Waiting',signed_at:''}],'abc')).rejects.toThrow('All recipients');
 expect(pdf.getPageCount()).toBe(1);
 const lines=(await appendSigningCertificate(pdf,[{name:'Test Signer',email:'test@example.test',signed_at:'2026-09-28T13:05:06Z',signing_ip:'203.0.113.42'}],'a'.repeat(64))).flat().join('\n');
 expect(lines).toContain('IP address: 203.0.113.42');expect(lines).toContain('28/09/2026, 14:05:06 (Europe/London)');expect(lines).toContain('2026-09-28T13:05:06.000Z');expect(lines).toContain('a'.repeat(64));expect(pdf.getPageCount()).toBe(2);
});
it('continues the certificate onto additional pages for many signers',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();
 const sheets=await appendSigningCertificate(pdf,Array.from({length:12},(_,i)=>({name:`Signer ${i+1}`,signed_at:'2026-09-28T13:05:06Z'})),'hash');
 expect(sheets.length).toBeGreaterThan(1);expect(sheets.every(lines=>lines.length<=34)).toBe(true);expect(sheets.flat().join('\n')).toContain('Signatory 12: Signer 12');expect(pdf.getPageCount()).toBe(sheets.length+1);
});
it('supports typed fields, saves incomplete drafts and still requires each signature before sending',()=>{
 const initials={...field,type:'initials',width:.08,height:.03};
 expect(validateSignatureFields([initials],pages,[{id:1}],true)[0].type).toBe('initials');
 expect(validateSignatureFields([],pages,[{id:1}],true)).toEqual([]);
 expect(()=>validateSignatureFields([initials],pages,[{id:1}])).toThrow('Every recipient');
 expect(()=>validateSignatureFields([{...field,type:'unknown'}],pages,[{id:1}])).toThrow();
 expect(validateSignatureFields([field,initials,{...field,type:'date'}],pages,[{id:1}])).toHaveLength(3);
});
it('renders separate signature, initials and date fields into the completed PDF',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);
 const signature=await sharp({create:{width:100,height:20,channels:4,background:'#111'}}).png().toBuffer();
 const initials=await sharp({create:{width:30,height:30,channels:4,background:'#444'}}).png().toBuffer();
 const fields=[{...field,type:'signature' as const,y:.2},{...field,type:'initials' as const,y:.4,width:.08,height:.04},{...field,type:'date' as const,y:.6}];
 const result=await completeSigningPdf(Buffer.from(await pdf.save()),fields,[{id:1,name:'Test Signer',email:'test@example.test',signed_at:'2026-09-27T13:00:00Z',signature,initials}],'source');
 expect((await PDFDocument.load(result)).getPageCount()).toBe(2);
 const png=await signingPagePng(result,0);expect(png.length).toBeGreaterThan(1000);
});
it('requires a field for every selected recipient and rejects out of bounds fields',()=>{expect(()=>validateSignatureFields([field],pages,[{id:1},{id:2}])).toThrow('Every recipient');expect(()=>validateSignatureFields([{...field,x:.9}],pages,[{id:1}])).toThrow('within');expect(()=>validateSignatureFields([{...field,page:2}],pages,[{id:1}])).toThrow('within');expect(validateSignatureFields([field],pages,[{id:1}])).toEqual([field]);});
it('stamps both signers and includes a completion audit page',async()=>{const p=await PDFDocument.create();p.addPage([595,842]);const bytes=Buffer.from(await p.save());expect((await prepareSigningPdf(bytes,'.pdf')).pages).toEqual(pages);const signature=await sharp({create:{width:80,height:20,channels:4,background:'#222'}}).png().toBuffer();const people=[1,2].map(id=>({id,name:'Test Signer '+id,email:`signer${id}@example.test`,signed_at:'2026-09-26T10:00:00Z',signature}));const result=await completeSigningPdf(bytes,[field,{...field,recipient_id:2,y:.85}],people,'a'.repeat(64));const signed=await PDFDocument.load(result);expect(signed.getPageCount()).toBe(3);expect(result.length).toBeGreaterThan(bytes.length);});

it.each([0,90,180,270])('places signatures at the preview position on a %s degree cropped page',async(rotation)=>{
 const pdf=await PDFDocument.create();const page=pdf.addPage([600,800]);page.setCropBox(30,40,540,720);page.setRotation(degrees(rotation));const prepared=await prepareSigningPdf(Buffer.from(await pdf.save()),'.pdf');expect(prepared.pages).toEqual(rotation%180?[{width:720,height:540}]:[{width:540,height:720}]);
 const signature=await sharp({create:{width:120,height:30,channels:4,background:'#111'}}).png().toBuffer();const signed=await completeSigningPdf(prepared.bytes,[field],[{id:1,name:'TEST',email:'test@example.test',signed_at:'2026-09-27T12:00:00Z',signature}],'test');const png=await signingPagePng(signed,0);const meta=await sharp(png).metadata();const crop=await sharp(await sharp(png).extract({left:Math.round(meta.width!*.12),top:Math.round(meta.height!*.72),width:Math.round(meta.width!*.12),height:Math.round(meta.height!*.015)}).toBuffer()).stats();expect(crop.channels[0].mean).toBeLessThan(100);
});

it('includes stored declarations and signature alongside branded letterhead without inventing historical consent',async()=>{
 const {signingConsentSnapshot,SIGNING_CONSENT_VERSION}=await import('./signing-consent');
 const signature=await sharp({create:{width:100,height:20,channels:4,background:'#333'}}).png().toBuffer();
 const pdf=await PDFDocument.create();pdf.addPage();
 const consent_snapshot=signingConsentSnapshot({consentVersion:SIGNING_CONSENT_VERSION,acknowledgements:{terms:true,legalEffect:true,declaration:true}});
 const sheets=await appendSigningCertificate(pdf,[{name:'Alex Example',signed_at:'2026-09-28T11:12:54Z',signature,consent_snapshot}],'a'.repeat(64));
 expect(sheets.flat().join(' ')).toContain('signing creates legally binding obligations');expect(sheets.flat().join(' ')).toContain('Declaration version: 2026-09-28');
 expect(pdf.getPageCount()).toBe(2);expect(pdf.getPage(1).node.Resources()?.toString()).toContain('Image');
 const old=await PDFDocument.create();old.addPage();const lines=await appendSigningCertificate(old,[{name:'Earlier signer',signed_at:'2026-09-28T11:12:54Z',signature}],'hash');
 expect(lines.flat().join(' ')).toContain('Individual declaration wording was not recorded');expect(lines.flat().join(' ')).not.toContain('I have read');
});
