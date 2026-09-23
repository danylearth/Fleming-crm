/** Email clients may override colours; explicit backgrounds and light-mode metadata preserve branding where supported. */
export function prepareEmailHtml(html:string):string {
 if(html.includes('name="fleming-presentation"'))return html;
 html=html.replace(/src="assets\//g,'src="https://crm.fleminglettings.co.uk/email-assets/');
 html=html.replace(/style="([^"]*)"/g,(_all,style:string)=>{
  const background=style.match(/(?:^|;)\s*background(?:-color)?:\s*(#[a-f0-9]{3,8})(?=;|$)/i)?.[1];
  return `style="${style}${background&&!style.includes('background-image:')?`;background-image:linear-gradient(${background},${background})`:''}"`;
 });
 const meta='<meta name="fleming-presentation" content="1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only}body{color-scheme:light only;background:#eeeeee;color:#1e1e1e}img{border:0;outline:none}table[width="600"]{width:100%!important;max-width:600px!important}</style>';
 return html.includes('</head>')?html.replace('</head>',meta+'</head>'):html.replace(/<html[^>]*>/i,'$&<head>'+meta+'</head>');
}
