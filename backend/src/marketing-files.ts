import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type {Express} from 'express';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
import {query,queryOne} from './db-pg';
export const marketingRoot=()=>path.join(process.env.UPLOADS_PATH||path.join(__dirname,'../uploads'),'marketing-attachments');
export const allowedMarketingSender=(value:string)=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(tenancies\.)?fleminglettings\.co\.uk$/i.test(value);
const signatureEscape=(value:unknown)=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function emailSignatures(users:{id:number;name:string;email:string;department?:string;phone?:string;office_extension?:string}[]=[],currentUserId?:number){
 const read=(name:string)=>fs.readFileSync(path.join(__dirname,'email-signatures',name+'.html'),'utf8');
 return [{id:'accounts',label:'Accounts Department',html:read('accounts')},{id:'office',label:'Office Support Team',html:read('office')},...users.map(u=>{
  const line='01902 212 415'+(u.office_extension?' ext. '+signatureEscape(u.office_extension):'')+(u.phone?'&nbsp; |&nbsp; <a href="tel:'+signatureEscape(u.phone.replace(/[ ()-]/g,''))+'" style="color:#ffffff;text-decoration:none;white-space:nowrap">'+signatureEscape(u.phone)+'</a>':'');
  const values:Record<string,string>={NAME:signatureEscape(u.name),DEPARTMENT:signatureEscape(u.department),EMAIL:signatureEscape(u.email),PHONE_LINE:line};
  return {id:u.id===currentUserId?'user':`user:${u.id}`,label:u.name,html:read('user').replace(/\{\{(NAME|DEPARTMENT|EMAIL|PHONE_LINE)\}\}/g,(_,key)=>values[key])};
 })];
}
export async function campaignAttachments(ids:unknown){
 if(!Array.isArray(ids)||ids.length>10||ids.some(id=>!Number.isInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw Error('Choose up to 10 attachments');
 if(!ids.length)return [];
 const files=await query("SELECT id,filename,original_name,mime_type,size FROM marketing_files WHERE kind='attachment' AND id=ANY($1::int[])",[ids]);
 if(files.length!==ids.length||files.reduce((s,f)=>s+Number(f.size),0)>15*1024*1024)throw Error('Attachments must exist and total no more than 15 MB');
 for(const f of files)if(!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(f.filename)||!fs.existsSync(path.join(marketingRoot(),f.filename)))throw Error('An attachment is unavailable; upload it again');
 return files;
}
export function registerMarketingFiles(app:Express){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}}).single('file');
 app.get('/api/marketing/signatures',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>res.json(emailSignatures(await query('SELECT id,name,email,department,phone,office_extension FROM users WHERE is_active=1 ORDER BY name'),req.user.id)));
 app.get('/api/marketing/assets',authMiddleware,requirePermission('manager'),async(_req,res)=>{
  const defaults=fs.readdirSync(path.join(__dirname,'email-assets')).filter(n=>/\.(png|jpe?g)$/i.test(n)).map(name=>({name,url:`https://crm.fleminglettings.co.uk/email-assets/${name}`}));
  const saved=await query("SELECT original_name AS name,filename FROM marketing_files WHERE kind='image' ORDER BY created_at DESC");
  res.json([...defaults,...saved.map(f=>({name:f.name,url:`${process.env.BASE_URL||'https://fleming-crm-api.fly.dev'}/api/public/email-images/${f.filename}`}))]);
 });
 app.post('/api/marketing/attachments',authMiddleware,requirePermission('manager'),(req,res,next)=>upload(req,res,e=>e?res.status(400).json({error:'Choose one attachment up to 8 MB'}):next()),async(req:AuthRequest,res)=>{
  const f=req.file;if(!f)return res.status(400).json({error:'Choose a file'});
  const ext=path.extname(f.originalname).toLowerCase();const mime:Record<string,string>={'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'};
  if(!mime[ext]||!f.size)return res.status(400).json({error:'Choose a PDF, DOCX, XLSX, CSV, text, JPEG or PNG file'});
  if((ext==='.pdf'&&!f.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))||(['.docx','.xlsx'].includes(ext)&&f.buffer.subarray(0,2).toString()!=='PK'))return res.status(400).json({error:'File contents do not match its extension'});
  const filename=crypto.createHash('sha256').update(f.buffer).digest('hex')+ext;
  fs.mkdirSync(marketingRoot(),{recursive:true});if(!fs.existsSync(path.join(marketingRoot(),filename)))fs.writeFileSync(path.join(marketingRoot(),filename),f.buffer,{mode:0o600});
  const name=path.basename(f.originalname).replace(/[\r\n]/g,'').slice(0,200);
  const row=await queryOne(`INSERT INTO marketing_files(kind,filename,original_name,mime_type,size,created_by) VALUES('attachment',$1,$2,$3,$4,$5) ON CONFLICT(kind,filename,original_name) DO UPDATE SET original_name=EXCLUDED.original_name RETURNING id,original_name AS name,size`,[filename,name,mime[ext],f.size,req.user.id]);
  res.status(201).json(row);
 });
}
