export type EmailTemplate={id:string;label:string;subject:string;html:string;fields:string[]};
export const escapeEmailValue=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const emailTemplateFields=(html:string)=>[...new Set([...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m=>m[1]))];
export const fillTemplate=(html:string,values:Record<string,string>)=>html.replace(/\{\{([A-Z_]+)\}\}/g,(full,key)=>values[key]?.trim()?escapeEmailValue(values[key]):full);
export const fieldLabel=(key:string)=>key.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function resolveKnownEmailImages(html:string,library:EmailTemplate[]){
 const known=new Set(library.flatMap(t=>[...t.html.matchAll(/https:\/\/crm\.fleminglettings\.co\.uk\/email-assets\/([\w.-]+)/g)].map(m=>m[1])));
 return html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi,(all,prefix,src,end)=>!/^https?:\/\//i.test(src)&&known.has(src.split('/').pop())?prefix+'https://crm.fleminglettings.co.uk/email-assets/'+src.split('/').pop()+end:all);
}
