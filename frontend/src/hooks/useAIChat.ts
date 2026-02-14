import { useState, useCallback } from 'react';
import { useApi } from './useApi';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  actions?: AIAction[];
  data?: any;
  status?: 'pending' | 'done' | 'error';
}

export interface AIAction {
  id: string;
  label: string;
  type: 'confirm' | 'link' | 'dismiss';
  href?: string;
  payload?: any;
  done?: boolean;
}

interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export function useAIChat() {
  const api = useApi();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [typing, setTyping] = useState(false);

  const addMessage = (msg: AIMessage) => setMessages(prev => [...prev, msg]);
  const updateLastAssistant = (update: Partial<AIMessage>) => {
    setMessages(prev => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], ...update };
          break;
        }
      }
      return copy;
    });
  };

  const executeAction = useCallback(async (actionId: string, action: AIAction) => {
    if (action.type === 'link') return; // handled by Link component

    if (!action.payload) {
      addMessage({ role: 'system', text: `✓ ${action.label}`, status: 'done' });
      return;
    }

    const { kind, ...params } = action.payload;

    try {
      if (kind === 'update-enquiry-status') {
        await api.put(`/api/tenant-enquiries/${params.id}`, { status: params.status });
        addMessage({ role: 'assistant', text: `Done — moved ${params.name} to "${params.statusLabel}". ${params.follow_up || ''}`, status: 'done' });
      }
      else if (kind === 'create-task') {
        await api.post('/api/tasks', params.task);
        addMessage({ role: 'assistant', text: `Task created: "${params.task.title}"${params.task.due_date ? ` — due ${new Date(params.task.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}. I'll remind you.`, status: 'done' });
      }
      else if (kind === 'complete-task') {
        await api.put(`/api/tasks/${params.id}`, { status: 'completed' });
        addMessage({ role: 'assistant', text: `Marked "${params.title}" as complete. ✓`, status: 'done' });
      }
      else if (kind === 'send-email') {
        // Simulated — no SMTP yet
        addMessage({ role: 'assistant', text: `Email sent to ${params.draft.to}:\n\n**${params.draft.subject}**\n\n${params.draft.body}\n\n_(Simulated — SMTP not configured yet)_`, status: 'done' });
      }
      else if (kind === 'bulk-chase-refs') {
        addMessage({ role: 'assistant', text: `Sent reference chase emails to ${params.count} pending landlord references. Each got a personalised reminder with the applicant details and a 48-hour deadline.\n\n_(Simulated — SMTP not configured)_`, status: 'done' });
      }
      else if (kind === 'bulk-rent-reminders') {
        addMessage({ role: 'assistant', text: `Sent rent reminder to ${params.count} overdue tenant${params.count > 1 ? 's' : ''}. Each email includes their outstanding amount and payment details.\n\n_(Simulated — SMTP not configured)_`, status: 'done' });
      }
      else {
        addMessage({ role: 'assistant', text: `Action "${action.label}" completed.`, status: 'done' });
      }
    } catch (err: any) {
      addMessage({ role: 'assistant', text: `Failed: ${err.message || 'Something went wrong'}. Try again?`, status: 'error' });
    }
  }, [api]);

  const send = useCallback(async (text: string) => {
    addMessage({ role: 'user', text });
    setTyping(true);

    // Fetch context data
    let enquiries: any[] = [];
    let tasks: any[] = [];
    let properties: any[] = [];
    let tenants: any[] = [];
    let stats: any = {};

    try {
      [enquiries, tasks, properties, tenants, stats] = await Promise.all([
        api.get('/api/tenant-enquiries').catch(() => []),
        api.get('/api/tasks').catch(() => []),
        api.get('/api/properties').catch(() => []),
        api.get('/api/tenants').catch(() => []),
        api.get('/api/dashboard').catch(() => ({})),
      ]);
    } catch {}

    const lower = text.toLowerCase();

    // Small delay for natural feel
    await new Promise(r => setTimeout(r, 600));

    // ── Intent: Move enquiry status ──
    const moveMatch = lower.match(/(?:move|update|change|set)\s+(.+?)\s+(?:to|→)\s+(new|viewing|awaiting|onboarding|converted|rejected)/);
    if (moveMatch) {
      const nameQuery = moveMatch[1].trim();
      const statusMap: Record<string, string> = {
        'new': 'new', 'viewing': 'viewing_booked', 'awaiting': 'awaiting_response',
        'onboarding': 'onboarding', 'converted': 'converted', 'rejected': 'rejected'
      };
      const statusLabels: Record<string, string> = {
        'new': 'New', 'viewing': 'Viewing Booked', 'awaiting': 'Awaiting Response',
        'onboarding': 'Onboarding', 'converted': 'Converted', 'rejected': 'Rejected'
      };
      const newStatus = statusMap[moveMatch[2]];
      const label = statusLabels[moveMatch[2]];
      const match = enquiries.find((e: any) =>
        `${e.first_name_1} ${e.last_name_1}`.toLowerCase().includes(nameQuery) ||
        e.last_name_1?.toLowerCase().includes(nameQuery) ||
        e.first_name_1?.toLowerCase().includes(nameQuery)
      );

      if (match) {
        const name = `${match.first_name_1} ${match.last_name_1}`;
        setTyping(false);
        addMessage({
          role: 'assistant',
          text: `Move ${name} from "${match.status.replace('_', ' ')}" to "${label}"?`,
          actions: [
            { id: 'confirm-move', label: `Yes, move to ${label}`, type: 'confirm', payload: { kind: 'update-enquiry-status', id: match.id, status: newStatus, statusLabel: label, name } },
            { id: 'cancel', label: 'Cancel', type: 'dismiss' },
          ]
        });
        return;
      } else {
        setTyping(false);
        addMessage({ role: 'assistant', text: `Couldn't find an enquiry matching "${nameQuery}". Current enquiries:\n\n${enquiries.slice(0, 5).map((e: any) => `• ${e.first_name_1} ${e.last_name_1} — ${e.status.replace('_', ' ')}`).join('\n')}` });
        return;
      }
    }

    // ── Intent: Create task ──
    if (lower.includes('create') && lower.includes('task') || lower.includes('remind me') || lower.includes('add task') || lower.includes('todo')) {
      const titleMatch = text.match(/(?:task|todo|remind me)\s+(?:to\s+)?(.+?)(?:\s+by\s+|\s+on\s+|\s+due\s+|$)/i);
      const dateMatch = text.match(/(?:by|on|due)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{1,2}[\/\-]\d{1,2})/i);

      let dueDate: string | undefined;
      if (dateMatch) {
        const d = dateMatch[1].toLowerCase();
        const now = new Date();
        if (d === 'tomorrow') {
          now.setDate(now.getDate() + 1);
          dueDate = now.toISOString().split('T')[0];
        } else if (d === 'today') {
          dueDate = now.toISOString().split('T')[0];
        } else {
          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDay = days.indexOf(d);
          if (targetDay >= 0) {
            const diff = (targetDay - now.getDay() + 7) % 7 || 7;
            now.setDate(now.getDate() + diff);
            dueDate = now.toISOString().split('T')[0];
          }
        }
      }

      const title = titleMatch?.[1]?.trim() || text.replace(/^(create task|add task|remind me to|todo)\s*/i, '').trim();

      if (title) {
        setTyping(false);
        addMessage({
          role: 'assistant',
          text: `Create this task?\n\n"${title}"${dueDate ? `\nDue: ${new Date(dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}\nPriority: Medium`,
          actions: [
            { id: 'create-task', label: 'Create task', type: 'confirm', payload: { kind: 'create-task', task: { title, due_date: dueDate, priority: 'medium', status: 'active', task_type: 'manual' } } },
            { id: 'high-priority', label: 'Make it high priority', type: 'confirm', payload: { kind: 'create-task', task: { title, due_date: dueDate, priority: 'high', status: 'active', task_type: 'manual' } } },
            { id: 'cancel', label: 'Cancel', type: 'dismiss' },
          ]
        });
        return;
      }
    }

    // ── Intent: Chase references ──
    if (lower.includes('chase') && (lower.includes('ref') || lower.includes('landlord ref'))) {
      const pendingRefs = enquiries.filter((e: any) => e.status === 'awaiting_response' || e.status === 'onboarding');
      if (pendingRefs.length > 0) {
        setTyping(false);
        addMessage({
          role: 'assistant',
          text: `Found ${pendingRefs.length} applicant${pendingRefs.length > 1 ? 's' : ''} with pending references:\n\n${pendingRefs.map((e: any) => `• ${e.first_name_1} ${e.last_name_1}${e.property_address ? ` — ${e.property_address}` : ''}`).join('\n')}\n\nI'll send a personalised chase email to each landlord with a 48-hour response deadline.`,
          actions: [
            { id: 'chase-all', label: `Send ${pendingRefs.length} chase emails`, type: 'confirm', payload: { kind: 'bulk-chase-refs', count: pendingRefs.length } },
            { id: 'cancel', label: 'Cancel', type: 'dismiss' },
          ]
        });
        return;
      }
    }

    // ── Intent: Send rent reminders ──
    if (lower.includes('rent') && (lower.includes('remind') || lower.includes('chase') || lower.includes('send'))) {
      setTyping(false);
      const outstanding = stats.outstandingRent || 0;
      if (outstanding > 0) {
        addMessage({
          role: 'assistant',
          text: `£${outstanding.toLocaleString()} outstanding across your portfolio. I'll send a personalised reminder to each overdue tenant with their specific amount and payment details.`,
          actions: [
            { id: 'send-reminders', label: 'Send rent reminders', type: 'confirm', payload: { kind: 'bulk-rent-reminders', count: 2 } },
            { id: 'cancel', label: 'Cancel', type: 'dismiss' },
          ]
        });
      } else {
        addMessage({ role: 'assistant', text: 'No outstanding rent right now — all tenants are up to date. ✓' });
      }
      return;
    }

    // ── Intent: Draft email ──
    if (lower.includes('email') || lower.includes('write to') || lower.includes('draft')) {
      const nameMatch = lower.match(/(?:email|write to|draft.*to)\s+(.+?)(?:\s+about|\s+regarding|\s+re:|\s*$)/);
      if (nameMatch) {
        const nameQuery = nameMatch[1].trim();
        const match = [...enquiries, ...tenants].find((e: any) => {
          const name = `${e.first_name_1 || e.first_name || ''} ${e.last_name_1 || e.last_name || ''}`.toLowerCase();
          return name.includes(nameQuery);
        });

        if (match) {
          const name = match.first_name_1 || match.first_name;
          const fullName = `${name} ${match.last_name_1 || match.last_name}`;
          const email = match.email_1 || match.email || 'no email on file';
          const draft: EmailDraft = {
            to: email,
            subject: `Your application for ${match.property_address || 'the property'}`,
            body: `Hi ${name},\n\nThank you for your application. I wanted to follow up and check if you have any questions about the property or the next steps in the process.\n\nPlease don't hesitate to get in touch if you need anything.\n\nBest regards,\nFleming Lettings`
          };

          setTyping(false);
          addMessage({
            role: 'assistant',
            text: `Draft email to ${fullName} (${email}):\n\n**Subject:** ${draft.subject}\n\n${draft.body}\n\nLook good?`,
            actions: [
              { id: 'send-email', label: 'Send email', type: 'confirm', payload: { kind: 'send-email', draft } },
              { id: 'cancel', label: 'Edit first', type: 'dismiss' },
            ]
          });
          return;
        }
      }
    }

    // ── Intent: Complete task ──
    if (lower.includes('complete') && lower.includes('task') || lower.includes('mark') && lower.includes('done')) {
      const activeTasks = tasks.filter((t: any) => t.status === 'active');
      if (activeTasks.length > 0) {
        setTyping(false);
        addMessage({
          role: 'assistant',
          text: `Which task?\n\n${activeTasks.slice(0, 6).map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n')}\n\nSay the number or task name.`,
        });
        return;
      }
    }

    // ── Intent: Query — void properties ──
    if (lower.includes('void') || (lower.includes('vacant') && lower.includes('propert'))) {
      const voids = properties.filter((p: any) => p.status === 'vacant' || p.status === 'available');
      setTyping(false);
      if (voids.length > 0) {
        addMessage({
          role: 'assistant',
          text: `${voids.length} void properties:\n\n${voids.map((p: any) => `• ${p.address} — £${p.rent_amount || '?'}/mo${p.landlord_name ? ` (${p.landlord_name})` : ''}`).join('\n')}\n\nWant me to review pricing against market rates or create a letting task for each?`,
          actions: [
            { id: 'view', label: 'View properties', type: 'link', href: '/v2/properties' },
          ]
        });
      } else {
        addMessage({ role: 'assistant', text: 'No void properties — full occupancy. ✓' });
      }
      return;
    }

    // ── Intent: Query — tenancy expiry ──
    if (lower.includes('tenancy') && (lower.includes('end') || lower.includes('expir') || lower.includes('renew'))) {
      const upcoming = tenants.filter((t: any) => {
        if (!t.tenancy_end) return false;
        const end = new Date(t.tenancy_end);
        const diff = (end.getTime() - Date.now()) / 86400000;
        return diff > 0 && diff < 90;
      });
      setTyping(false);
      addMessage({
        role: 'assistant',
        text: upcoming.length > 0
          ? `${upcoming.length} tenancies ending in the next 90 days:\n\n${upcoming.map((t: any) => `• ${t.first_name} ${t.last_name} — ${t.property_address || 'Unknown'} — ends ${new Date(t.tenancy_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`).join('\n')}\n\nWant me to create renewal tasks for each?`
          : 'No tenancies expiring in the next 90 days.'
      });
      return;
    }

    // ── Intent: Query — compliance ──
    if (lower.includes('compliance') || lower.includes('cert') || lower.includes('gas') || lower.includes('eicr') || lower.includes('epc')) {
      const alerts = stats.complianceAlerts || [];
      const expired = alerts.filter((a: any) => a.status === 'expired');
      const expiring = alerts.filter((a: any) => a.status === 'expiring');
      setTyping(false);
      addMessage({
        role: 'assistant',
        text: `Compliance:\n\n${expired.length > 0 ? `🔴 ${expired.length} expired:\n${expired.map((a: any) => `  • ${a.address} — ${a.type}`).join('\n')}\n\n` : ''}${expiring.length > 0 ? `🟡 ${expiring.length} expiring soon:\n${expiring.map((a: any) => `  • ${a.address} — ${a.type}`).join('\n')}\n\n` : ''}${expired.length === 0 && expiring.length === 0 ? '✓ All certificates current.\n\n' : ''}Want me to book engineers for the expired ones?`,
        actions: expired.length > 0 ? [
          { id: 'book', label: `Create ${expired.length} renewal tasks`, type: 'confirm', payload: { kind: 'create-task', task: { title: `Renew ${expired.length} expired certificates`, priority: 'high', status: 'active', task_type: 'manual' } } },
        ] : undefined,
      });
      return;
    }

    // ── Intent: Query — financials ──
    if (lower.includes('financ') || lower.includes('money') || lower.includes('income') || lower.includes('arrear')) {
      setTyping(false);
      addMessage({
        role: 'assistant',
        text: `Financial summary:\n\nRent roll: £${(stats.monthlyIncome || 0).toLocaleString()}/month\nOutstanding: £${(stats.outstandingRent || 0).toLocaleString()}\nProperties: ${stats.properties} (${stats.propertiesLet} let, ${stats.properties - stats.propertiesLet} void)\nOccupancy: ${stats.properties > 0 ? Math.round((stats.propertiesLet / stats.properties) * 100) : 0}%\n\n${stats.outstandingRent > 0 ? 'Want me to send rent reminders to overdue tenants?' : 'No arrears — looking good.'}`
      });
      return;
    }

    // ── Intent: Prioritise ──
    if (lower.includes('prioriti') || lower.includes('focus') || lower.includes('today') || lower.includes('what should')) {
      const items: string[] = [];
      const expired = (stats.complianceAlerts || []).filter((a: any) => a.status === 'expired');
      if (expired.length > 0) items.push(`Renew ${expired.length} expired certificate${expired.length > 1 ? 's' : ''} (legal requirement)`);
      if (stats.enquiriesNew > 0) items.push(`Contact ${stats.enquiriesNew} new enquir${stats.enquiriesNew > 1 ? 'ies' : 'y'} (speed wins)`);
      if (stats.outstandingRent > 0) items.push(`Chase £${stats.outstandingRent.toLocaleString()} outstanding rent`);
      if (stats.tasksOverdue > 0) items.push(`Clear ${stats.tasksOverdue} overdue task${stats.tasksOverdue > 1 ? 's' : ''}`);
      if (stats.openMaintenance > 0) items.push(`Review ${stats.openMaintenance} maintenance request${stats.openMaintenance > 1 ? 's' : ''}`);

      setTyping(false);
      addMessage({
        role: 'assistant',
        text: items.length > 0
          ? `Here's what I'd focus on today:\n\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nSay "do #1" and I'll start on it.`
          : 'Nothing urgent today — portfolio is in good shape. Use this time for BDM outreach or property inspections.'
      });
      return;
    }

    // ── Intent: "Do #X" from priority list ──
    if (lower.match(/^do\s*#?\s*(\d)/)) {
      const num = parseInt(lower.match(/^do\s*#?\s*(\d)/)![1]);
      setTyping(false);
      if (num === 1) {
        addMessage({ role: 'assistant', text: 'On it. Let me check the most urgent items...', });
        // Re-trigger compliance or top priority
        setTimeout(() => send('compliance check'), 300);
      } else {
        addMessage({ role: 'assistant', text: `Working on item #${num}. What specifically would you like me to do?` });
      }
      return;
    }

    // ── Fallback ──
    setTyping(false);
    addMessage({
      role: 'assistant',
      text: `I can help with that. Here's what I can do:\n\n• **Move enquiries** — "move Eleanor to viewing"\n• **Create tasks** — "remind me to call James by Friday"\n• **Chase references** — "chase all pending refs"\n• **Send rent reminders** — "send rent reminders"\n• **Draft emails** — "email Eleanor about her application"\n• **Query data** — "void properties", "compliance check", "financials"\n• **Prioritise** — "what should I focus on today?"\n\nWhat would you like to do?`
    });
  }, [api]);

  return { messages, typing, send, executeAction, addMessage, setMessages };
}
