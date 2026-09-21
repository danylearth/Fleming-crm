import sanitizeHtml from 'sanitize-html';
export function cleanMarketingHtml(html:string):string {
 return sanitizeHtml(html,{
  allowedTags:[...sanitizeHtml.defaults.allowedTags,'html','head','body','style','img','font','center'],
  allowedAttributes:{'*':['style','class','id','align','valign','width','height','bgcolor','role'],a:['href','title','target','rel'],img:['src','alt','width','height','style'],td:['colspan','rowspan','style','align','valign','width','height','bgcolor'],table:['width','cellpadding','cellspacing','border','style','align','bgcolor'],font:['face','size','color']},
  allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,allowVulnerableTags:true,
 });
}
export function marketingEmailHtml(message:string,unsubscribeUrl:string):string {
 const footer=`<p style="font-family:Arial;font-size:12px"><a href="${unsubscribeUrl}">Unsubscribe from Fleming Lettings marketing emails</a></p>`;
 const html=cleanMarketingHtml(message);
 return /<\/body>/i.test(html)?html.replace(/<\/body>/i,footer+'</body>'):html+footer;
}
