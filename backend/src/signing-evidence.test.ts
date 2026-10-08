import {it,expect,afterEach,vi} from 'vitest';
import express from 'express';
import {flyClientIp} from './client-ip';
import {agreementConsentSnapshot,APT_DECLARATIONS,SERVICE_DECLARATIONS} from './agreement-consent';
import fs from 'node:fs';
import path from 'node:path';
afterEach(()=>vi.unstubAllEnvs());
it('records distinct visitor IPs from Fly and ignores spoofed forwarded addresses',async()=>{
 vi.stubEnv('FLY_APP_NAME','test');const app=express();app.set('trust proxy',1);app.use(flyClientIp);app.get('/',(req,res)=>res.json({ip:req.ip}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const url='http://127.0.0.1:'+(server.address() as any).port;for(const ip of ['192.0.2.40','198.51.100.70','2001:db8::12']){const result=await fetch(url,{headers:{'Fly-Client-IP':ip,'X-Forwarded-For':'203.0.113.99, 66.241.124.188'}});expect((await result.json()).ip).toBe(ip);}
 vi.stubEnv('FLY_APP_NAME','');expect((await(await fetch(url,{headers:{'Fly-Client-IP':'192.0.2.40'}})).json()).ip).toBe('127.0.0.1');
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
it.each(['apt','service'] as const)('snapshots exact %s declarations, rejecting missing acceptance',kind=>{
 const declarations=kind==='apt'?APT_DECLARATIONS:SERVICE_DECLARATIONS,body=Object.fromEntries(declarations.map(([k])=>[k,true]));expect(agreementConsentSnapshot(kind,body).statements).toEqual(declarations.map(([key,text])=>({key,text,accepted:true})));for(const [key] of declarations)expect(()=>agreementConsentSnapshot(kind,{...body,[key]:false})).toThrow();
 const html=fs.readFileSync(path.join(__dirname,kind==='apt'?'../../tenants-subdomain/agreement.html':'../../tenants-subdomain/service-agreement.html'),'utf8').replace(/<[^>]+>/g,'').replaceAll('&amp;','&');for(const [,text] of declarations)expect(html).toContain(text);
});
