import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import SignDocument from '../frontend/src/pages/SignDocument.tsx';
import {appendSigningCertificate} from '../backend/src/signing-certificate.ts';
const nativeFetch=window.fetch.bind(window);
const prefix='/api/public/sign-documents/inventory-test';
const fields=[{type:'signature',recipient_id:1,page:0,x:222/595.303937,y:(841.889764-335)/841.889764,width:152/595.303937,height:56/841.889764},{type:'date',recipient_id:1,page:0,x:384/595.303937,y:(841.889764-315)/841.889764,width:147/595.303937,height:20/841.889764}];
if(new URLSearchParams(location.search).get('initials')==='1')fields.push({type:'initials',recipient_id:1,page:0,x:58/595.303937,y:(841.889764-245)/841.889764,width:110/595.303937,height:38/841.889764});
const state={title:'Inventory - 21a Northwood Park Road',name:'Mr. William Alan Rushforth',status:'sent',pages:Array.from({length:17},()=>({width:595.303937,height:841.889764})),fields};
let signedPdf, signedPage;
const certificatePages=[];
window.fetch=async(input,options={})=>{
 const raw=typeof input==='string'?input:input.url;
 const url=new URL(raw,location.origin);
 if(!url.pathname.startsWith(prefix))return nativeFetch(input,options);
 const suffix=url.pathname.slice(prefix.length);
 if(!suffix)return Response.json(state);
 if(suffix.startsWith('/page/')){const n=Number(suffix.slice(6));return nativeFetch(n>=17&&certificatePages[n-17]?certificatePages[n-17]:n===0&&signedPage?signedPage:`/assets/inventory-page-${n+1}.png`);}
 if(suffix==='/pdf')return nativeFetch(signedPdf||'/assets/inventory-signing-test.pdf');
 if(suffix==='/sign'&&options.method==='POST'){
  const payload=JSON.parse(options.body);if(!payload.consent||!payload.signature)return Response.json({error:'Add your signature and confirm consent'},{status:400});
  if(fields.some(f=>f.type==='initials')&&!payload.initials)return Response.json({error:'Add your initials before signing'},{status:400});
  const source=await (await nativeFetch('/assets/inventory-signing-test.pdf')).arrayBuffer();
  const pdf=await PDFLib.PDFDocument.load(source);
  const page=pdf.getPages()[0],img=await pdf.embedPng(payload.signature);
  const scale=Math.min(152/img.width,56/img.height);
  page.drawImage(img,{x:222+(152-img.width*scale)/2,y:279+(56-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
  const date=new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'});
  const text=document.createElement('canvas');text.width=600;text.height=90;const ctx=text.getContext('2d');ctx.font='40px Arial';ctx.fillStyle='#000';ctx.fillText(date,20,60);
  page.drawImage(await pdf.embedPng(text.toDataURL()),{x:384,y:298,width:147,height:22});
  if(payload.initials){const initial=await pdf.embedPng(payload.initials),fit=initial.scaleToFit(110,38);page.drawImage(initial,{x:58,y:245-fit.height,width:fit.width,height:fit.height});}
  const signedAt=new Date().toISOString();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const sheets=await appendSigningCertificate(pdf,[{name:state.name,email:'Not recorded (local test)',signed_at:signedAt,signing_ip:'127.0.0.1 (simulated local test)'}],hash);
  for(const [index,lines] of sheets.entries()){
   const sheet=document.createElement('canvas');sheet.width=1190;sheet.height=1684;const pen=sheet.getContext('2d');pen.scale(2,2);pen.fillStyle='white';pen.fillRect(0,0,595,842);pen.fillStyle='#26083b';pen.fillRect(0,0,595,90);pen.fillStyle='white';pen.font='bold 12px Arial';pen.fillText('Fleming Lettings',52,36);pen.font='bold 20px Arial';pen.fillText('Electronic Signature Certificate',52,69);pen.fillStyle='#26083b';pen.font='10px Arial';lines.forEach((line,i)=>pen.fillText(line,52,128+i*18));pen.fillStyle='#666';pen.font='9px Arial';pen.fillText(`Completion certificate | ${index+1} of ${sheets.length}`,52,790);certificatePages.push(sheet.toDataURL());
  }
  signedPdf=URL.createObjectURL(new Blob([await pdf.save()],{type:'application/pdf'}));
  window.testSignedPdfUrl=signedPdf;
  const background=new Image();background.src='/assets/inventory-page-1.png';await background.decode();
  const sign=new Image();sign.src=payload.signature;await sign.decode();
  const canvas=document.createElement('canvas');canvas.width=background.width;canvas.height=background.height;const draw=canvas.getContext('2d');draw.drawImage(background,0,0);
  const f=fields[0],factor=Math.min(f.width*canvas.width/sign.width,f.height*canvas.height/sign.height);
  draw.drawImage(sign,f.x*canvas.width+(f.width*canvas.width-sign.width*factor)/2,f.y*canvas.height+(f.height*canvas.height-sign.height*factor)/2,sign.width*factor,sign.height*factor);
  if(payload.initials){const initial=new Image();initial.src=payload.initials;await initial.decode();const target=fields.find(f=>f.type==='initials'),ratio=Math.min(target.width*canvas.width/initial.width,target.height*canvas.height/initial.height);draw.drawImage(initial,target.x*canvas.width,target.y*canvas.height,initial.width*ratio,initial.height*ratio);}
  draw.font=`${10*canvas.width/595.303937}px Arial`;draw.fillStyle='#000';draw.fillText(date,fields[1].x*canvas.width,(fields[1].y+.018)*canvas.height);signedPage=canvas.toDataURL();
  state.status='completed';state.copy_email_sent=true;state.signed_at=signedAt;state.pages.push(...sheets.map(()=>({width:595,height:842})));return Response.json({success:true,completed:true});
 }
 return Response.json({error:'Test route unavailable'},{status:404});
};
createRoot(document.getElementById('actual-signing')).render(<MemoryRouter initialEntries={['/sign-document/inventory-test']}><Routes><Route path='/sign-document/:token' element={<SignDocument/>}/></Routes></MemoryRouter>);

new MutationObserver(()=>{for(const a of document.querySelectorAll('a[href]')){if(a.getAttribute('href')===prefix+'/pdf')a.href=window.testSignedPdfUrl||'/assets/inventory-signing-test.pdf';}}).observe(document.getElementById('actual-signing'),{childList:true,subtree:true});

