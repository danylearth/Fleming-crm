import {formalAgreementDate} from './tenancy-template';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PDFDocument,PDFFont,rgb} from 'pdf-lib';
const exec=promisify(execFile);
type Signer={name:string;date:string;image:Uint8Array};
/** Place the captured signatures in the supplied contract's signing spaces. */
export async function stampAgreementSignatures(pdf:PDFDocument,source:string,font:PDFFont,tenants:(Signer|null)[],landlord:Signer|null){
  const {stdout}=await exec('pdftotext',['-bbox',source,'-'],{timeout:10000,maxBuffer:4*1024*1024});
  const pages=[...stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  const images=await Promise.all([...tenants,landlord].map(s=>s?pdf.embedPng(s.image):null));
  const stamp=(pageIndex:number,top:number,signer:Signer|null,imageIndex:number,x:number,width:number,compact=false)=>{
    const image=images[imageIndex];if(!signer||!image)return;
    const page=pdf.getPage(pageIndex),scaled=image.scaleToFit(compact?70:width,compact?26:20);
    page.drawImage(image,{x,y:page.getHeight()-top-(compact?26:20),width:scaled.width,height:scaled.height});
    page.drawText(`Signed on: ${formalAgreementDate(new Date(signer.date))}`,{x:compact?x+76:x,y:page.getHeight()-top-(compact?17:28),size:compact?6.5:8,font});
  };
  for(const [i,match] of pages.entries()){
    const words=[...match[1].matchAll(/<word\b[^>]*yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map(w=>({top:Number(w[1]),text:w[2]}));
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
      stamp(i,slots[0].top+1,landlord,tenants.length,85,160);
      tenants.forEach((signer,index)=>stamp(i,slots[1].top+1,signer,index,85+index*245,200));
    }
    if(text.includes('Written Statement') && text.includes('EPC')) {
      const receipts=words.filter((word,index)=>(word.text==='Written'&&words[index+1]?.text==='Statement') || (word.text==='The'&&words[index+1]?.text.startsWith('Renters')) || word.text==='EPC' || word.text==='EICR' || (word.text==='Gas'&&!text.includes('not applicable')));
      for(const receipt of receipts)tenants.forEach((signer,index)=>stamp(i,receipt.top,signer,index,190+index*195,145,true));
    }
    const landlordSlot=words.find((w,j)=>w.text==='Landlord'&&words[j+1]?.text==='signature'&&words[j+2]?.text==='and'&&words[j+3]?.text==='date:');
    if(landlordSlot)stamp(i,landlordSlot.top+18,landlord,tenants.length,30,160);
    const slots=words.filter((w,j)=>w.text==='Signature'&&words[j+1]?.text==='and'&&words[j+2]?.text==='date:');
    if(text.includes('Tenant(s):')&&slots.length===tenants.length){
      slots.forEach((slot,index)=>{
        if(!tenants[index]||!images[index])return;
        const page=pdf.getPage(i);
        page.drawRectangle({x:20,y:page.getHeight()-slot.top-14,width:550,height:17,color:rgb(1,1,1)});
        // The source template reserves space below each signing label.
        const image=images[index]!,scaled=image.scaleToFit(160,32);
        page.drawImage(image,{x:30,y:page.getHeight()-slot.top-32,width:scaled.width,height:scaled.height});
        page.drawText(`Signed on: ${formalAgreementDate(new Date(tenants[index]!.date))}`,{x:215,y:page.getHeight()-slot.top-22,size:8,font});
      });
    }
  }
}
