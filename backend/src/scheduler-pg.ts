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

async function taskExists(taskType: string, entityId: number, entityType = 'property'): Promise<boolean> {
  const existing = await queryOne(
    `SELECT id FROM tasks WHERE task_type = $1 AND entity_type = $2 AND entity_id = $3 AND status IN ('pending', 'in_progress')`,
    [taskType, entityType, entityId]
  );
  return !!existing;
}

async function createTask(title: string, priority: string, dueDate: string, taskType: string, entityId: number, entityType = 'property'): Promise<void> {
  await run(
    `INSERT INTO tasks (title, priority, status, due_date, task_type, entity_type, entity_id) VALUES ($1, $2, 'pending', $3, $4, $5, $6)`,
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
      const targetStr = targetDate.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      // Compute the lower bound in JS instead of using SQLite date() function
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const lowerBoundStr = sevenDaysAgo.toISOString().split('T')[0];

      let sql = `
        SELECT id, address, ${check.field} as expiry_date
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
        if (await taskExists(check.taskType, prop.id)) continue;

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
    const targetStr = targetDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const properties = await query(
      `SELECT p.id, p.address, p.tenancy_end_date
       FROM properties p
       WHERE p.tenancy_end_date IS NOT NULL
       AND p.tenancy_end_date <= $1
       AND p.tenancy_end_date >= $2
       AND p.has_live_tenancy = 1`,
      [targetStr, todayStr]
    );

    for (const prop of properties) {
      if (await taskExists('tenancy_end', prop.id)) continue;

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
    `SELECT id, address, rent_review_date
     FROM properties
     WHERE rent_review_date IS NOT NULL
     AND rent_review_date <= $1
     AND rent_review_date >= $2`,
    [in30.toISOString().split('T')[0], today.toISOString().split('T')[0]]
  );

  for (const prop of properties) {
    if (await taskExists('rent_review', prop.id)) continue;

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
    if (await taskExists('nok_missing', t.id, 'tenant')) continue;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    await createTask(
      `Next of kin missing — ${t.name}`,
      'medium',
      dueDate.toISOString().split('T')[0],
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
