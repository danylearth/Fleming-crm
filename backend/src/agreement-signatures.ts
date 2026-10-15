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
  const tenantLabelCount=(stdout.match(/>Tenants<\/word>\s*<word[^>]*>Signature:<\/word>/g)||[]).length;
  const separateTenantSlots=tenantLabelCount===tenants.length*2;
  let tenantSlotIndex=0;
  const images=await Promise.all([...tenants,landlord].map(async s=>s?pdf.embedPng(await cropSignature(s.image)):null));
  const stamp=(pageIndex:number,top:number,signer:Signer|null,imageIndex:number,x:number,width:number,height=18,dateX=x,dateSlot?:{x:number;top:number;label?:string},embedded=false,writeSigningDate=true)=>{
    const image=images[imageIndex];if(!signer||!image)return;
    const alignedDate=separateTenantSlots?dateSlot:undefined;
    const page=pdf.getPage(pageIndex),scaled=image.scaleToFit(width,alignedDate?Math.max(8,Math.min(height,alignedDate.top-top-16)):height);
    if(!embedded)page.drawImage(image,{x,y:alignedDate?page.getHeight()-alignedDate.top+16:page.getHeight()-top-height,width:scaled.width,height:scaled.height});
    const date=formalAgreementDate(new Date(signer.date));
    if(writeSigningDate){
      if(dateSlot)page.drawText(date,{x:dateSlot.x+font.widthOfTextAtSize((dateSlot.label||'Dated Signed:')+' ',10),y:page.getHeight()-dateSlot.top-9,size:10,font});
      else page.drawText(`Dated Signed: ${date}`,{x:dateX,y:page.getHeight()-top-height-12,size:10,font});
    }
  };
  for(const [i,match] of pages.entries()){
    const words=[...match[1].matchAll(/<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map(w=>({x:Number(w[1]),top:Number(w[2]),text:w[3]}));
    const text=words.map(w=>w.text).join(' ');
    // New contracts give every signer a separate block, which may start on a
    // continuation page. Walk labels in document order, not just heading pages.
    if(separateTenantSlots){
      const slots=words.filter((w,j)=>['Landlords','Tenants'].includes(w.text)&&words[j+1]?.text==='Signature:');
      slots.forEach((slot,index)=>{
        const date=words.find((w,j)=>w.text==='Dated'&&words[j+1]?.text==='Signed:'&&w.top>slot.top&&(!slots[index+1]||w.top<slots[index+1].top));
        if(slot.text==='Tenants'){
          const signerIndex=tenantSlotIndex++%tenants.length;
          stamp(i,slot.top+15,tenants[signerIndex],signerIndex,slot.x,200,43.4,slot.x,date);
        }else if(!text.includes('(Managing Director)')&&!text.includes('Between us, the Landlord:')){
          stamp(i,slot.top+15,landlord,tenants.length,slot.x,200,43.4,slot.x,date);
        }
      });
    }
    // Support both newly generated labels and already-issued signing links.
    if(!separateTenantSlots&&text.includes('Signed as an agreement')) {
      const slots=words.filter((w,j)=>w.text==='Signature:'&&!['Landlords','Tenants'].includes(words[j-1]?.text)||['Landlords','Tenants'].includes(w.text)&&words[j+1]?.text==='Signature:'||w.text==='Landlord'&&words[j+1]?.text==='signature'&&words[j+2]?.text==='and'||w.text==='Signature'&&words[j+1]?.text==='and'&&words[j+2]?.text==='date:');
      const dates=words.filter(w=>w.text==='Dated'||w.text==='Date:').map(w=>({...w,label:w.text==='Date:'?'Date:':'Dated Signed:'}));
      const dateFor=(slot:{top:number},next?:{top:number})=>dates.find(w=>w.top>slot.top&&(!next||w.top<next.top));
      if(slots.length>=2){
        const owner=slots[0],companyEmbedded=text.includes('Between us, the Landlord:');if(!companyEmbedded)stamp(i,owner.top+15,landlord,tenants.length,owner.x,180,24,owner.x,dateFor(owner,slots[1]));
        tenants.forEach((signer,index)=>{const separate=slots.length>2,slot=slots[separate?index+1:1];if(!slot)return;const offset=separate?0:index*260,date=dateFor(slot,slots[separate?index+2:2]);if(offset&&signer&&date)pdf.getPage(i).drawText(date.label,{x:date.x+offset,y:pdf.getPage(i).getHeight()-date.top-9,size:10,font});stamp(i,slot.top+15,signer,index,slot.x+offset,200,24,slot.x+offset,date?{...date,x:date.x+offset}:undefined);});
      }
    }
    if(!separateTenantSlots&&text.includes('This Addendum forms part')){
      const slots=words.filter((w,j)=>w.text==='Signed:'&&words[j-1]?.text!=='Dated'||['Landlords','Tenants'].includes(w.text)&&words[j+1]?.text==='Signature:');
      if(slots.length<2)throw new Error('The addendum signing spaces could not be located');
      const legacy=slots[0].text==='Signed:';
      const companyEmbedded=text.includes('(Managing Director)')&&text.includes('Fleming Lettings');
      if(!companyEmbedded)stamp(i,slots[0].top+(legacy?1:15),landlord,tenants.length,slots[0].x+(legacy?42:0),160,24,slots[0].x);
      tenants.forEach((signer,index)=>{const separate=slots.length>2,slot=slots[separate?index+1:1];if(!slot)return;const offset=separate?0:index*245;const date=words.find((w,j)=>w.text==='Dated'&&words[j+1]?.text==='Signed:'&&w.top>slot.top&&(!slots[index+2]||w.top<slots[index+2].top));stamp(i,slot.top+(legacy?1:15),signer,index,slot.x+(legacy?42:0)+offset,200,24,slot.x+offset,date?{...date,x:date.x+offset}:undefined);});
    }
    if(text.includes('Written Statement') && text.includes('EPC')) {
      const receipts=words.filter((word,index)=>(word.text==='Written'&&words[index+1]?.text==='Statement') || (word.text==='The'&&words[index+1]?.text.startsWith('Renters')) || word.text==='EPC' || word.text==='EICR' || (word.text==='Gas'&&!text.includes('not applicable')));
      const signers=tenants,columnWidth=374/Math.max(signers.length,1);
      for(const receipt of receipts)signers.forEach((signer,index)=>{
        const image=images[index];if(!signer||!image)return;
        const page=pdf.getPage(i),x=181+index*columnWidth,size=image.scaleToFit(columnWidth-12,12);
        const label=signer.name;let fontSize=8;while(font.widthOfTextAtSize(label,fontSize)>columnWidth-12&&fontSize>6)fontSize-=.25;
        page.drawText(label,{x,y:page.getHeight()-receipt.top-5,size:fontSize,font});
        page.drawImage(image,{x,y:page.getHeight()-receipt.top-19,width:size.width,height:size.height});
        page.drawText(formalAgreementDate(new Date(signer.date)),{x,y:page.getHeight()-receipt.top-29,size:8,font});
      });
    }
  }
}
