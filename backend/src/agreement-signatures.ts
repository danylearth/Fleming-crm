import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PDFDocument,PDFFont,rgb} from 'pdf-lib';
const exec=promisify(execFile);
type Signer={name:string;date:string;image:Uint8Array};
/** Place the captured signatures in the supplied contract's signing spaces. */
export async function stampAgreementSignatures(pdf:PDFDocument,source:string,font:PDFFont,tenants:Signer[],landlord:Signer){
  const {stdout}=await exec('pdftotext',['-bbox',source,'-'],{timeout:10000,maxBuffer:4*1024*1024});
  const pages=[...stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  const images=await Promise.all([...tenants,landlord].map(s=>pdf.embedPng(s.image)));
  const stamp=(pageIndex:number,top:number,signer:Signer,imageIndex:number,x:number,width:number)=>{
    const page=pdf.getPage(pageIndex),image=images[imageIndex],scaled=image.scaleToFit(width,24);
    page.drawImage(image,{x,y:page.getHeight()-top-24,width:scaled.width,height:scaled.height});
    page.drawText(`Signed on: ${new Date(signer.date).toLocaleDateString('en-GB',{timeZone:'Europe/London'})}`,{x,y:page.getHeight()-top-34,size:8,font});
  };
  for(const [i,match] of pages.entries()){
    const words=[...match[1].matchAll(/<word\b[^>]*yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map(w=>({top:Number(w[1]),text:w[2]}));
    const text=words.map(w=>w.text).join(' ');
    if(text.includes('This Addendum forms part')){
      const slots=words.filter(w=>w.text==='Signed:');
      if(slots.length!==2)throw new Error('The addendum signing spaces could not be located');
      stamp(i,slots[0].top-4,landlord,tenants.length,85,160);
      tenants.forEach((signer,index)=>stamp(i,slots[1].top-4,signer,index,85+index*245,200));
    }
    const slots=words.filter((w,j)=>w.text==='Signature'&&words[j+1]?.text==='and'&&words[j+2]?.text==='date:');
    if(text.includes('Tenant(s):')&&slots.length===tenants.length){
      slots.forEach((slot,index)=>{
        const page=pdf.getPage(i);
        page.drawRectangle({x:28,y:page.getHeight()-slot.top-14,width:535,height:17,color:rgb(1,1,1)});
        // Compact signatures fit within the source document's existing line spacing.
        const image=images[index],scaled=image.scaleToFit(130,18);
        page.drawImage(image,{x:30,y:page.getHeight()-slot.top-17,width:scaled.width,height:scaled.height});
        page.drawText(`Signed on: ${new Date(tenants[index].date).toLocaleDateString('en-GB',{timeZone:'Europe/London'})}`,{x:185,y:page.getHeight()-slot.top-10,size:8,font});
      });
    }
  }
}
