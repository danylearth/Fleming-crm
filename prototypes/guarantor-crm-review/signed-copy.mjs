import {PDFDocument} from './pdf-lib.esm.min.js';
export async function makeSignedPdf(html,{preview=false}={}){
 const doc=new DOMParser().parseFromString(html,'text/html');const pdf=await PDFDocument.create();
 const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
 const header=await load('/guarantor/letterhead-header.png'),footer=await load('/guarantor/letterhead-footer.png');
 const pages=[];let canvas,ctx,y;const width=794,height=1123,left=48,right=width-48,bottom=1020;
 const newPage=()=>{canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);const hh=width*header.height/header.width;ctx.drawImage(header,0,0,width,hh);const fh=width*footer.height/footer.width;ctx.drawImage(footer,0,height-fh,width,fh);y=hh+12;pages.push(canvas);};newPage();
 const room=h=>{if(y+h>bottom)newPage();};
 const pageCapacity=bottom-(width*header.height/header.width+12);
 const plain=el=>el.innerHTML.replace(/<br\s*\/?>/gi,' · ').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 const textHeight=(text,size=13,bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px Arial`;let count=1,line='';for(const word of text.replace(/\s+/g,' ').trim().split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>right-left&&line){count++;line=word;}else line=next;}return count*size*1.5+5;};
 const lineText=(text,{size=13,bold=false,space=5,center=false}={})=>{ctx.font=`${bold?'bold ':''}${size}px Arial`;const words=text.replace(/\s+/g,' ').trim().split(' ');let line='',lines=[];for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>right-left&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);for(const [index,line] of lines.entries()){room(size*1.5*Math.min(2,lines.length-index));ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle='#000';ctx.fillText(line,center?(width-ctx.measureText(line).width)/2:left,y+size);y+=size*1.5;}y+=space;};
 const elements=[...doc.querySelectorAll('.deed-content h1,.deed-content h2,.deed-content p,.deed-content dt,.deed-content dd,.deed-content tr,.deed-content .deed-signature-slot,.deed-content img.signature-image')];
 for(const [index,el] of elements.entries()){
  if(el.tagName==='H1'){if(el.hasAttribute('data-new-page'))newPage();room(55);lineText(el.textContent,{size:22,bold:true,center:true,space:18});}
  else if(el.tagName==='H2'){
   if(el.textContent.trim()==='1. The Specified Tenancy')newPage();
   const size=el.classList.contains('particulars-heading')?13:15;let sectionHeight=textHeight(el.textContent,size,true)+6;
   for(const next of elements.slice(index+1)){if(['H1','H2','TR'].includes(next.tagName))break;if(next.tagName==='P')sectionHeight+=textHeight(plain(next),13,next.classList.contains('apt-next-note'));else if(next.classList.contains('deed-signature-slot')||(next.tagName==='IMG'&&!next.closest('.deed-signature-slot')))sectionHeight+=87;}
   // Keep each numbered section together when it fits on a page.
   room(sectionHeight<=pageCapacity?sectionHeight:110);y+=6;lineText(el.textContent,{size,bold:true,space:5});
  }
  else if(el.tagName==='TR'){
   const split=left+195,pad=7,size=11,lineHeight=16;
   const wrap=(text,max,bold)=>{ctx.font=`${bold?'bold ':''}${size}px Arial`;const lines=[];let line='';for(const word of text.trim().split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>max&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
   const label=wrap(el.children[0].textContent,split-left-pad*2,true),value=wrap(el.children[1].textContent,right-split-pad*2,false),h=Math.max(label.length,value.length)*lineHeight+pad*2;
   room(h);ctx.fillStyle='#f5f2f7';ctx.fillRect(left,y,split-left,h);ctx.strokeStyle='#d8d3df';ctx.lineWidth=.7;ctx.strokeRect(left,y,right-left,h);ctx.beginPath();ctx.moveTo(split,y);ctx.lineTo(split,y+h);ctx.stroke();
   for(const [lines,x,bold]of [[label,left+pad,true],[value,split+pad,false]]){ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle='#000';lines.forEach((line,i)=>ctx.fillText(line,x,y+pad+size+i*lineHeight));}y+=h;
  }
  else if(el.tagName==='DT'){room(40);lineText(el.textContent+': '+(el.nextElementSibling?.textContent||''),{size:13,space:1});}
  else if(el.tagName==='DD')continue;
  else if(el.classList.contains('deed-signature-slot')){room(87);const img=el.querySelector('img');if(img){const image=await load(img.src),w=Math.min(220,image.width),h=Math.min(75,w*image.height/image.width);ctx.drawImage(image,left,y,w,h);}y+=87;}
  else if(el.tagName==='IMG'){if(el.closest('.deed-signature-slot'))continue;const image=await load(el.src);const w=Math.min(220,image.width),h=Math.min(75,w*image.height/image.width);room(h+12);ctx.drawImage(image,left,y,w,h);y+=h+12;}
  else {const text=plain(el),bold=el.classList.contains('apt-next-note'),h=textHeight(text,13,bold);if(h<=pageCapacity)room(h);lineText(text,{bold});}
 }
 if(preview)return pages.map(page=>page.toDataURL('image/png'));
 for(const canvas of pages){const image=await pdf.embedPng(canvas.toDataURL('image/png'));const page=pdf.addPage([595.28,841.89]);page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});}
 const appendix=doc.querySelector('[data-appendix]');if(appendix){const response=await fetch('/guarantor/appendices/'+encodeURIComponent(appendix.dataset.appendix));if(!response.ok)throw Error('The unsigned tenancy agreement could not be loaded.');const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==appendix.dataset.sha256)throw Error('The unsigned tenancy agreement has changed. Obtain the correct version before continuing.');const attached=await PDFDocument.load(bytes);for(const page of await pdf.copyPages(attached,attached.getPageIndices()))pdf.addPage(page);}
 pdf.setTitle(doc.querySelector('img[alt="Guarantor signature"]')?'Deed of Guarantee — signed test copy with Unsigned APT Agreement':'Deed of Guarantee — draft review with Unsigned APT Agreement');return pdf.save();
}
