import {addEmailFooter} from './email-footer';
/** Email clients may override colours; explicit backgrounds and light-mode metadata preserve branding where supported. */
export function prepareEmailHtml(html:string):string {
 html=addEmailFooter(html);
 // Outlook's Word renderer ignores anchor padding. Put button spacing on its table cell.
 html=html.replace(/<td\b([^>]*)>(\s*)<a\b([^>]*)>([\s\S]*?)<\/a>(\s*)<\/td>/gi,(original,cell,space,link,label,end)=>{
  if(!/bgcolor=|background(?:-color)?\s*:/i.test(cell)||!/(?:font-weight\s*:\s*bold|color\s*:\s*#fff)/i.test(link))return original;
  const padding=link.match(/(?:^|[;"])\s*padding\s*:\s*([^;"]+)/i)?.[1];
  if(!padding)return original;
  const cellStyle=cell.match(/style="([^"]*)"/i)?.[1]||'';
  if(/(?:^|;)\s*padding\s*:/i.test(cellStyle))return original;
  const style=cellStyle+';padding:'+padding+';mso-padding-alt:'+padding+';text-align:center;';
  cell=/style="/i.test(cell)?cell.replace(/style="[^"]*"/i,'style="'+style+'"'):cell+' style="'+style+'"';
  link=link.replace(/(?:^|;)\s*padding\s*:[^;"]*;?/i,';');
  return '<td'+cell+'>'+space+'<a'+link+'>'+label+'</a>'+end+'</td>';
 });
 // Replace our previous presentation block, including in saved composer drafts.
 // It forced every nested table to full width and changed the approved email proportions.
 html=html.replace(/<meta name="fleming-presentation" content="\d+"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>[\s\S]*?<\/style>/gi,'');
 // Fragments (manual messages and signatures) need a real document too.
 if(!/<html\b/i.test(html))html='<!doctype html><html><head></head><body style="margin:0;background:#eeeeee;color:#1e1e1e">'+html+'</body></html>';
 if(!/<head\b/i.test(html))html=html.replace(/<html[^>]*>/i,'$&<head></head>');
 if(!/<meta\b[^>]*charset=/i.test(html))html=html.replace(/<head[^>]*>/i,'$&<meta charset="utf-8">');
 if(!/<meta\b[^>]*name="viewport"/i.test(html))html=html.replace(/<head[^>]*>/i,'$&<meta name="viewport" content="width=device-width,initial-scale=1">');
 html=html.replace(/(<meta\b[^>]*name="(?:supported-)?color-schemes?"[^>]*content=")[^"]*(")/gi,'$1light only$2');
 // The old Outlook override erased the explicit colours of every table cell.
 html=html.replace(/\[data-ogsc\] body,\s*\[data-ogsc\] table,\s*\[data-ogsc\] td\s*\{\s*background-color:\s*inherit !important;\s*color:\s*inherit !important;\s*\}/gi,'');
 html=html.replace(/src="assets\//g,'src="https://crm.fleminglettings.co.uk/email-assets/');
 html=html.replace(/style="([^"]*)"/g,(_all,style:string)=>{
  const background=style.match(/(?:^|;)\s*background(?:-color)?:\s*(#[a-f0-9]{3,8})(?=;|$)/i)?.[1];
  const colour=style.match(/(?:^|;)\s*color:\s*(#[a-f0-9]{3,8})(?=;|$)/i)?.[1];
  return `style="${style}${background&&!style.includes('background-image:')?`;background-image:linear-gradient(${background},${background})`:''}${colour&&!style.includes('-webkit-text-fill-color:')?`; -webkit-text-fill-color:${colour}`:''}"`;
 });
 // Only the outer branded canvas scales on phones; nested summary/button tables
 // retain their natural widths and the desktop design remains unchanged.
 html=html.replace(/<table\b([^>]*\bwidth="600"[^>]*)>/gi,(tag,attrs:string)=>{
  if(/\bclass=/.test(attrs))return tag.includes('fleming-email-canvas')?tag:tag.replace(/class="([^"]*)"/,'class="$1 fleming-email-canvas"');
  return '<table class="fleming-email-canvas"'+attrs+'>';
 });
 html=html.replace(/<tr>\s*(<td\b[^>]*\bwidth="(?:180|130)"[^>]*>)/gi,'<tr class="fleming-email-brand-row">$1');
 html=html.replace(/<span style="white-space:nowrap;?">([^<]*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})<\/span>/gi,'<span class="fleming-email-address" style="white-space:nowrap">$1</span>');
 if(!/rel=[\"'](?:shortcut )?icon[\"']/i.test(html))html=html.replace(/<\/head>/i,'<link rel="icon" href="https://crm.fleminglettings.co.uk/logo-icon.png"></head>');
 const meta='<meta name="fleming-presentation" content="2"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only}body{color-scheme:light only;background:#eeeeee;color:#1e1e1e;-webkit-text-size-adjust:100%;text-size-adjust:100%}img{border:0;outline:none}@media only screen and (max-width:620px){.fleming-email-canvas{width:100%!important;max-width:600px!important}.fleming-email-canvas .sp{padding-left:20px!important;padding-right:20px!important}.fleming-email-canvas td{overflow-wrap:anywhere}.fleming-email-brand-row>td{display:block!important;width:100%!important;text-align:left!important}.fleming-email-brand-row>td+td{padding-top:12px!important}.fleming-email-canvas img{max-width:100%}.fleming-email-address{font-size:18px!important}}@media only screen and (max-width:360px){.fleming-email-address{font-size:16px!important}.fleming-email-canvas .sp{padding-left:16px!important;padding-right:16px!important}}</style>';
 return html.replace(/<\/head>/i,meta+'</head>');
}
