import {prepareEmailHtml} from './email-presentation';
import fs from 'fs';
import path from 'path';
const assetBase='https://crm.fleminglettings.co.uk/email-assets/';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function templateAssets(html:string):string {
 return html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi,(all,prefix,src,end)=>{
  if(/^https?:\/\//i.test(src))return all;
  const filename=src.split('/').pop();
  return filename&&/^[\w-]+\.(png|jpg|jpeg)$/i.test(filename)&&fs.existsSync(path.join(__dirname,'email-assets',filename))?prefix+assetBase+filename+end:all;
 });
}
export function emailTemplateLibrary(){
 return fs.readdirSync(path.join(__dirname,'email-templates')).filter(f=>f.endsWith('.html')).sort().map(filename=>{
  const html=prepareEmailHtml(templateAssets(fs.readFileSync(path.join(__dirname,'email-templates',filename),'utf8')));
  const label=filename.replace(/^\d+-/,'').replace(/\.html$/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const subject=html.match(/<title>([^<]+)<\/title>/i)?.[1]||label;
  return {id:filename,label,subject,html,fields:[...new Set(html.match(/\{\{[A-Z_]+\}\}/g)||[])].map(k=>k.slice(2,-2))};
 });
}
export function fillEmailTemplate(html:string,values:Record<string,string>):string {
 return html.replace(/\{\{([A-Z_]+)\}\}/g,(full,key)=>key in values?escape(values[key]):full);
}
