const fs=require('fs');
module.exports=()=>{
 let html=fs.readFileSync('tenants-subdomain/agreement.html','utf8');
 html=html.replace("import * as pdfjsLib", "import '/preview-api.js';\n    await window.crmPreviewReady;\n    import * as pdfjsLib");
 html=html.replace(/const API=.*?,token=.*?;/,"const API='',token=new URLSearchParams(location.search).get('agreement')||'current';");
 html=html.replace('if(pdfTask)await pdfTask.destroy();',"if(typeof source==='string'){const response=await fetch(source);if(!response.ok)throw Error('Document unavailable');source=new Uint8Array(await response.arrayBuffer());if(previewExpected===undefined)downloadPreview(source);}if(pdfTask)await pdfTask.destroy();");
 html=html.replace('<body>','<body><div style="text-align:center;background:#fff5d6;padding:7px;font:12px Arial">TEST ONLY · Fictional records · No real messages or legal signatures</div>');
return html;
};
