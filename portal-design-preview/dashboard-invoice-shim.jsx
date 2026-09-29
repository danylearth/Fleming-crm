import React from 'react';
const due=new Date().toISOString().slice(0,10);
const props=[{id:1,address:'Example portfolio property',postcode:'',status:'let',landlord_type:'internal',landlord_id:1,landlord_name:'Portfolio owner',rent_amount:800,image_url:'/logo-dark.png'},{id:2,address:'Example client property',postcode:'',status:'let',landlord_type:'external',landlord_id:2,landlord_name:'Client owner',rent_amount:950,image_url:'/logo-dark.png'}];
const tasks=[{id:1,title:'Portfolio property inspection',status:'pending',priority:'medium',due_date:due,entity_type:'property',entity_id:1},{id:2,title:'Client tenant follow-up',status:'pending',priority:'high',due_date:due,entity_type:'tenant',entity_id:2},{id:3,title:'General office task',status:'pending',priority:'low',due_date:due}];
const api={get:async(path)=>{
 if(path.startsWith('/api/financial-documents/records'))return [{id:193,number:'INV00193',kind:'rent_invoice',created_at:'2026-09-28',snapshot:{date:'2026-09-21',period_start:'2026-09-21',period_end:'2026-10-20',description:'Monthly rent for Example Road\n\nRental period: 21 September 2026 to 20 October 2026',amount:800}}];
 if(path.startsWith('/api/dashboard'))return {stats:{properties:2,active_tenancies:2,open_maintenance:0,active_enquiries:0},complianceAlerts:props.map(p=>({id:p.id,property_address:p.address,type:'EICR',expiry_date:due})),recentMaintenance:[],recentTasks:[]};
 if(path.startsWith('/api/properties'))return props;
 if(path.startsWith('/api/tasks'))return tasks;
 if(path.startsWith('/api/tenants'))return [{id:1,property_id:1,status:'active'},{id:2,property_id:2,status:'active'}];
 if(path.startsWith('/api/landlords?'))return [{id:1,landlord_type:'internal'},{id:2,landlord_type:'external'}];
 return [];
},post:async()=>{throw Error('Test preview: changes are disabled');},delete:async()=>{throw Error('Test preview: changes are disabled');}};
export function useApi(){return api;}
export function useAuth(){return {user:{id:1,name:'Test User',role:'admin',finance_access:true},token:'local-preview'};}
export function useNotifications(){return {confirmAction:async()=>false};}
export default function Layout({children}){return <div style={{maxWidth:1400,margin:'auto'}}>{children}</div>;}
