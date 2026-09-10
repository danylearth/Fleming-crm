import { Router, type Express, type RequestHandler } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import pool, { query, queryOne } from './db-pg';
import { authMiddleware, requireRole, type AuthRequest } from './auth';
import { brandedEmailHtml, sendEmail, OUTBOUND_EMAIL_ADDRESS } from './email';

const MAX_FILE = 25 * 1024 * 1024;
const extensions = new Set(['.png','.jpg','.jpeg','.webp','.heic','.gif','.pdf','.doc','.docx','.xls','.xlsx','.csv','.txt','.zip','.mp4','.mov','.mp3','.m4a','.ogg','.wav']);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clean = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const publicTicket = (row: any) => { const { claim_token, run_id, ...rest } = row; return rest; };

export function validFeedbackAnchor(value: any): boolean {
  return value === null || (typeof value === 'object' && !Array.isArray(value)
    && typeof value.selector === 'string' && value.selector.length <= 700
    && typeof value.label === 'string' && value.label.length <= 200
    && ['x','y','pageX','pageY'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1));
}

async function detail(id: number) {
  const ticket = await queryOne('SELECT f.*,u.name AS author_name FROM feedback_tickets f JOIN users u ON u.id=f.created_by WHERE f.id=$1',[id]);
  if (!ticket) return null;
  const [messages, files, notifications] = await Promise.all([
    query('SELECT * FROM feedback_messages WHERE ticket_id=$1 ORDER BY id',[id]),
    query('SELECT id,ticket_id,message_id,original_name,mime_type,size,sha256 FROM feedback_files WHERE ticket_id=$1 ORDER BY id',[id]),
    query('SELECT id,revision,sent_at,last_error FROM feedback_notifications WHERE ticket_id=$1 ORDER BY id',[id]),
  ]);
  return { ...publicTicket(ticket), messages, files, notifications };
}

