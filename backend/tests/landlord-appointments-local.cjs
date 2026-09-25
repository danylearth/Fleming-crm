const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const pool = require('../dist/db-pg').default;
const {generateToken} = require('../dist/auth');
const {registerLandlordAppointments} = require('../dist/landlord-appointments');
const database = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(database.hostname) || database.pathname !== '/fleming_local') throw Error('This check only runs against the local demo database');
let enquiryId, server;
(async () => {
 const user=(await pool.query("SELECT id,email,name,role FROM users WHERE role='admin' AND is_active=1 AND NOT password_setup_required LIMIT 1")).rows[0];
 assert.ok(user,'Local demo admin required');
 enquiryId=(await pool.query("INSERT INTO landlords_bdm(name,email,phone,address,status) VALUES('Appointment QA','qa@example.invalid','07700900000','Sample address','new') RETURNING id")).rows[0].id;
 const app=express();app.use(express.json());registerLandlordAppointments(app);
 server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 const url=`http://127.0.0.1:${server.address().port}/api/landlords-bdm/${enquiryId}/appointment`;
 const body={request_id:crypto.randomUUID(),kind:'meeting',date:'2099-10-01',time:'10:30',location:'Creative Industries Centre, Wolverhampton Science Park, WV10 9TG',send_email:false,send_sms:false};
 const options=value=>({method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${generateToken(user)}`},body:JSON.stringify(value)});
 assert.equal((await fetch(url,options({...body,location:''}))).status,400);
 const first=await fetch(url,options(body));assert.equal(first.status,201);const result=await first.json();
 const retry=await fetch(url,options(body));assert.equal(retry.status,200);assert.equal((await retry.json()).id,result.id);
 const tasks=(await pool.query("SELECT description FROM tasks WHERE entity_type='landlord_bdm' AND entity_id=$1 AND task_type='landlord_meeting'",[enquiryId])).rows;
 assert.equal(tasks.length,1);assert.ok(tasks[0].description.includes(body.location));
 assert.equal((await pool.query('SELECT status FROM landlords_bdm WHERE id=$1',[enquiryId])).rows[0].status,'follow_up');
 assert.equal((await pool.query("SELECT id FROM email_messages WHERE entity_type='landlord_bdm' AND entity_id=$1",[enquiryId])).rowCount,0);
 console.log('PASS: validation, office address, task creation, progression and idempotent retry; no messages sent.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(enquiryId){
  await pool.query("DELETE FROM audit_log WHERE entity_type='landlord_bdm' AND entity_id=$1",[enquiryId]);
  await pool.query("DELETE FROM tasks WHERE entity_type='landlord_bdm' AND entity_id=$1",[enquiryId]);
  await pool.query('DELETE FROM landlord_appointments WHERE enquiry_id=$1',[enquiryId]);
  await pool.query('DELETE FROM landlords_bdm WHERE id=$1',[enquiryId]);
 }
 await pool.end();
});
