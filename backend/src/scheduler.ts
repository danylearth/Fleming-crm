import db from './db';

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

function logAudit(action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    db.prepare(`INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes) VALUES (?, ?, ?, ?, ?, ?)`).run(
      null, 'system@scheduler', 'create', entityType, entityId || null, changes ? JSON.stringify(changes) : null
    );
  } catch (err) {
    console.error('[Scheduler] Audit log error:', err);
  }
}

function taskExists(taskType: string, entityId: number): boolean {
  const existing = db.prepare(`
    SELECT id FROM tasks
    WHERE task_type = ? AND entity_type = 'property' AND entity_id = ? AND status IN ('pending', 'in_progress')
  `).get(taskType, entityId) as any;
  return !!existing;
}

function createTask(title: string, priority: string, dueDate: string, taskType: string, entityId: number): void {
  db.prepare(`
    INSERT INTO tasks (title, priority, status, due_date, task_type, entity_type, entity_id)
    VALUES (?, ?, 'pending', ?, ?, 'property', ?)
  `).run(title, priority, dueDate, taskType, entityId);
}

function runComplianceChecks(): number {
  let tasksCreated = 0;
  const today = new Date();

  for (const check of COMPLIANCE_CHECKS) {
    for (const daysOut of REMINDER_WINDOWS) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysOut);
      const targetStr = targetDate.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      // Find properties where this cert expires on or before the target date but hasn't expired yet (or has just expired)
      let query = `
        SELECT id, address, ${check.field} as expiry_date
        FROM properties
        WHERE ${check.field} IS NOT NULL
        AND ${check.field} <= ?
        AND ${check.field} >= date(?, '-7 days')
      `;
      const params: any[] = [targetStr, todayStr];

      if (check.requiresGas) {
        query += ' AND has_gas = 1';
      }

      const properties = db.prepare(query).all(...params) as any[];

      for (const prop of properties) {
        if (taskExists(check.taskType, prop.id)) continue;

        const daysUntil = Math.ceil((new Date(prop.expiry_date).getTime() - today.getTime()) / 86400000);
        const priority = daysUntil <= 7 ? 'high' : daysUntil <= 14 ? 'medium' : 'low';
        const urgency = daysUntil <= 0 ? 'EXPIRED' : `expires in ${daysUntil} days`;

        createTask(
          `${check.label} renewal — ${prop.address} (${urgency})`,
          priority,
          prop.expiry_date,
          check.taskType,
          prop.id
        );

        logAudit('create', 'task', prop.id, {
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

function runTenancyEndChecks(): number {
  let tasksCreated = 0;
  const today = new Date();

  for (const daysOut of [60, 30]) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysOut);
    const targetStr = targetDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const properties = db.prepare(`
      SELECT p.id, p.address, p.tenancy_end_date
      FROM properties p
      WHERE p.tenancy_end_date IS NOT NULL
      AND p.tenancy_end_date <= ?
      AND p.tenancy_end_date >= ?
      AND p.has_live_tenancy = 1
    `).all(targetStr, todayStr) as any[];

    for (const prop of properties) {
      if (taskExists('tenancy_end', prop.id)) continue;

      const daysUntil = Math.ceil((new Date(prop.tenancy_end_date).getTime() - today.getTime()) / 86400000);

      createTask(
        `Tenancy ending — ${prop.address} (${daysUntil} days)`,
        daysUntil <= 30 ? 'high' : 'medium',
        prop.tenancy_end_date,
        'tenancy_end',
        prop.id
      );

      logAudit('create', 'task', prop.id, {
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

function runRentReviewChecks(): number {
  let tasksCreated = 0;
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const properties = db.prepare(`
    SELECT id, address, rent_review_date
    FROM properties
    WHERE rent_review_date IS NOT NULL
    AND rent_review_date <= ?
    AND rent_review_date >= ?
  `).all(in30.toISOString().split('T')[0], today.toISOString().split('T')[0]) as any[];

  for (const prop of properties) {
    if (taskExists('rent_review', prop.id)) continue;

    createTask(
      `Rent review due — ${prop.address}`,
      'medium',
      prop.rent_review_date,
      'rent_review',
      prop.id
    );

    logAudit('create', 'task', prop.id, {
      type: 'rent_review',
      property: prop.address,
      review_date: prop.rent_review_date,
      via: 'scheduler',
    });

    tasksCreated++;
  }

  return tasksCreated;
}

function runAllChecks() {
  const complianceTasks = runComplianceChecks();
  const tenancyTasks = runTenancyEndChecks();
  const rentReviewTasks = runRentReviewChecks();
  const total = complianceTasks + tenancyTasks + rentReviewTasks;

  if (total > 0) {
    console.log(`[Scheduler] Created ${total} tasks (compliance: ${complianceTasks}, tenancy: ${tenancyTasks}, rent review: ${rentReviewTasks})`);
  }
}

export function startScheduler() {
  // Run immediately on startup
  console.log('[Scheduler] Running initial compliance checks...');
  try {
    runAllChecks();
  } catch (err) {
    console.error('[Scheduler] Initial run error:', err);
  }

  // Then run on interval
  setInterval(() => {
    try {
      runAllChecks();
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  }, CHECK_INTERVAL);

  console.log(`[Scheduler] Started — checking every ${CHECK_INTERVAL / 60000} minutes`);
}
