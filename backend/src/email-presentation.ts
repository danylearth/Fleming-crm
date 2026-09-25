/** Email clients may override colours; explicit backgrounds and light-mode metadata preserve branding where supported. */
export function prepareEmailHtml(html:string):string {
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
 const meta='<meta name="fleming-presentation" content="1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only}body{color-scheme:light only;background:#eeeeee;color:#1e1e1e}img{border:0;outline:none}table[width="600"]{width:100%!important;max-width:600px!important}@media only screen and (max-width:620px){table{width:100%!important;table-layout:fixed!important}td,th{overflow-wrap:anywhere}td,a,p,strong,span{white-space:normal!important}img{max-width:100%!important;height:auto!important}}</style>';
 if(html.includes('name="fleming-presentation"'))return html;
 return html.replace(/<\/head>/i,meta+'</head>');
}
