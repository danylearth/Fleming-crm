import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
const db=vi.hoisted(()=>({query:vi.fn(),release:vi.fn()}));
vi.mock('./db-pg',()=>({default:{connect:async()=>db},query:async()=>[{id:11},{id:12}]}));
vi.mock('./dashboard-alerts',()=>({dashboardAlerts:async()=>[{alert_key:'1:EICR:2026-10-09:high'},{alert_key:'2:EPC:2026-10-10:medium'}]}));
vi.mock('./auth',()=>({authMiddleware:(req:any,_res:any,next:any)=>{req.user={id:3,email:'test@example.test',role:req.headers['x-role']};next();},requireRole:()=> (req:any,res:any,next:any)=>req.user.role==='admin'?next():res.sendStatus(403)}));
import {registerTeamActivityRoutes} from './team-activity';
let server:Server,base:string;
beforeEach(async()=>{db.query.mockReset();db.query.mockResolvedValue({rows:[],rowCount:0});const app=express();app.use(express.json());registerTeamActivityRoutes(app);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+(server.address() as any).port;});
afterEach(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
const post=(url:string,body:any,role='admin')=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json','x-role':role},body:JSON.stringify(body)});
it('clears only the selected alert and keeps the underlying work',async()=>{
 expect((await post('/api/dashboard/clear-alerts',{keys:['maintenance:11']})).status).toBe(200);
 const insert=db.query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO dashboard_alert_dismissals'));
 expect(insert?.[1]).toEqual([['maintenance:11'],3]);
 expect(db.query.mock.calls.some(([sql])=>/DELETE|UPDATE maintenance|UPDATE tasks/.test(sql))).toBe(false);
});
it('dismisses only selected tasks without completing or deleting them',async()=>{
 expect((await post('/api/tasks/clear-recent',{ids:[7]})).status).toBe(200);
 const update=db.query.mock.calls.find(([sql])=>sql.startsWith('UPDATE tasks'));
 expect(update?.[0]).toContain('AND id=ANY($1::int[])');expect(update?.[1]).toEqual([[7]]);
 expect(update?.[0]).not.toMatch(/status\s*=|DELETE/);
});
it('rejects malformed selections and preserves admin permissions',async()=>{
 expect((await post('/api/tasks/clear-recent',{ids:['7']})).status).toBe(400);
 expect((await post('/api/dashboard/clear-alerts',{keys:[1]})).status).toBe(400);
 expect((await post('/api/tasks/clear-recent',{ids:[7]},'staff')).status).toBe(403);
 expect(db.query).not.toHaveBeenCalled();
});
