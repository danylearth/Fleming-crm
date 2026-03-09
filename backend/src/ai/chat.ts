import { Router } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../auth';
import { sendEmail, viewingConfirmationEmail, referenceChaseEmail, rentReminderEmail, statusUpdateEmail, genericEmail } from '../email';

const router = Router();

interface ChatRequest {
  message: string;
  context?: {
    page?: string;
    entityType?: string;
    entityId?: number;
  };
}

interface ChatAction {
  id: string;
  label: string;
  type: 'confirm' | 'link' | 'dismiss';
  payload?: any;
}

interface ChatResponse {
  text: string;
  actions?: ChatAction[];
  data?: any;
}

function logAudit(userId: number | undefined, userEmail: string | undefined, action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    db.prepare(`INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes) VALUES (?, ?, ?, ?, ?, ?)`).run(
      userId || null, userEmail || null, action, entityType, entityId || null, changes ? JSON.stringify(changes) : null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ── Intent Matching ──

function matchIntent(message: string, context?: ChatRequest['context']): { intent: string; params: Record<string, string> } | null {
  const lower = message.toLowerCase();

  // Move enquiry status
  const moveMatch = lower.match(/(?:move|update|change|set)\s+(.+?)\s+(?:to|→)\s+(new|viewing|awaiting|onboarding|converted|rejected)/);
  if (moveMatch) return { intent: 'move-enquiry', params: { name: moveMatch[1].trim(), status: moveMatch[2] } };

  // Create task
  if (lower.includes('create') && lower.includes('task') || lower.includes('remind me') || lower.includes('add task') || lower.includes('todo')) {
    const titleMatch = message.match(/(?:task|todo|remind me)\s+(?:to\s+)?(.+?)(?:\s+by\s+|\s+on\s+|\s+due\s+|$)/i);
    const dateMatch = message.match(/(?:by|on|due)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{1,2}[\/\-]\d{1,2})/i);
    return { intent: 'create-task', params: { title: titleMatch?.[1]?.trim() || message, dateHint: dateMatch?.[1] || '' } };
  }

  // Email / contact someone
  if (lower.includes('email') || lower.includes('contact') || lower.includes('write to') || lower.includes('send') && lower.includes('to')) {
    const nameMatch = message.match(/(?:email|contact|write to|send.*to)\s+(.+?)(?:\s+about|\s+regarding|\s+re:|\s*$)/i);
    const aboutMatch = message.match(/(?:about|regarding|re:)\s+(.+)/i);
    return { intent: 'email-contact', params: { name: nameMatch?.[1]?.trim() || '', topic: aboutMatch?.[1]?.trim() || '' } };
  }

  // Chase references
  if (lower.includes('chase') && (lower.includes('ref') || lower.includes('landlord ref'))) {
    return { intent: 'chase-references', params: {} };
  }

  // Rent reminders
  if (lower.includes('rent') && (lower.includes('remind') || lower.includes('chase') || lower.includes('send'))) {
    return { intent: 'rent-reminders', params: {} };
  }

  // Complete task
  if ((lower.includes('complete') && lower.includes('task')) || (lower.includes('mark') && lower.includes('done'))) {
    return { intent: 'complete-task', params: {} };
  }

  // Void / vacant properties
  if (lower.includes('void') || (lower.includes('vacant') && lower.includes('propert'))) {
    return { intent: 'query-voids', params: {} };
  }

  // Tenancy expiry
  if (lower.includes('tenancy') && (lower.includes('end') || lower.includes('expir') || lower.includes('renew'))) {
    return { intent: 'query-tenancy-expiry', params: {} };
  }

  // Compliance
  if (lower.includes('compliance') || lower.includes('cert') || lower.includes('gas') || lower.includes('eicr') || lower.includes('epc')) {
    return { intent: 'query-compliance', params: {} };
  }

  // Financials
  if (lower.includes('financ') || lower.includes('money') || lower.includes('income') || lower.includes('arrear')) {
    return { intent: 'query-financials', params: {} };
  }

  // Prioritise
  if (lower.includes('prioriti') || lower.includes('focus') || lower.includes('today') || lower.includes('what should')) {
    return { intent: 'prioritise', params: {} };
  }

  return null;
}

function parseDueDate(hint: string): string | undefined {
  if (!hint) return undefined;
  const d = hint.toLowerCase();
  const now = new Date();
  if (d === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    return now.toISOString().split('T')[0];
  }
  if (d === 'today') return now.toISOString().split('T')[0];
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(d);
  if (targetDay >= 0) {
    const diff = (targetDay - now.getDay() + 7) % 7 || 7;
    now.setDate(now.getDate() + diff);
    return now.toISOString().split('T')[0];
  }
  return undefined;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Chat Endpoint ──

router.post('/chat', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { message, context } = req.body as ChatRequest;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const intent = matchIntent(message, context);

    if (!intent) {
      return res.json({
        text: `I can help with that. Here's what I can do:\n\n• **Email someone** — "email Eleanor about her viewing"\n• **Move enquiries** — "move Eleanor to viewing"\n• **Create tasks** — "remind me to call James by Friday"\n• **Chase references** — "chase all pending refs"\n• **Send rent reminders** — "send rent reminders"\n• **Query data** — "void properties", "compliance check", "financials"\n• **Prioritise** — "what should I focus on today?"\n\nWhat would you like to do?`,
      } as ChatResponse);
    }

    const response = await handleIntent(intent.intent, intent.params, req.user!, context);
    return res.json(response);
  } catch (err: any) {
    console.error('[AI Chat Error]', err);
    return res.status(500).json({ text: 'Something went wrong. Please try again.', error: err.message });
  }
});

