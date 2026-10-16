// Every tasks.task_type the code writes. The tasks_task_type_check constraint is built from this list,
// so a type added in code must be added here too. insurance_reminder is retired but kept for old rows.
export const TASK_TYPES = [
  'manual', 'follow_up', 'viewing', 'handover', 'maintenance',
  'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing',
  'inventory_due', 'insurance_renewal', 'insurance_reminder', 'property_inspection',
  'landlord_meeting', 'landlord_follow_up',
  'rentro_arrange', 'rentro_authority', 'rentro_escalation', 'rentro_help', 'rentro_passport_review',
] as const;

export type TaskType = typeof TASK_TYPES[number];

export const taskTypeCheckSql = () => `task_type IN (${TASK_TYPES.map(t => `'${t}'`).join(', ')}, NULL)`;
