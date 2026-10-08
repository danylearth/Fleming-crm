const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=function renderAptPages(folder,file){
 const prefix=file.replace(/\.pdf$/,'')+'-page';
 execFileSync('C:/Users/samfl/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe',['-r','120','-png',path.join(folder,file),path.join(folder,prefix)],{windowsHide:true});
 return fs.readdirSync(folder).filter(name=>name.startsWith(prefix+'-')&&name.endsWith('.png')).sort();
};
