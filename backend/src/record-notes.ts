import type {Express} from 'express';
import pool,{queryOne} from './db-pg';
import {authMiddleware,requirePermission, type AuthRequest} from './auth';
const tables:Record<string,string>={tenant:'tenants',property:'properties',landlord:'landlords',tenant_enquiry:'tenant_enquiries',landlord_bdm:'landlords_bdm'};
const routes:Record<string,string>={tenants:'tenant',properties:'property',landlords:'landlord','tenant-enquiries':'tenant_enquiry','landlords-bdm':'landlord_bdm'};
export function parseRecordNotes(raw:unknown):Record<string,unknown>[] {
  if(typeof raw!=='string')return [];
  try {const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed;}catch{/* legacy text */}
  return raw.trim()?[{id:'legacy',text:raw,author:'System'}]:[];
}
export function preservesNotes(previous:unknown,next:unknown):boolean {
  const incoming=parseRecordNotes(next).map(n=>JSON.stringify(n));
  return parseRecordNotes(previous).every(note=>{const i=incoming.indexOf(JSON.stringify(note));if(i<0)return false;incoming.splice(i,1);return true;});
}
export function registerRecordNoteRoutes(app:Express) {
  // Full-record forms cannot bypass the administrator-only delete operation.
  app.use('/api',async(req:AuthRequest,res,next)=>{
    const match=req.path.match(/^\/(tenants|properties|landlords|tenant-enquiries|landlords-bdm)\/(\d+)(?:\/notes)?$/);
    if(!match||!['PUT','PATCH'].includes(req.method)||req.body?.notes===undefined)return next();
    await authMiddleware(req,res,async()=>{
      if(req.user.role==='viewer')return res.status(403).json({error:'Staff access is required to change notes'});
      if(req.user.role==='admin')return next();
      const row=await queryOne(`SELECT notes FROM ${tables[routes[match[1]]]} WHERE id=$1`,[match[2]]);
      if(row&&!preservesNotes(row.notes,req.body.notes))return res.status(403).json({error:'Only administrators can delete or replace existing notes'});
      next();
    });
  });
  app.post('/api/record-notes/:entity/:id/delete',authMiddleware,requirePermission('admin'),async(req:AuthRequest,res)=>{
    const table=tables[String(req.params.entity)];
    if(!table||typeof req.body.text!=='string')return res.status(400).json({error:'Choose a valid record and note'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query(`SELECT notes FROM ${table} WHERE id=$1 FOR UPDATE`,[req.params.id])).rows[0];
      if(!row){await client.query('ROLLBACK');return res.sendStatus(404);}
      const notes=parseRecordNotes(row.notes);
      const index=notes.findIndex(note=>note.text===req.body.text && (String(note.id)===String(req.body.note_id)||note.id==='legacy'));
      if(index<0){await client.query('ROLLBACK');return res.status(409).json({error:'This note has changed. Refresh the record before deleting it'});}
      const [removed]=notes.splice(index,1);
      await client.query(`UPDATE ${table} SET notes=$1 WHERE id=$2`,[JSON.stringify(notes),req.params.id]);
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'note_deleted',$3,$4,$5)",[req.user.id,req.user.email,req.params.entity,req.params.id,JSON.stringify({note:removed})]);
      await client.query('COMMIT');res.json({success:true});
    }catch{await client.query('ROLLBACK');res.status(500).json({error:'Note could not be deleted'});}finally{client.release();}
  });
}
