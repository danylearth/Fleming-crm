import {makeSignedPdf} from './signed-copy.mjs';
import {aptAppendices} from './apt-manifest.mjs';
const jobs=new WeakMap();
export const deedSource=container=>container.querySelector('.deed-source')?.innerHTML||container.innerHTML;
export async function showPagedDeed(container){
 const document=container.ownerDocument;
 const html=deedSource(container),job={};jobs.set(container,job);
 const source=document.createElement('div');source.className='deed-source';source.innerHTML=html;
 const pages=document.createElement('div');pages.className='paged-deed';pages.setAttribute('aria-label','Paginated deed');
 const status=document.createElement('p');status.textContent='Preparing document pages…';status.setAttribute('role','status');pages.append(status);
 const top=container.scrollTop;container.replaceChildren(source,pages);
 try{
  const images=await makeSignedPdf(html,{preview:true});if(jobs.get(container)!==job)return;
  pages.replaceChildren();
  const tools=document.createElement('div');tools.className='page-tools';const download=document.createElement('a');download.href='#';download.textContent='Download Deed + Unsigned APT Agreement';
  download.onclick=async e=>{e.preventDefault();download.textContent='Preparing download…';try{const bytes=await makeSignedPdf(html),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='Deed of Guarantee and Unsigned APT Agreement.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){status.textContent=error.message;pages.prepend(status);}finally{download.textContent='Download Deed + Unsigned APT Agreement';}};tools.append(download);pages.append(tools);
  images.forEach((src,i)=>{const figure=document.createElement('figure'),image=document.createElement('img');image.src=src;image.width=794;image.height=1123;image.alt='Deed of Guarantee — page '+(i+1)+' of '+images.length;figure.append(image);pages.append(figure);});
  const agreement=source.querySelector('[data-appendix]');if(agreement){const link=document.createElement('a');link.href='/guarantor/appendices/'+encodeURIComponent(agreement.dataset.appendix);link.textContent='Open Unsigned APT Agreement in a New Tab ↗';link.target='_blank';link.rel='noopener';tools.append(link);const matching=Object.values(aptAppendices).find(item=>item.file===agreement.dataset.appendix&&item.sha256===agreement.dataset.sha256);for(const [i,file]of (matching?.previewPages||[]).entries()){const figure=document.createElement('figure'),image=document.createElement('img');figure.className='apt-preview-page';image.src='/guarantor/appendices/'+encodeURIComponent(file);image.alt='Unsigned APT Agreement — page '+(i+1);image.width=794;image.height=1123;image.loading='lazy';figure.append(image);pages.append(figure);}}
  container.scrollTop=top;container.dataset.pagesReady=String(images.length);
 }catch(error){status.textContent='Unable to prepare document pages: '+error.message;}
}
export function openPagedDeed(html){
 const tab=window.open('','_blank');if(!tab)throw Error('Allow a new tab to open the deed.');tab.opener=null;
 tab.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Deed of Guarantee</title><link rel="icon" href="'+location.origin+'/logo-icon.png"><link rel="stylesheet" href="'+location.origin+'/guarantor/public-form.css"><style>body{margin:0;background:#eee}#pages{max-width:794px;margin:auto}</style></head><body><main id="pages"></main></body></html>');tab.document.close();
 const container=tab.document.querySelector('#pages');container.innerHTML=html;showPagedDeed(container);
}
