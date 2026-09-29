const fs=require('fs'),crypto=require('crypto'),path=require('path');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const expected=hash(fs.readFileSync(path.join(process.argv[2],'application.html')));
 for(const route of ['/onboarding/deployment-route-check','/deployment-route-check']){
  const response=await fetch('https://apply.fleminglettings.co.uk'+route,{cache:'no-store'});
  if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==expected)throw Error('Published application route mismatch: '+route);
 }
 console.log('Public onboarding and short-link routes match the published application.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
