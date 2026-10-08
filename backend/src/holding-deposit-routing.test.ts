import {readFileSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import express from 'express';
import ts from 'typescript';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {holdingDepositBank} from './holding-deposit-bank';
import {defaultCompanySettings} from './company-settings-values';
import {holdingDepositRequestEmail,holdingDepositReceiptEmail,normalizePropertyAddress} from './email';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));});
async function fixture(landlordType:string,serviceType='let_only') {
  const source=readFileSync(new URL('./index-pg.ts',import.meta.url),'utf8');
  const extract=(start:string,end:string)=>ts.transpileModule(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const app=express();app.use(express.json());
  const record={id:10,first_name_1:'Jamie',last_name_1:'Example',email_1:'fictional@example.test',application_form_slug:'fictional',property_address:'19 Example Street',property_postcode:'WV1 4AT',property_city:'Wolverhampton',address:'19 Example Street',postcode:'WV1 4AT',city:'Wolverhampton',property_landlord_type:landlordType,service_type:serviceType};
  const company=defaultCompanySettings();
  company.operatingAccount.accountNumber='11111111';company.clientAccount.accountNumber='22222222';
  const sent=vi.fn(async()=>({success:true,id:'mock-only'})),run=vi.fn(async()=>{});
  const auth=(req:any,_res:any,next:()=>void)=>{req.user={id:1,email:'staff@example.test'};next();};
  const dependencies={app,authMiddleware:auth,requirePermission:()=>auth,queryOne:async()=>record,applicationRecipients:async()=>[record],getCompanySettings:async()=>({data:company}),holdingDepositBank,normalizePropertyAddress,run,insert:vi.fn(async()=>1),logAudit:vi.fn(async()=>{}),OUTBOUND_EMAIL_ADDRESS:'office@example.test',SMS_FROM:'Fleming',require:(module:string)=>module==='./email'?{holdingDepositRequestEmail,holdingDepositReceiptEmail,sendEmail:sent}: {normalizeUkPhone:(phone:string)=>phone,sendSms:vi.fn()}};
  const code=extract('async function sendApplicationMessages(',"app.post('/api/tenant-enquiries/:id/retry-holding-deposit-email'")+extract("app.post('/api/tenant-enquiries/:id/request-holding-deposit'","app.post('/api/tenant-enquiries/:id/send-application-email/email-preview'")+extract("app.post('/api/tenant-enquiries/:id/holding-deposit/email-preview'",'// Send a workflow email');
  new Function(...Object.keys(dependencies),code)(...Object.values(dependencies));
  const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('No test server');
  const post=(suffix:string)=>fetch(`http://127.0.0.1:${address.port}/api/tenant-enquiries/10/${suffix}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({monthly_rent:1500,security_deposit:1500,holding_deposit:346,send_email:true,send_sms:false,payment_route:'landlord',account_number:'99999999'})});
  return {post,sent,run};
}
describe('holding deposit request and preview routes',()=>{
  it.each([['internal','let_only','11111111'],['external','let_only','22222222'],['external','rent_collection','22222222'],['external','full_management','22222222']])('uses the same configured account in preview and send for %s / %s',async(owner,service,account)=>{
    const {post,sent}=await fixture(owner,service);
    const preview=await post('holding-deposit/email-preview');expect(preview.status).toBe(200);const content=await preview.json();
    expect(content.html).toContain(account);expect(content.html).toContain('Wolverhampton');expect(content.html).not.toContain('99999999');
    const request=await post('request-holding-deposit');expect(request.status).toBe(200);
    expect(sent).toHaveBeenCalledTimes(1);expect(sent.mock.calls[0][0].html).toBe(content.html);
  });
  it('does not mark the deposit requested or send when property ownership is missing',async()=>{
    const {post,sent,run}=await fixture(null);
    expect((await post('holding-deposit/email-preview')).status).toBe(409);
    expect((await post('request-holding-deposit')).status).toBe(409);
    expect(sent).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
  });
});
