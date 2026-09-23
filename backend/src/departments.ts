import type {Express} from 'express';
import pool,{query,queryOne} from './db-pg';
import {authMiddleware,requirePermission,type AuthRequest} from './auth';
export async function validDepartment(value:unknown){return typeof value==='string'&&(!value||!!await queryOne('SELECT id FROM departments WHERE name=$1',[value]));}
export function contactDetails(body:any){
 const phone=String(body.phone||'').trim(),office_extension=String(body.office_extension||'').trim();
 if(phone&&!/^\+?[0-9 ()-]{7,24}$/.test(phone))throw Error('Enter a valid mobile number');
 if(office_extension&&!/^[0-9]{1,8}$/.test(office_extension))throw Error('Enter an office extension of up to eight digits');
 const contact_email=String(body.contact_email||'').trim();
 if(contact_email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)||contact_email.length>254))throw Error('Enter a valid email address');
 return {phone,office_extension,contact_email};
}
export function registerDepartments(app:Express){
 app.get('/api/departments',authMiddleware,async(_req,res)=>res.json(await query('SELECT id,name FROM departments ORDER BY name')));
 const save=async(req:AuthRequest,res:any)=>{
  const name=String(req.body.name||'').trim(),ids=req.body.user_ids;
  if(!name||name.length>100||!Array.isArray(ids)||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)return res.status(400).json({error:'Enter a team name and choose existing users'});
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('department-membership'))");
   const before=req.params.id?(await c.query('SELECT * FROM departments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]:null;
   if(req.params.id&&!before)throw Error('Team not found');
   if((await c.query('SELECT id FROM users WHERE id=ANY($1::int[])',[ids])).rows.length!==ids.length)throw Error('Choose existing users');
   const changed=(await c.query('SELECT id,department FROM users WHERE id=ANY($1::int[]) OR department=$2 FOR UPDATE',[ids,before?.name||name])).rows;
   const team=before?(await c.query('UPDATE departments SET name=$1 WHERE id=$2 RETURNING id,name',[name,before.id])).rows[0]:(await c.query('INSERT INTO departments(name,created_by) VALUES($1,$2) RETURNING id,name',[name,req.user.id])).rows[0];
   if(before)await c.query("UPDATE users SET department='' WHERE department=$1",[before.name]);
   await c.query('UPDATE users SET department=$1 WHERE id=ANY($2::int[])',[name,ids]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'department',$4,$5)",[req.user.id,req.user.email,before?'update':'create',team.id,JSON.stringify({before,previous_memberships:changed,name,user_ids:ids})]);
   await c.query('COMMIT');res.json(team);
  }catch(e:any){await c.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'A team with that name already exists':e.message});}finally{c.release();}
 };
 app.post('/api/departments',authMiddleware,requirePermission('manager'),save);
 app.put('/api/departments/:id',authMiddleware,requirePermission('manager'),save);
 app.delete('/api/departments/:id',authMiddleware,requirePermission('manager'),async(req:AuthRequest,res)=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('department-membership'))");
   const team=(await c.query('SELECT * FROM departments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!team){await c.query('ROLLBACK');return res.status(404).json({error:'Team not found'});}
   const members=(await c.query("UPDATE users SET department='' WHERE department=$1 RETURNING id",[team.name])).rows;
   await c.query('DELETE FROM departments WHERE id=$1',[team.id]);
   await c.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'delete','department',$3,$4)",[req.user.id,req.user.email,team.id,JSON.stringify({team,unassigned_user_ids:members.map(u=>u.id)})]);
   await c.query('COMMIT');res.json({success:true});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
}
