import type {Express} from 'express';
import {authMiddleware,type AuthRequest} from './auth';
import {queryOne,query} from './db-pg';

export async function onboardingActivity(enquiryId:number) {
  const viewed=await queryOne(`SELECT created_at FROM audit_log WHERE entity_type='tenant_enquiry' AND entity_id=$1
    AND action='view' AND changes::jsonb->>'section'='tenant_onboarding' ORDER BY created_at DESC,id DESC LIMIT 1`,[enquiryId]);
  const progressed=await queryOne(`SELECT a.created_at,COALESCE(NULLIF(u.name,''),a.user_email,'Unknown Agent') AS agent
    FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.entity_type='tenant_enquiry' AND a.entity_id=$1 AND a.user_id IS NOT NULL AND (
      a.action IN ('application_review','application_section_review','credit_check_completed','holding_deposit_requested','document_review')
      OR a.changes::jsonb->>'action' IN ('holding_deposit_received','final_balance_requested','final_balance_received','handover_scheduled','tenancy_agreement_generated')
      OR a.changes::jsonb ? 'converted_to_tenant' OR a.changes::jsonb ? 'handover_not_required')
    ORDER BY a.created_at DESC,a.id DESC LIMIT 1`,[enquiryId]);
  return {last_viewed_at:viewed?.created_at||null,last_progressed_at:progressed?.created_at||null,last_progressed_by:progressed?.agent||null};
}
export function registerOnboardingActivity(app:Express) {
  app.get('/api/tenant-enquiries/:id/onboarding-activity',authMiddleware,async(req,res)=>{
    res.json(await onboardingActivity(Number(req.params.id)));
  });
  app.post('/api/tenant-enquiries/:id/onboarding-view',authMiddleware,async(req:AuthRequest,res)=>{
    const id=Number(req.params.id);
    if(!await queryOne('SELECT id FROM tenant_enquiries WHERE id=$1',[id]))return res.status(404).json({error:'Enquiry not found'});
    await query(`INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes)
      VALUES($1,$2,'view','tenant_enquiry',$3,$4)`,[req.user.id,req.user.email,id,JSON.stringify({section:'tenant_onboarding'})]);
    res.json(await onboardingActivity(id));
  });
}
