import type {Express} from 'express';
import pool,{query,queryOne} from './db-pg';
import {authMiddleware,requireRole,type AuthRequest} from './auth';
import {defaultCompanySettings,type CompanySettings} from './company-settings-values';
import {cropSignature} from './signature-image';
import {bankDetailsForRoute,type PaymentRoute} from './tenancy-agreement-pdf';
import sharp from 'sharp';
import {companySettingsPreview,companyMessagePreview,companyPreviewKinds} from './company-settings-preview';
import {issuePhoneChallenge,consumePhoneChallenge} from './settings-phone-verification';

export async function getCompanySettings():Promise<{data:CompanySettings;version:number}> {
  const row=await queryOne('SELECT data,version FROM company_settings WHERE id=1');
  return row ? {data:row.data,version:row.version} : {data:defaultCompanySettings(),version:0};
}
export async function configuredBankDetails(route:PaymentRoute) {
  const {data}=await getCompanySettings();
  return bankDetailsForRoute(route,undefined,data);
}
export function validateCompanySettings(input:any):CompanySettings {
  const text=(value:unknown,label:string,max=200,required=true)=>{
    if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value))throw Error(`Enter a valid ${label}`);
    return value.trim();
  };
  const membership=(value:any,label:string)=>{
    const expiry=text(value?.expiry,`${label} expiry date`,10,false);
    if(expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||Number.isNaN(Date.parse(expiry))||new Date(expiry).toISOString().slice(0,10)!==expiry))throw Error(`Enter a valid ${label} expiry date`);
    return {provider:text(value?.provider,`${label} provider`),number:text(value?.number,`${label} certificate number`,80),expiry};
  };
  const bank=(value:any,label:string)=>{
    const sortCode=text(value?.sortCode,`${label} sort code`,20).replace(/[ -]/g,'');
    const accountNumber=text(value?.accountNumber,`${label} account number`,8);
    if(!/^\d{6}$/.test(sortCode)||!/^\d{8}$/.test(accountNumber))throw Error(`Enter a six-digit sort code and eight-digit account number for ${label}`);
    return {sortCode:sortCode.replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'),accountNumber,accountName:text(value?.accountName,`${label} account name`),bankName:text(value?.bankName,`${label} bank name`)};
  };
  const email=text(input?.email,'company email'),companyNumber=text(input?.companyNumber,'company number',8);
  if(!/^\S+@\S+\.\S+$/.test(email)||!/^([A-Za-z]{2}|\d{2})\d{6}$/.test(companyNumber))throw Error('Enter a valid company number and email address');
  const userId=input?.signer?.userId;
  if(userId!==null&&(!Number.isInteger(userId)||userId<1))throw Error('Select a signing authority');
  const signature=text(input?.signer?.signature,'signature',750000);
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature))throw Error('Upload a PNG signature for the selected signing authority');
  return {legalName:text(input.legalName,'legal company name'),companyNumber:companyNumber.toUpperCase(),registeredAddress:text(input.registeredAddress,'registered address',600),email,phone:text(input.phone,'office telephone',40),website:text(input.website,'website',200),vatNumber:text(input.vatNumber,'VAT number',30,false),cmp:membership(input.cmp,'CMP'),redress:membership(input.redress,'redress'),operatingAccount:bank(input.operatingAccount,'operating account'),clientAccount:bank(input.clientAccount,'client account'),signer:{userId,name:'',title:text(input.signer.title,'signatory job title',100),signature}};
}
export function registerCompanySettings(app:Express) {
  const guards=[authMiddleware,requireRole('admin')];
  app.get('/api/company-settings',...guards,async(_req,res)=>{
    const settings=await getCompanySettings();
    const users=await query('SELECT id,name FROM users WHERE is_active=1 ORDER BY name');
    const history=await query("SELECT user_email,created_at,changes FROM audit_log WHERE entity_type='company_settings' AND action='company_settings_updated' ORDER BY created_at DESC LIMIT 20");
    res.set('Cache-Control','no-store').json({...settings,users,history:history.map(row=>({...row,changes:typeof row.changes==='string'?JSON.parse(row.changes):row.changes}))});
  });
  app.post('/api/company-settings/challenge',...guards,async(req:AuthRequest,res)=>{
    try {
      const data=validateCompanySettings(req.body.data);
      const current=await getCompanySettings();
      if(req.body.version!==current.version)return res.status(409).json({error:'Company settings changed. Reload before saving.'});
      res.set('Cache-Control','no-store').json(await issuePhoneChallenge(req,'company-settings',{data,version:req.body.version}));
    }catch(e){res.status(400).json({error:(e as Error).message});}
  });
  app.put('/api/company-settings',...guards,async(req:AuthRequest,res)=>{
    let data:CompanySettings;
    try {data=validateCompanySettings(req.body.data);await sharp(Buffer.from(data.signer.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).metadata();data.signer.signature='data:image/png;base64,'+(await cropSignature(Buffer.from(data.signer.signature.split(',')[1],'base64'))).toString('base64');}
    catch(e){return res.status(400).json({error:(e as Error).message});}
    const c=await pool.connect();
    try {
      await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(470047)');
      const current=(await c.query('SELECT data,version FROM company_settings WHERE id=1 FOR UPDATE')).rows[0]||{data:defaultCompanySettings(),version:0};
      if(req.body.version!==current.version){await c.query('ROLLBACK');return res.status(409).json({error:'Company settings changed. Reload before saving.'});}
      if(!await consumePhoneChallenge(c,req,'company-settings',{data:validateCompanySettings(req.body.data),version:req.body.version})){await c.query('COMMIT');return res.status(403).json({error:'Phone verification is required for each save. Check your code or request a new one.'});}
      if(data.signer.userId!==null){
        const user=(await c.query('SELECT name FROM users WHERE id=$1 AND is_active=1 FOR SHARE',[data.signer.userId])).rows[0];
        if(!user){await c.query('ROLLBACK');return res.status(400).json({error:'Select an active team member'});}
        data.signer.name=user.name;
        if(data.signer.userId!==current.data.signer.userId&&(req.body.data.signer.signature===current.data.signer.signature||data.signer.signature===current.data.signer.signature)){await c.query('ROLLBACK');return res.status(400).json({error:'Upload the new signing authority’s signature'});}
      } else {data.signer.name='Robert Fleming';if(current.data.signer.userId!==null){await c.query('ROLLBACK');return res.status(400).json({error:'Select an active team member as signing authority'});}}
      const changed=Object.keys(data).filter(key=>JSON.stringify(data[key])!==JSON.stringify(current.data[key]));
      const version=current.version+1;
      await c.query('INSERT INTO company_settings(id,data,version,updated_by) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=NOW()',[JSON.stringify(data),version,req.user.id]);
      await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'company_settings_updated','company_settings',1,$3)",[req.user.id,req.user.email,JSON.stringify({version,fields:changed,signer:data.signer.name})]);
      await c.query('COMMIT');res.json({data,version});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.post('/api/company-settings/preview',...guards,async(req,res)=>{
    try {
      if(!companyPreviewKinds.includes(req.body.kind))return res.status(400).json({error:'Choose an available document or message preview'});
      const data=validateCompanySettings(req.body.data);
      if(data.signer.userId===null)data.signer.name='Robert Fleming';
      else {const user=await queryOne('SELECT name FROM users WHERE id=$1 AND is_active=1',[data.signer.userId]);if(!user)return res.status(400).json({error:'Select an active team member'});data.signer.name=user.name;}
      await sharp(Buffer.from(data.signer.signature.split(',')[1],'base64'),{limitInputPixels:4000000}).metadata();
      data.signer.signature='data:image/png;base64,'+(await cropSignature(Buffer.from(data.signer.signature.split(',')[1],'base64'))).toString('base64');
      if(req.body.kind==='balance-operating'||req.body.kind==='balance-client'){const content=companyMessagePreview(data,req.body.kind);return res.set('Cache-Control','no-store').json({subject:content.subject,body_html:content.html});}
      const pdf=await companySettingsPreview(data,req.body.kind);
      res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':`inline; filename="test-${req.body.kind}.pdf"`}).send(pdf);
    }catch(e){res.status(400).json({error:(e as Error).message});}
  });
}
