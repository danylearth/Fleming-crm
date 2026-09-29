import type { Express } from 'express';
import { authMiddleware, type AuthRequest } from './auth';
import { queryOne } from './db-pg';

const message = 'Select a property from the properties list before onboarding, booking a viewing or setting a follow-up.';
const stages = ['onboarding', 'viewing_booked', 'awaiting_response'];
const actions = ['/convert', '/credit-check', '/tenancy-agreement', '/request-balance', '/confirm-balance', '/schedule-handover', '/no-handover', '/application-review', '/confirm-holding-deposit', '/request-holding-deposit', '/send-application-email', '/holding-deposit/email-preview'];
async function validProperty(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && !!await queryOne('SELECT id FROM properties WHERE id=$1', [id]);
}
export function registerEnquiryPropertyGate(app: Express) {
  app.use('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res, next) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !/^\d+$/.test(String(req.params.id))) return next();
    const body = req.body || {};
    const workflow = actions.includes(req.path) || (req.path === '/send-workflow-email' && body.template !== 'rejection');
    const starting = req.path === '/' && (stages.includes(body.status) || body.viewing_date || body.follow_up_date || body.holding_deposit_requested || body.application_form_sent || body.onboarding_step);
    if (!workflow && !starting && !(req.path === '/' && 'linked_property_id' in body)) return next();
    const enquiry = await queryOne('SELECT linked_property_id,status FROM tenant_enquiries WHERE id=$1', [req.params.id]);
    if (!enquiry) return res.status(404).json({error:'Enquiry not found'});
    const property = req.path === '/' && 'linked_property_id' in body ? body.linked_property_id : enquiry.linked_property_id;
    if ((workflow || starting || stages.includes(enquiry.status) || property) && !await validProperty(property)) return res.status(400).json({error:message});
    next();
  });
  app.post('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res, next) => {
    if ((stages.includes(req.body.status) || req.body.viewing_date || req.body.follow_up_date) && !await validProperty(req.body.linked_property_id)) return res.status(400).json({error:message});
    next();
  });
  app.post('/api/tenant-enquiries/bulk-update', authMiddleware, async (req: AuthRequest, res, next) => {
    if (stages.includes(req.body.status) && Array.isArray(req.body.ids)) {
      for (const id of req.body.ids) {
        const row = await queryOne('SELECT linked_property_id FROM tenant_enquiries WHERE id=$1', [id]);
        if (!await validProperty(row?.linked_property_id)) return res.status(400).json({error:message});
      }
    }
    next();
  });
  app.post('/api/property-viewings', authMiddleware, async (req: AuthRequest, res, next) => {
    if (req.body.enquiry_id) {
      const row = await queryOne('SELECT linked_property_id FROM tenant_enquiries WHERE id=$1', [req.body.enquiry_id]);
      if (!row || !await validProperty(req.body.property_id || row.linked_property_id)) return res.status(400).json({error:message});
    }
    next();
  });
  app.post('/api/tasks', authMiddleware, async (req: AuthRequest, res, next) => {
    if (req.body.entity_type === 'tenant_enquiry' && ['follow_up', 'viewing'].includes(req.body.task_type)) {
      const row = await queryOne('SELECT linked_property_id FROM tenant_enquiries WHERE id=$1', [req.body.entity_id]);
      if (!await validProperty(row?.linked_property_id)) return res.status(400).json({error:message});
    }
    next();
  });
}
