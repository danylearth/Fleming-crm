import { query, queryOne, run, insert } from './db-pg';

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

interface ComplianceCheck {
  field: string;
  taskType: string;
  label: string;
  requiresGas?: boolean;
}

const COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { field: 'gas_safety_expiry_date', taskType: 'gas_reminder', label: 'Gas Safety certificate', requiresGas: true },
  { field: 'eicr_expiry_date', taskType: 'eicr_reminder', label: 'EICR certificate' },
  { field: 'epc_expiry_date', taskType: 'epc_reminder', label: 'EPC certificate' },
];

const REMINDER_WINDOWS = [30, 14, 7]; // Days before expiry to create reminders

// The server runs in UTC — toISOString() would shift the day boundary during BST.
// All business dates are UK dates.
const ymdLondon = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

async function logAudit(action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    await run(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [null, 'system@scheduler', 'create', entityType, entityId || null, changes ? JSON.stringify(changes) : null]
    );
  } catch (err) {
    console.error('[Scheduler] Audit log error:', err);
  }
}

// A reminder cycle is keyed by its due_date (the cert expiry / tenancy end / review
// date). A completed task for the same cycle must NOT be recreated — but when the
// certificate is renewed the date moves, which legitimately starts a new cycle.
async function taskExists(taskType: string, entityId: number, entityType = 'property', cycleDueDate?: string): Promise<boolean> {
  const existing = await queryOne(
    `SELECT id FROM tasks WHERE task_type = $1 AND entity_type = $2 AND entity_id = $3
     AND (status IN ('pending', 'in_progress') OR ($4::date IS NOT NULL AND due_date = $4::date))`,
    [taskType, entityType, entityId, cycleDueDate ?? null]
  );
  return !!existing;
}

