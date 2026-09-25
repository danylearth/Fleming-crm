import sanitizeHtml from 'sanitize-html';
import {prepareEmailHtml} from './email-presentation';
export function cleanMarketingHtml(html:string):string {
 return sanitizeHtml(html,{
  allowedTags:[...sanitizeHtml.defaults.allowedTags,'html','head','title','meta','body','style','img','font','center'],
  allowedAttributes:{'*':['style','class','id','align','valign','width','height','bgcolor','role'],meta:['name','content','charset'],a:['href','title','target','rel'],img:['src','alt','width','height','style'],td:['colspan','rowspan','style','align','valign','width','height','bgcolor'],table:['width','cellpadding','cellspacing','border','style','align','bgcolor'],font:['face','size','color']},
  allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,allowVulnerableTags:true,
 });
}
export function marketingEmailHtml(message:string,unsubscribeUrl:string):string {
 const footer=`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeeee"><tr><td align="center" style="padding:18px 16px;font-family:Arial;font-size:12px;line-height:18px;color:#555555"><a href="${unsubscribeUrl}" style="color:#555555;text-decoration:underline">Unsubscribe from Fleming Lettings marketing emails</a></td></tr></table>`;
 const html=cleanMarketingHtml(message);
 return prepareEmailHtml(/<\/body>/i.test(html)?html.replace(/<\/body>/i,footer+'</body>'):html+footer);
}
