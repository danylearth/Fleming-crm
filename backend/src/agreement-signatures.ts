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
  const stamp=(pageIndex:number,top:number,signer:Signer|null,imageIndex:number,x:number,width:number,height=18,dateX=x,dateSlot?:{x:number;top:number;label?:string},embedded=false,writeSigningDate=false)=>{
    const image=images[imageIndex];if(!signer||!image)return;
    const page=pdf.getPage(pageIndex),scaled=image.scaleToFit(width,height);
    if(!embedded)page.drawImage(image,{x,y:page.getHeight()-top-height,width:scaled.width,height:scaled.height});
    const date=new Date(signer.date).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
    if(writeSigningDate){
      if(dateSlot)page.drawText(date,{x:dateSlot.x+font.widthOfTextAtSize((dateSlot.label||'Dated Signed:')+' ',10),y:page.getHeight()-dateSlot.top-9,size:10,font});
      else page.drawText(`Dated Signed: ${date}`,{x:dateX,y:page.getHeight()-top-height-12,size:10,font});
    }
  };
  for(const [i,match] of pages.entries()){
    const words=[...match[1].matchAll(/<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map(w=>({x:Number(w[1]),top:Number(w[2]),text:w[3]}));
    const text=words.map(w=>w.text).join(' ');
    // Support both newly generated labels and already-issued signing links.
    if(text.includes('Signed as an agreement')) {
      const slots=words.filter((w,j)=>w.text==='Signature:'&&!['Landlords','Tenants'].includes(words[j-1]?.text)||['Landlords','Tenants'].includes(w.text)&&words[j+1]?.text==='Signature:'||w.text==='Landlord'&&words[j+1]?.text==='signature'&&words[j+2]?.text==='and'||w.text==='Signature'&&words[j+1]?.text==='and'&&words[j+2]?.text==='date:');
      const dates=words.filter(w=>w.text==='Dated'||w.text==='Date:').map(w=>({...w,label:w.text==='Date:'?'Date:':'Dated Signed:'}));
      const dateFor=(slot:{top:number},next?:{top:number})=>dates.find(w=>w.top>slot.top&&(!next||w.top<next.top));
      if(slots.length>=2){
        const owner=slots[0];stamp(i,owner.top+15,landlord,tenants.length,owner.x,180,24,owner.x,dateFor(owner,slots[1]),text.includes('Between us, the Landlord:')&&owner.text==='Signature:',false);
        tenants.forEach((signer,index)=>{const separate=slots.length>2,slot=slots[separate?index+1:1];if(!slot)return;const offset=separate?0:index*260,date=dateFor(slot,slots[separate?index+2:2]);if(offset&&signer&&date)pdf.getPage(i).drawText(date.label,{x:date.x+offset,y:pdf.getPage(i).getHeight()-date.top-9,size:10,font});stamp(i,slot.top+15,signer,index,slot.x+offset,200,24,slot.x+offset,date?{...date,x:date.x+offset}:undefined);});
      }
    }
    if(text.includes('This Addendum forms part')){
      const slots=words.filter((w,j)=>w.text==='Signed:'||['Landlords','Tenants'].includes(w.text)&&words[j+1]?.text==='Signature:');
      if(slots.length!==2)throw new Error('The addendum signing spaces could not be located');
      const legacy=slots[0].text==='Signed:';
      stamp(i,slots[0].top+(legacy?1:15),landlord,tenants.length,slots[0].x+(legacy?42:0),160,24,slots[0].x);
      tenants.forEach((signer,index)=>stamp(i,slots[1].top+(legacy?1:15),signer,index,slots[1].x+(legacy?42:0)+index*245,200,24,slots[1].x+index*245));
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