export function registerFeedbackRoutes(app: Express) {
  const agent = Router();
  agent.use(((req, res, next) => {
    const expected = process.env.FEEDBACK_AGENT_TOKEN || '';
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return res.status(401).json({error:'Invalid feedback agent credential'});
    next();
  }) as RequestHandler);
  agent.get('/queue', async (_req,res) => {
    const tickets = await query("SELECT * FROM feedback_tickets WHERE status='queued' OR (status='in_progress' AND claimed_until < NOW()) ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,created_at LIMIT 100");
    const pending = await query("SELECT id,ticket_id,revision,last_error,first_attempt_at FROM feedback_notifications WHERE sent_at IS NULL ORDER BY id");
    res.json({tickets:tickets.map(publicTicket),pending_notifications:pending});
  });
  agent.post('/:id/claim', async (req,res) => {
    if (!Number.isSafeInteger(req.body.revision) || !clean(req.body.run_id,120)) return res.status(400).json({error:'revision and run_id are required'});
    const row = await queryOne(`UPDATE feedback_tickets SET status='in_progress',claim_token=$1,claimed_until=NOW()+INTERVAL '2 hours',run_id=$2
      WHERE id=$3 AND revision=$4 AND (status='queued' OR (status='in_progress' AND claimed_until < NOW())) RETURNING *`,[crypto.randomUUID(),req.body.run_id,req.params.id,req.body.revision]);
    if (!row) return res.status(409).json({error:'Feedback changed or is already claimed; refresh the queue'});
    res.json({...await detail(row.id),claim_token:row.claim_token});
  });
  agent.post('/:id/update', async (req,res) => {
    const {status,summary,verification,release,revision,claim_token} = req.body;
    if (!['in_progress','blocked','completed'].includes(status) || !clean(summary,20000) || !uuid(claim_token) || !Number.isSafeInteger(revision)) return res.status(400).json({error:'Invalid progress update'});
    if (status === 'completed' && (!clean(verification,10000) || typeof release !== 'string' || !/^[a-f0-9]{7,40}$/.test(release))) return res.status(400).json({error:'Completion requires verification results and a deployed commit'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ticket = (await client.query('SELECT * FROM feedback_tickets WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if (!ticket || ticket.revision !== revision || ticket.claim_token !== claim_token || ticket.status !== 'in_progress' || new Date(ticket.claimed_until).getTime() < Date.now()) { await client.query('ROLLBACK'); return res.status(409).json({error:'Claim expired or feedback changed. Read it again before completing.'}); }
      await client.query("UPDATE feedback_tickets SET status=$1,resolution=$2,verification=$3,release=$4,updated_at=NOW(),claimed_until=CASE WHEN $1='in_progress' THEN NOW()+INTERVAL '2 hours' ELSE NULL END WHERE id=$5",[status,summary,verification||null,release||null,ticket.id]);
      await client.query('INSERT INTO feedback_messages(ticket_id,client_id,author_name,is_agent,body) VALUES($1,$2,$3,TRUE,$4)',[ticket.id,crypto.randomUUID(),'Fleming updates',summary]);
      if (status === 'completed') {
        const html = brandedEmailHtml('Your feedback is complete',`<p>Your feedback <strong>#${ticket.id}: ${escape(ticket.title)}</strong> has been implemented and published.</p><p style="white-space:pre-wrap">${escape(summary)}</p><p><a href="https://crm.fleminglettings.co.uk${escape(ticket.page_path)}?feedback=${ticket.id}">Open your feedback in the CRM</a></p><p>You can reply in the feedback panel if anything needs another look.</p>`);
        await client.query('INSERT INTO feedback_notifications(ticket_id,revision,to_email,subject,html) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[ticket.id,revision,process.env.FEEDBACK_NOTIFICATION_EMAIL || 'accounts@fleminglettings.co.uk',`Fleming CRM: feedback #${ticket.id} completed`,html]);
      }
      await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES('feedback-agent','update','feedback',$1,$2)",[ticket.id,JSON.stringify({status,revision,release:release||null})]);
      await client.query('COMMIT'); res.json(await detail(ticket.id));
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  agent.post('/notifications/send', async (_req,res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const note = (await client.query('SELECT * FROM feedback_notifications WHERE sent_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1')).rows[0];
      if (!note) { await client.query('COMMIT'); return res.json({pending:false}); }
      // Provider keys last 24h. After an uncertain attempt, stop automatic retries
      // before that window expires; reconcile against Resend rather than duplicate mail.
      if (note.first_attempt_at && Date.now()-new Date(note.first_attempt_at).getTime() > 23*60*60*1000) { await client.query('COMMIT'); return res.status(409).json({error:'Notification needs provider reconciliation before retry',notification_id:note.id}); }
      // Persist the first attempt before transmission, even if the process later crashes.
      await client.query('UPDATE feedback_notifications SET first_attempt_at=COALESCE(first_attempt_at,NOW()),attempts=attempts+1 WHERE id=$1',[note.id]);
      await client.query('COMMIT');
      // Session advisory lock prevents overlapping sends without holding a transaction.
      const locked = (await client.query('SELECT pg_try_advisory_lock(14914,$1) AS locked',[note.id])).rows[0].locked;
      if (!locked) return res.status(409).json({error:'Notification is being sent'});
      try {
        const current = (await client.query('SELECT sent_at FROM feedback_notifications WHERE id=$1',[note.id])).rows[0];
        if (current.sent_at) return res.json({pending:false});
        const result = await sendEmail({to:note.to_email,subject:note.subject,html:note.html,idempotencyKey:`fleming-feedback-${note.id}`});
        if (!result.success || result.simulated) { await client.query('UPDATE feedback_notifications SET last_error=$1 WHERE id=$2',[result.error || 'Simulated delivery is not accepted',note.id]); return res.status(502).json({error:'Email not sent; retained for retry',notification_id:note.id}); }
        await client.query('BEGIN');
        await client.query('UPDATE feedback_notifications SET sent_at=NOW(),resend_id=$1,last_error=NULL WHERE id=$2',[result.id,note.id]);
        await client.query("INSERT INTO email_messages(resend_id,entity_type,entity_id,to_email,from_email,subject,template,status,sent_by_email) VALUES($1,'feedback',$2,$3,$4,$5,'feedback_completed','sent','feedback-agent')",[result.id,note.ticket_id,note.to_email,OUTBOUND_EMAIL_ADDRESS,note.subject]);
        await client.query('COMMIT'); res.json({sent:true,notification_id:note.id,resend_id:result.id});
      } finally { await client.query('SELECT pg_advisory_unlock(14914,$1)',[note.id]); }
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  const fileHandler: RequestHandler = async (req,res) => {
    const file = await queryOne('SELECT original_name,size,content FROM feedback_files WHERE id=$1 AND ticket_id=$2',[req.params.fileId,req.params.id]);
    if (!file) return res.status(404).json({error:'File not found'});
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    res.send(file.content);
  };
  agent.get('/:id/files/:fileId',fileHandler);
  agent.get('/:id',async (req,res) => { const item=await detail(Number(req.params.id)); if(!item)return res.status(404).json({error:'Feedback not found'});res.json(item); });
  app.use('/api/feedback-agent',agent);

  const admin = Router();
  admin.use(authMiddleware,requireRole('admin'));
  admin.get('/',async (req,res) => {
    const offset=Number(req.query.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0)return res.status(400).json({error:'Invalid offset'});
    const rows=await query('SELECT f.*,u.name AS author_name,(SELECT count(*)::int FROM feedback_messages m WHERE m.ticket_id=f.id) AS message_count FROM feedback_tickets f JOIN users u ON u.id=f.created_by ORDER BY updated_at DESC,id DESC LIMIT 101 OFFSET $1',[offset]);
    res.json({tickets:rows.slice(0,100).map(publicTicket),next_offset:rows.length>100?offset+100:null});
  });
  admin.get('/:id/files/:fileId',fileHandler);
  admin.get('/:id',async(req,res)=>{const item=await detail(Number(req.params.id));if(!item)return res.status(404).json({error:'Feedback not found'});res.json(item);});
  const staging = path.join(os.tmpdir(),'fleming-feedback-uploads');
  fs.mkdirSync(staging,{recursive:true,mode:0o700});
  const upload=multer({dest:staging,limits:{fileSize:MAX_FILE,files:10,fields:12,fieldSize:30000},fileFilter:(_req,file,cb)=>{if(extensions.has(path.extname(file.originalname).toLowerCase()))cb(null,true);else cb(new Error('Unsupported file type'));}}).array('files',10);
  const uploadHandler: RequestHandler = (req,res,next) => upload(req,res,err=>{
    if(err) return res.status(400).json({error:'Upload failed. Use up to 10 files, 25 MB each.'});
    next();
  });
  const writeLimiter = rateLimit({windowMs:60*1000,max:20,standardHeaders:true,legacyHeaders:false});
  const save: RequestHandler = async (req: AuthRequest,res) => {
    const files=(req.files || []) as Express.Multer.File[];
    const client=await pool.connect();
    try {
      const {client_id,body,title,category,priority,page_path}=req.body;
      let anchor=null;
      try { anchor=req.body.anchor?JSON.parse(req.body.anchor):null; } catch { return res.status(400).json({error:'Invalid page pin'}); }
      if(!uuid(client_id)||!clean(body,20000)||!validFeedbackAnchor(anchor)||files.some(f=>!f.size)||files.reduce((n,f)=>n+f.size,0)>100*1024*1024) return res.status(400).json({error:'Add feedback text and valid files (100 MB total maximum)'});
      const isReply=!!req.params.id;
      if(!isReply&&(!clean(title,140)||!['bug','feature','data','question'].includes(category)||!['normal','high','low'].includes(priority)||typeof page_path!=='string'||!/^\/[a-zA-Z0-9/_-]*$/.test(page_path)||page_path.length>240)) return res.status(400).json({error:'Check the title, category and page'});
      await client.query('BEGIN');
      // Lock each client request id to make retries safe, including simultaneous retries.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[client_id]);
      const existing=(await client.query('SELECT ticket_id,author_id FROM feedback_messages WHERE client_id=$1',[client_id])).rows[0];
      if(existing){await client.query('ROLLBACK');if(existing.author_id!==req.user!.id || (isReply && existing.ticket_id!==Number(req.params.id)))return res.status(409).json({error:'Request id already used'});return res.json(await detail(existing.ticket_id));}
      let ticket;
      if(isReply){
        ticket=(await client.query('SELECT * FROM feedback_tickets WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(!ticket){await client.query('ROLLBACK');return res.status(404).json({error:'Feedback not found'});}
        await client.query("UPDATE feedback_tickets SET revision=revision+1,status='queued',claim_token=NULL,claimed_until=NULL,updated_at=NOW() WHERE id=$1",[ticket.id]);
      }else ticket=(await client.query('INSERT INTO feedback_tickets(client_id,created_by,title,category,priority,page_path,anchor) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[client_id,req.user!.id,title.trim(),category,priority,page_path,anchor])).rows[0];
      const message=(await client.query('INSERT INTO feedback_messages(ticket_id,client_id,author_id,author_name,body) VALUES($1,$2,$3,$4,$5) RETURNING id',[ticket.id,client_id,req.user!.id,req.user!.name,body.trim()])).rows[0];
      for(const f of files){const content=await fs.promises.readFile(f.path);await client.query('INSERT INTO feedback_files(ticket_id,message_id,original_name,mime_type,size,sha256,content) VALUES($1,$2,$3,$4,$5,$6,$7)',[ticket.id,message.id,path.basename(f.originalname).replace(/[\x00-\x1f]/g,'').slice(0,240),f.mimetype,f.size,crypto.createHash('sha256').update(content).digest('hex'),content]);}
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'create','feedback',$3,$4)",[req.user!.id,req.user!.email,ticket.id,JSON.stringify({message_id:message.id,files:files.length})]);
      await client.query('COMMIT');res.status(201).json(await detail(ticket.id));
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await Promise.all(files.map(f=>fs.promises.unlink(f.path).catch(()=>{})));}
  };
  admin.post('/',writeLimiter,uploadHandler,save);
  admin.post('/:id/messages',writeLimiter,uploadHandler,save);
  app.use('/api/feedback',admin);
}
