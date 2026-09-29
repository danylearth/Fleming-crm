import {addEmailFooter} from './email-footer';
/** Email clients may override colours; explicit backgrounds and light-mode metadata preserve branding where supported. */
export function prepareEmailHtml(html:string):string {
 html=addEmailFooter(html);
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
 // Keep the templates' original 600px canvas, natural button widths and typography.
 if(!/rel=[\"'](?:shortcut )?icon[\"']/i.test(html))html=html.replace(/<\/head>/i,'<link rel="icon" href="https://crm.fleminglettings.co.uk/logo-icon.png"></head>');
 const meta='<meta name="fleming-presentation" content="2"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only}body{color-scheme:light only;background:#eeeeee;color:#1e1e1e;-webkit-text-size-adjust:100%;text-size-adjust:100%}img{border:0;outline:none}</style>';
 return html.replace(/<\/head>/i,meta+'</head>');
}
