import sanitizeHtml from 'sanitize-html';
import {prepareEmailHtml} from './email-presentation';
import {addEmailFooter,emailPreferencesPreviewUrl,emailSocialLinks} from './email-footer';
import {fillEmailTemplate} from './message-template-library';
export function normaliseMarketingTemplate(html:string):string {
 html=html.replace(/(\bHi(?: there)?\s+)LANDLORD NAME\b/g,'$1{{FIRST_NAME}}');
 for(const [placeholder,name] of [['X_LINK','X'],['LINKEDIN_LINK','LinkedIn'],['YOUTUBE_LINK','YouTube']]){
  const url=emailSocialLinks.find(link=>link.name===name)!.url;
  html=html.replace(new RegExp(`(href=["'])${placeholder}(["'])`,'g'),`$1${url}$2`);
 }
 // Reuse the uploaded opt-out row, allowing the standard footer to insert the
 // recipient-specific link instead of adding a second unsubscribe section.
 const marker=html.search(/href=["']UNSUBSCRIBE_LINK["']/i);
 if(marker>=0){
  const start=html.lastIndexOf('<tr',marker),end=html.indexOf('</tr>',marker);
  if(start>=0&&end>=0&&!html.slice(start,marker).includes('<tr',3)){
   const row=html.slice(start,end+5).replace(/^<tr\b[^>]*>/i,'<tr id="fleming-email-opt-out">');
   html=html.slice(0,start)+row+html.slice(end+5);
  }
  html=html.replace(/(href=["'])UNSUBSCRIBE_LINK(["'])/gi,`$1${emailPreferencesPreviewUrl}$2`);
 }
 return html;
}
export function cleanMarketingHtml(html:string):string {
 return sanitizeHtml(html,{
  allowedTags:[...sanitizeHtml.defaults.allowedTags,'html','head','title','meta','body','style','img','font','center'],
  allowedAttributes:{'*':['style','class','id','align','valign','width','height','bgcolor','role'],meta:['name','content','charset'],a:['href','title','target','rel'],img:['src','alt','width','height','style'],td:['colspan','rowspan','style','align','valign','width','height','bgcolor'],table:['width','cellpadding','cellspacing','border','style','align','bgcolor'],font:['face','size','color']},
  allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,allowVulnerableTags:true,
 });
}
export function marketingRecipientHtml(message:string,name:string,unsubscribeUrl:string):string {
 const firstName=name.trim().replace(/^(?:(?:mr|mrs|ms|miss|dr|prof)\.?\s+)+/i,'').split(/\s+/)[0]||'there';
 return marketingEmailHtml(fillEmailTemplate(normaliseMarketingTemplate(message),{FIRST_NAME:firstName}),unsubscribeUrl);
}
export function marketingEmailHtml(message:string,unsubscribeUrl:string):string {
 const html=cleanMarketingHtml(message);
 return prepareEmailHtml(addEmailFooter(html,unsubscribeUrl));
}