async function createTask(title: string, priority: string, dueDate: string, taskType: string, entityId: number, entityType = 'property'): Promise<void> {
  // ON CONFLICT pairs with the partial unique index idx_tasks_scheduler_dedupe —
  // makes duplicate creation impossible even across concurrent instances
  await run(
    `INSERT INTO tasks (title, priority, status, due_date, task_type, entity_type, entity_id) VALUES ($1, $2, 'pending', $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [title, priority, dueDate, taskType, entityType, entityId]
  );
}

async function runComplianceChecks(): Promise<number> {
  let tasksCreated = 0;
  const today = new Date();

  for (const check of COMPLIANCE_CHECKS) {
    for (const daysOut of REMINDER_WINDOWS) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysOut);
      const targetStr = ymdLondon(targetDate);

      // Compute the lower bound in JS instead of using SQLite date() function
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const lowerBoundStr = ymdLondon(sevenDaysAgo);

      let sql = `
        SELECT id, address, ${check.field}::text as expiry_date
        FROM properties
        WHERE ${check.field} IS NOT NULL
        AND ${check.field} <= $1
        AND ${check.field} >= $2
      `;
      const params: any[] = [targetStr, lowerBoundStr];

      if (check.requiresGas) {
        sql += ' AND has_gas = 1';
      }

      const properties = await query(sql, params);

      for (const prop of properties) {
        if (await taskExists(check.taskType, prop.id, 'property', prop.expiry_date)) continue;

        const daysUntil = Math.ceil((new Date(prop.expiry_date).getTime() - today.getTime()) / 86400000);
        const priority = daysUntil <= 7 ? 'high' : daysUntil <= 14 ? 'medium' : 'low';
        const urgency = daysUntil <= 0 ? 'EXPIRED' : `expires in ${daysUntil} days`;

        await createTask(
          `${check.label} renewal — ${prop.address} (${urgency})`,
          priority,
          prop.expiry_date,
          check.taskType,
          prop.id
        );

        await logAudit('create', 'task', prop.id, {
          type: check.taskType,
          property: prop.address,
          expiry: prop.expiry_date,
          via: 'scheduler',
        });

        tasksCreated++;
      }
    }
  }

  return tasksCreated;
}

async function runTenancyEndChecks(): Promise<number> {
  let tasksCreated = 0;
  const today = new Date();

  for (const daysOut of [60, 30]) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysOut);
    const targetStr = ymdLondon(targetDate);
    const todayStr = ymdLondon(today);

    const properties = await query(
      `SELECT p.id, p.address, p.tenancy_end_date::text
       FROM properties p
       WHERE p.tenancy_end_date IS NOT NULL
       AND p.tenancy_end_date <= $1
       AND p.tenancy_end_date >= $2
       AND p.has_live_tenancy = 1`,
      [targetStr, todayStr]
    );

    for (const prop of properties) {
      if (await taskExists('tenancy_end', prop.id, 'property', prop.tenancy_end_date)) continue;

      const daysUntil = Math.ceil((new Date(prop.tenancy_end_date).getTime() - today.getTime()) / 86400000);

      await createTask(
        `Tenancy ending — ${prop.address} (${daysUntil} days)`,
        daysUntil <= 30 ? 'high' : 'medium',
        prop.tenancy_end_date,
        'tenancy_end',
        prop.id
      );

      await logAudit('create', 'task', prop.id, {
        type: 'tenancy_end',
        property: prop.address,
        end_date: prop.tenancy_end_date,
        via: 'scheduler',
      });

      tasksCreated++;
    }
  }

  return tasksCreated;
}

async function runRentReviewChecks(): Promise<number> {
  let tasksCreated = 0;
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const properties = await query(
    `SELECT id, address, rent_review_date::text
     FROM properties
     WHERE rent_review_date IS NOT NULL
     AND rent_review_date <= $1
     AND rent_review_date >= $2`,
    [ymdLondon(in30), ymdLondon(today)]
  );

  for (const prop of properties) {
    if (await taskExists('rent_review', prop.id, 'property', prop.rent_review_date)) continue;

    await createTask(
      `Rent review due — ${prop.address}`,
      'medium',
      prop.rent_review_date,
      'rent_review',
      prop.id
    );

    await logAudit('create', 'task', prop.id, {
      type: 'rent_review',
      property: prop.address,
      review_date: prop.rent_review_date,
      via: 'scheduler',
    });

    tasksCreated++;
  }

  return tasksCreated;
}

async function runNokChecks(): Promise<number> {
  let tasksCreated = 0;
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const tenants = await query(
    `SELECT id, name
     FROM tenants
     WHERE created_at <= $1
     AND (nok_name IS NULL OR nok_name = '')
     AND (nok_phone IS NULL OR nok_phone = '')`,
    [thirtyDaysAgo.toISOString()]
  );

  for (const t of tenants) {
    // Any-status check: due_date shifts daily so it can't key the cycle, and a task
    // completed without filling NOK in shouldn't be recreated every hour
    const everReminded = await queryOne(
      `SELECT id FROM tasks WHERE task_type = 'nok_missing' AND entity_type = 'tenant' AND entity_id = $1`,
      [t.id]
    );
    if (everReminded) continue;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    await createTask(
      `Next of kin missing — ${t.name}`,
      'medium',
      ymdLondon(dueDate),
      'nok_missing',
      t.id,
      'tenant'
    );

    await logAudit('create', 'task', t.id, {
      type: 'nok_missing',
      tenant: t.name,
      via: 'scheduler',
    });

    tasksCreated++;
  }

  return tasksCreated;
}

async function runAllChecks() {
  const complianceTasks = await runComplianceChecks();
  const tenancyTasks = await runTenancyEndChecks();
  const rentReviewTasks = await runRentReviewChecks();
  const nokTasks = await runNokChecks();
  const total = complianceTasks + tenancyTasks + rentReviewTasks + nokTasks;

  if (total > 0) {
    console.log(`[Scheduler] Created ${total} tasks (compliance: ${complianceTasks}, tenancy: ${tenancyTasks}, rent review: ${rentReviewTasks}, nok: ${nokTasks})`);
  }
}

export function startScheduler() {
  // Run immediately on startup
  console.log('[Scheduler] Running initial compliance checks...');
  runAllChecks().catch(err => {
    console.error('[Scheduler] Initial run error:', err);
  });

  // Then run on interval
  setInterval(() => {
    runAllChecks().catch(err => {
      console.error('[Scheduler] Error:', err);
    });
  }, CHECK_INTERVAL);

  console.log(`[Scheduler] Started — checking every ${CHECK_INTERVAL / 60000} minutes`);
}
