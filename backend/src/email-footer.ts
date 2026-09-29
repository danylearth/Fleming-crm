import fs from 'fs';
import path from 'path';

export const emailPreferencesPreviewUrl='https://crm.fleminglettings.co.uk/api/public/email-preferences/preview';
const escapeAttribute=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
export const emailSocialLinks=[
 {name:'Facebook',file:'facebook',url:'https://www.facebook.com/fleminglettings/'},
 {name:'X',file:'x',url:'https://x.com/FlemingLettings'},
 {name:'Instagram',file:'instagram',url:'https://www.instagram.com/fleminglettings/'},
 {name:'LinkedIn',file:'linkedin',url:'https://www.linkedin.com/company/fleming-lettings'},
 {name:'YouTube',file:'youtube',url:'https://www.youtube.com/@FlemingLettings'},
];
export function emailSocialIcons():string {
 return '<table id="fleming-social-links" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>'+emailSocialLinks.filter(link=>/^https:\/\//.test(link.url)).map(link=>`<td style="padding:0 8px 0 0;"><a href="${escapeAttribute(link.url)}" style="text-decoration:none;"><img src="https://crm.fleminglettings.co.uk/email-assets/social-${link.file}.png" width="28" height="28" alt="${link.name}" style="display:block; border:0; outline:none; width:28px; height:28px;" /></a></td>`).join('')+'</tr></table>';
}
function optOutRow(url:string):string {
 return `<tr id="fleming-email-opt-out"><td bgcolor="#1E1E1E" style="background:#1E1E1E; padding:0 40px 26px 40px; font-family:Helvetica,Arial,sans-serif; font-size:11px; line-height:18px; mso-line-height-rule:exactly; color:#9A93A0;" class="sp"><div style="border-top:1px solid #3A3A3A; padding-top:16px;">If you would no longer like to hear from us, please <a href="${escapeAttribute(url)}" style="color:#ffffff; text-decoration:underline;">click here</a> to unsubscribe from our marketing emails.</div></td></tr>`;
}
/** Used for every preview and again at delivery, including saved HTML drafts. */
export function addEmailFooter(html:string,unsubscribeUrl?:string):string {
 // Keep one footer when an earlier marketing draft already has its own extra table.
 const oldText='Unsubscribe from Fleming Lettings marketing emails',oldAt=html.indexOf(oldText);
 if(oldAt>=0){const start=html.lastIndexOf('<table',oldAt),end=html.indexOf('</table>',oldAt)+8;
  if(start>=0&&end>start&&html.slice(start,end).replace(/<[^>]*>/g,'').trim()===oldText)html=html.slice(0,start)+html.slice(end);
 }
 if(!html.includes('This email and any attachments are confidential')){
  const signature=fs.readFileSync(path.join(__dirname,'email-signatures','office.html'),'utf8');
  html=/<\/body>/i.test(html)?html.replace(/<\/body>/i,signature+'</body>'):html+signature;
 }
 if(/<table\b[^>]*id="fleming-social-links"/i.test(html)){
  html=html.replace(/<table\b[^>]*id="fleming-social-links"[^>]*>[\s\S]*?<\/table>/gi,emailSocialIcons());
 }else{
  let inserted=false;
  html=html.replace(/(<a\b[^>]*href="https:\/\/(?:www\.)?fleminglettings\.co\.uk\/?"[^>]*>fleminglettings\.co\.uk<\/a>)(\s*<\/td>)/i,(_match,anchor,end)=>{inserted=true;return anchor+'\n'+emailSocialIcons()+end;});
  // Programmatically generated service emails use a simple signature cell.
  if(!inserted)html=html.replace(/(01902 212 415)(\s*<\/td>)/i,'$1'+emailSocialIcons()+'$2');
 }
 const existing=/<tr\b[^>]*id="fleming-email-opt-out"[^>]*>[\s\S]*?<\/tr>/i;
 if(existing.test(html))return unsubscribeUrl?html.replace(existing,optOutRow(unsubscribeUrl)):html;
 const disclaimer=html.indexOf('This email and any attachments are confidential');
 const end=/<\/td>\s*<\/tr>/i.exec(html.slice(disclaimer));
 if(end){const at=disclaimer+end.index+end[0].length;html=html.slice(0,at)+optOutRow(unsubscribeUrl||emailPreferencesPreviewUrl)+html.slice(at);}
 return html;
}
