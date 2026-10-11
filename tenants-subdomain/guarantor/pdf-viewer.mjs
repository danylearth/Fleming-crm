import * as pdfjs from '../vendor/pdfjs/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
async function bytes(url){const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('The document is unavailable. Refresh the application and try again.');return response.arrayBuffer();}
export async function showPdf(element){
 element.textContent='Loading document…';
 let loadingTask;
 try{
  loadingTask=pdfjs.getDocument({data:await bytes(window.guarantorDeedUrl()),isEvalSupported:false});
  const pdf=await loadingTask.promise;
  if(!element.isConnected)return;
  element.replaceChildren();
  for(let number=1;number<=pdf.numPages;number++){
   if(!element.isConnected)break;
   const page=await pdf.getPage(number),viewport=page.getViewport({scale:1.4}),sheet=document.createElement('canvas');
   sheet.width=viewport.width;sheet.height=viewport.height;sheet.style.cssText='display:block;width:100%;height:auto;margin:0 auto 16px;background:white;box-shadow:0 1px 5px #0003';
   sheet.setAttribute('role','img');sheet.setAttribute('aria-label','Deed document sheet '+number);
   element.append(sheet);await page.render({canvasContext:sheet.getContext('2d'),viewport}).promise;
  }
 }catch(error){if(element.isConnected)element.textContent=error.message;}
 finally{await loadingTask?.destroy();}
}
export async function openPdf(url){
 const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
 try{const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('The document is unavailable. Please refresh and try again.');const objectUrl=URL.createObjectURL(await response.blob());if(popup)popup.location.replace(objectUrl);else{const a=document.createElement('a');a.href=objectUrl;a.download='Document.pdf';a.click();}setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);}catch(error){popup?.close();throw error;}
}