// ── Execute Action Endpoint ──

router.post('/execute', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { actionId, payload } = req.body;
    if (!payload) return res.json({ text: 'Action completed.', status: 'done' });

    const { kind, ...params } = payload;
    let result: ChatResponse;

    switch (kind) {
      case 'update-enquiry-status': {
        db.prepare('UPDATE tenant_enquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(params.status, params.id);
        logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', params.id, { status: params.status, via: 'ai_assistant' });

        // Auto-create follow-up tasks based on new status
        const autoTasks = createStatusTasks(params.id, params.status, params.name);

        let taskMsg = '';
        if (autoTasks.length > 0) {
          taskMsg = `\n\nAuto-created ${autoTasks.length} task${autoTasks.length > 1 ? 's' : ''}:\n${autoTasks.map(t => `• ${t}`).join('\n')}`;
        }

        // Optionally send status update email
        const enquiry = db.prepare('SELECT * FROM tenant_enquiries WHERE id = ?').get(params.id) as any;
        if (enquiry?.email_1) {
          const propertyAddress = enquiry.linked_property_id
            ? (db.prepare('SELECT address FROM properties WHERE id = ?').get(enquiry.linked_property_id) as any)?.address || 'the property'
            : 'the property';
          const emailTemplate = statusUpdateEmail(enquiry.first_name_1, propertyAddress, params.status);
          await sendEmail({ to: enquiry.email_1, ...emailTemplate });
          logAudit(req.user?.id, req.user?.email, 'create', 'email', params.id, { to: enquiry.email_1, subject: emailTemplate.subject, via: 'ai_assistant' });
          taskMsg += `\n\nStatus update email sent to ${enquiry.email_1}.`;
        }

        result = { text: `Done — moved ${params.name} to "${params.statusLabel}".${taskMsg}` };
        break;
      }

      case 'create-task': {
        const stmt = db.prepare('INSERT INTO tasks (title, due_date, priority, status, task_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const r = stmt.run(params.task.title, params.task.due_date || null, params.task.priority || 'medium', 'pending', params.task.task_type || 'manual', params.task.entity_type || null, params.task.entity_id || null);
        logAudit(req.user?.id, req.user?.email, 'create', 'task', r.lastInsertRowid as number, { title: params.task.title, via: 'ai_assistant' });
        result = { text: `Task created: "${params.task.title}"${params.task.due_date ? ` — due ${formatDate(params.task.due_date)}` : ''}.` };
        break;
      }

      case 'complete-task': {
        db.prepare('UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', params.id);
        logAudit(req.user?.id, req.user?.email, 'update', 'task', params.id, { status: 'completed', via: 'ai_assistant' });
        result = { text: `Marked "${params.title}" as complete.` };
        break;
      }

      case 'send-email': {
        const emailResult = await sendEmail({ to: params.to, subject: params.subject, html: params.html });
        logAudit(req.user?.id, req.user?.email, 'create', 'email', undefined, { to: params.to, subject: params.subject, success: emailResult.success, via: 'ai_assistant' });
        if (emailResult.success) {
          result = { text: `Email sent to ${params.to}.${!process.env.RESEND_API_KEY ? '\n\n_(Simulated — no RESEND_API_KEY configured)_' : ''}` };
        } else {
          result = { text: `Failed to send email: ${emailResult.error}` };
        }
        break;
      }

      case 'bulk-chase-refs': {
        let sentCount = 0;
        for (const ref of (params.refs || [])) {
          const template = referenceChaseEmail(ref.landlordName || 'Sir/Madam', ref.tenantName, ref.propertyAddress || 'the property');
          // In reality we'd send to landlord reference email — for now send to enquiry email as demo
          await sendEmail({ to: ref.email, ...template });
          logAudit(req.user?.id, req.user?.email, 'create', 'email', ref.id, { to: ref.email, subject: template.subject, type: 'reference_chase', via: 'ai_assistant' });
          sentCount++;
        }
        result = { text: `Sent ${sentCount} reference chase email${sentCount > 1 ? 's' : ''}.${!process.env.RESEND_API_KEY ? '\n\n_(Simulated — no RESEND_API_KEY configured)_' : ''}` };
        break;
      }

      case 'bulk-rent-reminders': {
        let sentCount = 0;
        for (const r of (params.reminders || [])) {
          const template = rentReminderEmail(r.tenantName, r.amount, r.address, r.dueDate);
          await sendEmail({ to: r.email, ...template });
          logAudit(req.user?.id, req.user?.email, 'create', 'email', r.tenantId, { to: r.email, subject: template.subject, type: 'rent_reminder', via: 'ai_assistant' });
          sentCount++;
        }
        result = { text: `Sent rent reminders to ${sentCount} tenant${sentCount > 1 ? 's' : ''}.${!process.env.RESEND_API_KEY ? '\n\n_(Simulated — no RESEND_API_KEY configured)_' : ''}` };
        break;
      }

      default:
        result = { text: `Action "${kind}" completed.` };
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[AI Execute Error]', err);
    return res.status(500).json({ text: `Failed: ${err.message || 'Something went wrong'}` });
  }
});

// ── Intent Handlers ──

async function handleIntent(intent: string, params: Record<string, string>, user: { id: number; email: string; role: string; name: string }, context?: ChatRequest['context']): Promise<ChatResponse> {
  // Permission scoping: non-admin users can only query, not modify
  const writeIntents = ['move-enquiry', 'create-task', 'email-contact', 'chase-references', 'rent-reminder'];
  if (user.role !== 'admin' && writeIntents.includes(intent)) {
    return { text: 'You don\'t have permission to perform this action. Please contact an admin.' };
  }

  switch (intent) {
    case 'move-enquiry': {
      const statusMap: Record<string, string> = {
        new: 'new', viewing: 'viewing_booked', awaiting: 'awaiting_response',
        onboarding: 'onboarding', converted: 'converted', rejected: 'rejected',
      };
      const statusLabels: Record<string, string> = {
        new: 'New', viewing: 'Viewing Booked', awaiting: 'Awaiting Response',
        onboarding: 'Onboarding', converted: 'Converted', rejected: 'Rejected',
      };

      const enquiries = db.prepare('SELECT * FROM tenant_enquiries WHERE status != ?').all('converted') as any[];
      const match = enquiries.find((e: any) => {
        const fullName = `${e.first_name_1} ${e.last_name_1}`.toLowerCase();
        return fullName.includes(params.name) || e.last_name_1?.toLowerCase().includes(params.name) || e.first_name_1?.toLowerCase().includes(params.name);
      });

      if (match) {
        const name = `${match.first_name_1} ${match.last_name_1}`;
        const newStatus = statusMap[params.status];
        const label = statusLabels[params.status];
        return {
          text: `Move ${name} from "${match.status.replace(/_/g, ' ')}" to "${label}"?`,
          actions: [
            { id: 'confirm-move', label: `Yes, move to ${label}`, type: 'confirm', payload: { kind: 'update-enquiry-status', id: match.id, status: newStatus, statusLabel: label, name } },
            { id: 'cancel', label: 'Cancel', type: 'dismiss' },
          ],
        };
      }
      return { text: `Couldn't find an enquiry matching "${params.name}". Try using their full name.` };
    }

    case 'create-task': {
      const dueDate = parseDueDate(params.dateHint);
      const title = params.title.replace(/^(create task|add task|remind me to|todo)\s*/i, '').trim();
      if (!title) return { text: 'What should the task be? e.g. "remind me to call James by Friday"' };

      return {
        text: `Create this task?\n\n"${title}"${dueDate ? `\nDue: ${formatDate(dueDate)}` : ''}\nPriority: Medium`,
        actions: [
          { id: 'create-task', label: 'Create task', type: 'confirm', payload: { kind: 'create-task', task: { title, due_date: dueDate, priority: 'medium', task_type: 'manual' } } },
          { id: 'high-priority', label: 'Make it high priority', type: 'confirm', payload: { kind: 'create-task', task: { title, due_date: dueDate, priority: 'high', task_type: 'manual' } } },
          { id: 'cancel', label: 'Cancel', type: 'dismiss' },
        ],
      };
    }

    case 'email-contact': {
      // Search across enquiries, tenants, and landlords
      const nameQuery = params.name.toLowerCase();
      let contact: any = null;
      let contactType = '';

      // Search enquiries
      const enquiries = db.prepare('SELECT * FROM tenant_enquiries').all() as any[];
      contact = enquiries.find((e: any) => {
        const name = `${e.first_name_1} ${e.last_name_1}`.toLowerCase();
        return name.includes(nameQuery) || e.first_name_1?.toLowerCase().includes(nameQuery) || e.last_name_1?.toLowerCase().includes(nameQuery);
      });
      if (contact) contactType = 'enquiry';

      // Search tenants if not found
      if (!contact) {
        const tenants = db.prepare('SELECT t.*, p.address as property_address FROM tenants t LEFT JOIN properties p ON t.property_id = p.id').all() as any[];
        contact = tenants.find((t: any) => {
          const name = `${t.first_name_1} ${t.last_name_1}`.toLowerCase();
          return name.includes(nameQuery) || t.name?.toLowerCase().includes(nameQuery);
        });
        if (contact) contactType = 'tenant';
      }

      // Search landlords if not found
      if (!contact) {
        const landlords = db.prepare('SELECT * FROM landlords').all() as any[];
        contact = landlords.find((l: any) => l.name?.toLowerCase().includes(nameQuery));
        if (contact) contactType = 'landlord';
      }

      if (!contact) {
        return { text: `Couldn't find anyone matching "${params.name}". Try using their full name.` };
      }

      const email = contact.email_1 || contact.email;
      const firstName = contact.first_name_1 || contact.first_name || contact.name?.split(' ')[0] || params.name;
      const fullName = contact.first_name_1 ? `${contact.first_name_1} ${contact.last_name_1}` : contact.name || params.name;

      if (!email) {
        return { text: `Found ${fullName} but they don't have an email address on file. Add their email first.` };
      }

      // Get property address if available
      let propertyAddress = 'the property';
      if (contact.linked_property_id) {
        const prop = db.prepare('SELECT address FROM properties WHERE id = ?').get(contact.linked_property_id) as any;
        if (prop) propertyAddress = prop.address;
      } else if (contact.property_address) {
        propertyAddress = contact.property_address;
      } else if (contact.property_id) {
        const prop = db.prepare('SELECT address FROM properties WHERE id = ?').get(contact.property_id) as any;
        if (prop) propertyAddress = prop.address;
      }

      const topic = params.topic || `your application for ${propertyAddress}`;
      const template = genericEmail(firstName, topic);

      return {
        text: `Draft email to **${fullName}** (${email}):\n\n**Subject:** ${template.subject}\n\nHi ${firstName},\n\nThank you for your enquiry. We wanted to follow up regarding ${topic.toLowerCase()}.\n\nPlease don't hesitate to get in touch if you have any questions.\n\nBest regards,\nFleming Lettings\n\nLook good?`,
        actions: [
          { id: 'send-email', label: 'Send email', type: 'confirm', payload: { kind: 'send-email', to: email, subject: template.subject, html: template.html } },
          { id: 'cancel', label: 'Cancel', type: 'dismiss' },
        ],
      };
    }

    case 'chase-references': {
      const pendingRefs = db.prepare(`
        SELECT te.*, p.address as property_address
        FROM tenant_enquiries te
        LEFT JOIN properties p ON te.linked_property_id = p.id
        WHERE te.status IN ('awaiting_response', 'onboarding')
      `).all() as any[];

      if (pendingRefs.length === 0) {
        return { text: 'No applicants with pending references right now.' };
      }

      const refs = pendingRefs.map((e: any) => ({
        id: e.id,
        tenantName: `${e.first_name_1} ${e.last_name_1}`,
        email: e.email_1,
        propertyAddress: e.property_address || 'a property',
        landlordName: 'Sir/Madam',
      }));

      return {
        text: `Found ${pendingRefs.length} applicant${pendingRefs.length > 1 ? 's' : ''} with pending references:\n\n${refs.map(r => `• ${r.tenantName}${r.propertyAddress ? ` — ${r.propertyAddress}` : ''}`).join('\n')}\n\nI'll send a personalised chase email to each landlord with a 48-hour response deadline.`,
        actions: [
          { id: 'chase-all', label: `Send ${pendingRefs.length} chase emails`, type: 'confirm', payload: { kind: 'bulk-chase-refs', refs } },
          { id: 'cancel', label: 'Cancel', type: 'dismiss' },
        ],
      };
    }

    case 'rent-reminders': {
      const overdue = db.prepare(`
        SELECT rp.*, p.address, t.name as tenant_name, t.email as tenant_email, t.first_name_1, t.id as tenant_id
        FROM rent_payments rp
        JOIN properties p ON rp.property_id = p.id
        LEFT JOIN tenants t ON rp.tenant_id = t.id
        WHERE rp.status IN ('pending', 'partial') AND rp.due_date < date('now')
      `).all() as any[];

      if (overdue.length === 0) {
        return { text: 'No outstanding rent right now — all tenants are up to date.' };
      }

      const totalOutstanding = overdue.reduce((sum: number, r: any) => sum + ((r.amount_due || 0) - (r.amount_paid || 0)), 0);
      const reminders = overdue.filter((r: any) => r.tenant_email).map((r: any) => ({
        tenantName: r.tenant_name || r.first_name_1 || 'Tenant',
        tenantId: r.tenant_id,
        email: r.tenant_email,
        amount: (r.amount_due || 0) - (r.amount_paid || 0),
        address: r.address,
        dueDate: formatDate(r.due_date),
      }));

      return {
        text: `£${totalOutstanding.toLocaleString()} outstanding across ${overdue.length} payment${overdue.length > 1 ? 's' : ''}:\n\n${reminders.map(r => `• ${r.tenantName} — £${r.amount.toLocaleString()} (${r.address})`).join('\n')}\n\nSend a personalised reminder to each?`,
        actions: [
          { id: 'send-reminders', label: `Send ${reminders.length} rent reminders`, type: 'confirm', payload: { kind: 'bulk-rent-reminders', reminders } },
          { id: 'cancel', label: 'Cancel', type: 'dismiss' },
        ],
      };
    }

    case 'complete-task': {
      const activeTasks = db.prepare("SELECT * FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY due_date ASC LIMIT 10").all() as any[];
      if (activeTasks.length === 0) return { text: 'No active tasks to complete.' };

      return {
        text: `Which task?\n\n${activeTasks.map((t: any, i: number) => `${i + 1}. ${t.title}${t.due_date ? ` (due ${formatDate(t.due_date)})` : ''}`).join('\n')}\n\nTap one to mark it done.`,
        actions: activeTasks.slice(0, 4).map((t: any, i: number) => ({
          id: `complete-${t.id}`,
          label: `${i + 1}. ${t.title.substring(0, 30)}`,
          type: 'confirm' as const,
          payload: { kind: 'complete-task', id: t.id, title: t.title },
        })),
      };
    }

    case 'query-voids': {
      const voids = db.prepare(`
        SELECT p.*, l.name as landlord_name
        FROM properties p
        LEFT JOIN landlords l ON p.landlord_id = l.id
        WHERE p.status = 'available' OR p.has_live_tenancy = 0
      `).all() as any[];

      if (voids.length === 0) return { text: 'No void properties — full occupancy.' };

      return {
        text: `${voids.length} void propert${voids.length > 1 ? 'ies' : 'y'}:\n\n${voids.map((p: any) => `• ${p.address} — £${p.rent_amount || '?'}/mo${p.landlord_name ? ` (${p.landlord_name})` : ''}`).join('\n')}`,
        actions: [{ id: 'view', label: 'View properties', type: 'link' }],
      };
    }

    case 'query-tenancy-expiry': {
      const upcoming = db.prepare(`
        SELECT t.*, p.address as property_address
        FROM tenants t
        LEFT JOIN properties p ON t.property_id = p.id
        WHERE t.tenancy_end_date IS NOT NULL AND t.tenancy_end_date > date('now') AND t.tenancy_end_date < date('now', '+90 days')
        ORDER BY t.tenancy_end_date ASC
      `).all() as any[];

      if (upcoming.length === 0) return { text: 'No tenancies expiring in the next 90 days.' };

      return {
        text: `${upcoming.length} tenanc${upcoming.length > 1 ? 'ies' : 'y'} ending in the next 90 days:\n\n${upcoming.map((t: any) => `• ${t.first_name_1} ${t.last_name_1} — ${t.property_address || 'Unknown'} — ends ${formatDate(t.tenancy_end_date)}`).join('\n')}\n\nWant me to create renewal tasks for each?`,
      };
    }

    case 'query-compliance': {
      const now = new Date().toISOString().split('T')[0];
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      const expired = db.prepare(`
        SELECT address,
          CASE WHEN gas_safety_expiry_date < ? AND has_gas = 1 THEN 'Gas Safety' END as gas_exp,
          CASE WHEN eicr_expiry_date < ? THEN 'EICR' END as eicr_exp,
          CASE WHEN epc_expiry_date < ? THEN 'EPC' END as epc_exp
        FROM properties
        WHERE (gas_safety_expiry_date < ? AND has_gas = 1) OR eicr_expiry_date < ? OR epc_expiry_date < ?
      `).all(now, now, now, now, now, now) as any[];

      const expiring = db.prepare(`
        SELECT address,
          CASE WHEN gas_safety_expiry_date BETWEEN ? AND ? AND has_gas = 1 THEN 'Gas Safety' END as gas_exp,
          CASE WHEN eicr_expiry_date BETWEEN ? AND ? THEN 'EICR' END as eicr_exp,
          CASE WHEN epc_expiry_date BETWEEN ? AND ? THEN 'EPC' END as epc_exp
        FROM properties
        WHERE (gas_safety_expiry_date BETWEEN ? AND ? AND has_gas = 1) OR eicr_expiry_date BETWEEN ? AND ? OR epc_expiry_date BETWEEN ? AND ?
      `).all(now, in30, now, in30, now, in30, now, in30, now, in30, now, in30) as any[];

      const formatAlerts = (items: any[]) => items.map((a: any) => {
        const types = [a.gas_exp, a.eicr_exp, a.epc_exp].filter(Boolean).join(', ');
        return `  • ${a.address} — ${types}`;
      }).join('\n');

      let text = 'Compliance:\n\n';
      if (expired.length > 0) text += `**Expired (${expired.length}):**\n${formatAlerts(expired)}\n\n`;
      if (expiring.length > 0) text += `**Expiring within 30 days (${expiring.length}):**\n${formatAlerts(expiring)}\n\n`;
      if (expired.length === 0 && expiring.length === 0) text += 'All certificates current.\n\n';
      text += 'Want me to create renewal tasks for the expired ones?';

      return {
        text,
        actions: expired.length > 0 ? [
          { id: 'create-renewal-tasks', label: `Create ${expired.length} renewal tasks`, type: 'confirm', payload: { kind: 'create-task', task: { title: `Renew ${expired.length} expired certificates`, priority: 'high', task_type: 'manual' } } },
        ] : undefined,
      };
    }

    case 'query-financials': {
      const stats = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paid ELSE 0 END), 0) as collected,
          COALESCE(SUM(CASE WHEN status IN ('pending', 'partial') THEN amount_due - COALESCE(amount_paid, 0) ELSE 0 END), 0) as outstanding
        FROM rent_payments
        WHERE due_date >= date('now', 'start of month')
      `).get() as any;

      const propCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
      const letCount = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE has_live_tenancy = 1").get() as any).c;

      return {
        text: `Financial summary:\n\nCollected this month: £${(stats.collected || 0).toLocaleString()}\nOutstanding: £${(stats.outstanding || 0).toLocaleString()}\nProperties: ${propCount} (${letCount} let, ${propCount - letCount} void)\nOccupancy: ${propCount > 0 ? Math.round((letCount / propCount) * 100) : 0}%${stats.outstanding > 0 ? '\n\nWant me to send rent reminders to overdue tenants?' : '\n\nNo arrears — looking good.'}`,
      };
    }

    case 'prioritise': {
      const items: string[] = [];

      // Expired certs
      const now = new Date().toISOString().split('T')[0];
      const expiredCount = (db.prepare(`
        SELECT COUNT(*) as c FROM properties
        WHERE (gas_safety_expiry_date < ? AND has_gas = 1) OR eicr_expiry_date < ? OR epc_expiry_date < ?
      `).get(now, now, now) as any).c;
      if (expiredCount > 0) items.push(`Renew ${expiredCount} expired certificate${expiredCount > 1 ? 's' : ''} (legal requirement)`);

      // New enquiries
      const newEnq = (db.prepare("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'new'").get() as any).c;
      if (newEnq > 0) items.push(`Contact ${newEnq} new enquir${newEnq > 1 ? 'ies' : 'y'} (speed wins)`);

      // Outstanding rent
      const outstanding = (db.prepare(`
        SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) as total
        FROM rent_payments WHERE status IN ('pending', 'partial') AND due_date < date('now')
      `).get() as any).total;
      if (outstanding > 0) items.push(`Chase £${outstanding.toLocaleString()} outstanding rent`);

      // Overdue tasks
      const overdueTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date < date('now')").get() as any).c;
      if (overdueTasks > 0) items.push(`Clear ${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`);

      // Open maintenance
      const openMaint = (db.prepare("SELECT COUNT(*) as c FROM maintenance WHERE status IN ('open', 'in_progress')").get() as any).c;
      if (openMaint > 0) items.push(`Review ${openMaint} maintenance request${openMaint > 1 ? 's' : ''}`);

      return {
        text: items.length > 0
          ? `Here's what I'd focus on today:\n\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nWhat would you like to tackle first?`
          : 'Nothing urgent today — portfolio is in good shape. Use this time for BDM outreach or property inspections.',
      };
    }

    default:
      return { text: 'I didn\'t understand that. Try something like "email Eleanor about her viewing" or "what should I focus on today?"' };
  }
}

// ── Auto-create tasks when enquiry status changes ──

function createStatusTasks(enquiryId: number, newStatus: string, name: string): string[] {
  const created: string[] = [];
  const now = new Date();

  const tasks: Array<{ title: string; priority: string; daysOut: number; taskType: string }> = [];

  switch (newStatus) {
    case 'viewing_booked':
      tasks.push({ title: `Confirm viewing with ${name}`, priority: 'medium', daysOut: 1, taskType: 'follow_up' });
      break;
    case 'awaiting_response':
      tasks.push({ title: `Follow up with ${name}`, priority: 'medium', daysOut: 3, taskType: 'follow_up' });
      break;
    case 'onboarding':
      tasks.push({ title: `Prepare tenancy agreement for ${name}`, priority: 'high', daysOut: 3, taskType: 'manual' });
      tasks.push({ title: `Run right-to-rent check for ${name}`, priority: 'high', daysOut: 2, taskType: 'manual' });
      tasks.push({ title: `Register deposit for ${name}`, priority: 'high', daysOut: 5, taskType: 'manual' });
      break;
  }

  for (const task of tasks) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + task.daysOut);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    db.prepare('INSERT INTO tasks (title, priority, status, due_date, task_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      task.title, task.priority, 'pending', dueDateStr, task.taskType, 'enquiry', enquiryId
    );
    created.push(task.title);
  }

  return created;
}

// ── Settings Endpoints ──

router.get('/config', authMiddleware, (req: AuthRequest, res) => {
  try {
    const configs = db.prepare('SELECT key, value FROM ai_config').all() as any[];
    const config: Record<string, string> = {};
    for (const c of configs) {
      // Mask API keys for frontend display
      if (c.key.includes('api_key') || c.key.includes('API_KEY')) {
        config[c.key] = c.value ? `****${c.value.slice(-4)}` : '';
      } else {
        config[c.key] = c.value;
      }
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

router.put('/config', authMiddleware, (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const updates = req.body as Record<string, string>;
    const stmt = db.prepare('INSERT OR REPLACE INTO ai_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');

    for (const [key, value] of Object.entries(updates)) {
      // Don't save masked values
      if (value && !value.startsWith('****')) {
        stmt.run(key, value);
      }
    }

    logAudit(req.user?.id, req.user?.email, 'update', 'ai_config', undefined, { keys: Object.keys(updates) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

export default router;
