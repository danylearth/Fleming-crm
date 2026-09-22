import {query} from './db-pg';
export async function dashboardAlerts(){
 const rows=await query(`
      SELECT alerts.*,task.id AS task_id,task.assigned_to,task.priority FROM (SELECT id, address as property_address, 'EICR' as type, eicr_expiry_date as expiry_date
      FROM properties WHERE archived_at IS NULL AND eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address as property_address, 'EPC', epc_expiry_date FROM properties WHERE archived_at IS NULL AND epc_expiry_date IS NOT NULL AND epc_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address as property_address, 'Gas Safety', gas_safety_expiry_date FROM properties WHERE archived_at IS NULL AND has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL SELECT p.id,p.address,CASE pol.policy_type WHEN 'buildings' THEN 'Buildings Insurance' ELSE 'Rent Protection' END,pol.expiry_date FROM property_policies pol JOIN property_policy_allocations a ON a.policy_id=pol.id JOIN properties p ON p.id=a.property_id WHERE p.archived_at IS NULL AND pol.expiry_date<=CURRENT_DATE+INTERVAL '14 days' AND NOT EXISTS(SELECT 1 FROM property_policies newer JOIN property_policy_allocations na ON na.policy_id=newer.id WHERE na.property_id=p.id AND newer.policy_type=pol.policy_type AND newer.expiry_date>pol.expiry_date AND newer.commencement_date<=pol.expiry_date+1)
      ) alerts LEFT JOIN LATERAL (SELECT id,assigned_to,priority FROM tasks WHERE entity_type='property' AND entity_id=alerts.id AND status IN ('pending','in_progress') AND (due_date=alerts.expiry_date OR task_type='insurance_renewal') AND task_type=CASE alerts.type WHEN 'EICR' THEN 'eicr_reminder' WHEN 'EPC' THEN 'epc_reminder' WHEN 'Gas Safety' THEN 'gas_reminder' ELSE 'insurance_renewal' END ORDER BY id DESC LIMIT 1) task ON TRUE
      UNION ALL
      SELECT p.id,p.address,CASE t.task_type WHEN 'inventory_due' THEN 'Inventory Due' ELSE 'Property Inspection' END,t.due_date,t.id,t.assigned_to,t.priority
      FROM tasks t LEFT JOIN tenants tenant ON t.entity_type='tenant' AND tenant.id=t.entity_id
      JOIN properties p ON p.id=CASE WHEN t.entity_type='tenant' THEN tenant.property_id ELSE t.entity_id END
      WHERE t.status IN ('pending','in_progress') AND t.due_date<=CURRENT_DATE AND p.archived_at IS NULL
        AND ((t.task_type='inventory_due' AND t.entity_type='tenant') OR (t.task_type='property_inspection' AND t.entity_type='property'))
      ORDER BY expiry_date
    `);
 const cleared=new Set((await query('SELECT alert_key FROM dashboard_alert_dismissals')).map(r=>r.alert_key));
 return rows.map(a=>({...a,alert_key:[a.id,a.type,String(a.expiry_date).slice(0,10),a.priority||''].join(':')})).filter(a=>!cleared.has(a.alert_key));
}
