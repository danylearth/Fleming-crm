import {formalAgreementDate} from './tenancy-template';
import {cropSignature} from './signature-image';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PDFDocument,PDFFont,rgb} from 'pdf-lib';
const exec=promisify(execFile);
type Signer={name:string;date:string;image:Uint8Array};
/** Place the captured signatures in the supplied contract's signing spaces. */
export async function stampAgreementSignatures(pdf:PDFDocument,source:string,font:PDFFont,tenants:(Signer|null)[],landlord:Signer|null){
  const {stdout}=await exec('pdftotext',['-bbox',source,'-'],{timeout:10000,maxBuffer:4*1024*1024});
  const pages=[...stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  const images=await Promise.all([...tenants,landlord].map(async s=>s?pdf.embedPng(await cropSignature(s.image)):null));
  const stamp=(pageIndex:number,top:number,signer:Signer|null,imageIndex:number,x:number,width:number,height=18,dateX=x)=>{
    const image=images[imageIndex];if(!signer||!image)return;
    const page=pdf.getPage(pageIndex),scaled=image.scaleToFit(width,height);
    page.drawImage(image,{x,y:page.getHeight()-top-height,width:scaled.width,height:scaled.height});
    page.drawText(`Signed on: ${formalAgreementDate(new Date(signer.date))}`,{x:dateX,y:page.getHeight()-top-height-8,size:7,font});
  };
  for(const [i,match] of pages.entries()){
    const words=[...match[1].matchAll(/<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map(w=>({x:Number(w[1]),top:Number(w[2]),text:w[3]}));
    const text=words.map(w=>w.text).join(' ');
    // Client templates label the main signing spaces simply "Signature:".
    if(text.includes('Signed as an agreement')) {
      const clientSlots=words.filter(w=>w.text==='Signature:');
      if(clientSlots.length>=2) {
        stamp(i,clientSlots[0].top+13,landlord,tenants.length,35,180);
        tenants.forEach((signer,index)=>stamp(i,clientSlots[1].top+13,signer,index,35+index*260,200));
      }
    }
    if(text.includes('This Addendum forms part')){
      const slots=words.filter(w=>w.text==='Signed:');
      if(slots.length!==2)throw new Error('The addendum signing spaces could not be located');
      stamp(i,slots[0].top+1,landlord,tenants.length,slots[0].x+42,160,24,slots[0].x);
      tenants.forEach((signer,index)=>stamp(i,slots[1].top+1,signer,index,slots[1].x+42+index*245,200,24,slots[1].x+index*245));
    }
    if(text.includes('Written Statement') && text.includes('EPC')) {
      const receipts=words.filter((word,index)=>(word.text==='Written'&&words[index+1]?.text==='Statement') || (word.text==='The'&&words[index+1]?.text.startsWith('Renters')) || word.text==='EPC' || word.text==='EICR' || (word.text==='Gas'&&!text.includes('not applicable')));
      const signers=[...tenants,landlord],columnWidth=350/signers.length;
      for(const receipt of receipts)signers.forEach((signer,index)=>{
        const image=images[index];if(!signer||!image)return;
        const page=pdf.getPage(i),x=205+index*columnWidth,size=image.scaleToFit(columnWidth-12,9);
        const label=signer.name;let fontSize=5;while(font.widthOfTextAtSize(label,fontSize)>columnWidth-12&&fontSize>4)fontSize-=.25;
        page.drawText(label,{x,y:page.getHeight()-receipt.top-1,size:fontSize,font});
        page.drawImage(image,{x,y:page.getHeight()-receipt.top-12,width:size.width,height:size.height});
        page.drawText(formalAgreementDate(new Date(signer.date)),{x,y:page.getHeight()-receipt.top-19,size:5,font});
      });
    }
    const landlordSlot=words.find((w,j)=>w.text==='Landlord'&&words[j+1]?.text==='signature'&&words[j+2]?.text==='and'&&words[j+3]?.text==='date:');
    if(landlordSlot)stamp(i,landlordSlot.top+12,landlord,tenants.length,landlordSlot.x,180,20);
    const slots=words.filter((w,j)=>w.text==='Signature'&&words[j+1]?.text==='and'&&words[j+2]?.text==='date:');
    if(text.includes('Tenant(s):')&&slots.length===tenants.length){
      slots.forEach((slot,index)=>{
        if(!tenants[index]||!images[index])return;
        stamp(i,slot.top+12,tenants[index],index,slot.x,160,16);
      });
    }
  }
}
