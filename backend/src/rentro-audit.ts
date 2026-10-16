// Every Rentro change is audited under the customer account that made it, so staff can filter
// customer actions in the audit log.
import type { PoolClient } from 'pg';

export async function rentroAudit(
  db: Pick<PoolClient, 'query'>,
  actor: { accountId: string; email: string },
  action: string,
  entityType: string,
  entityId: number | null,
  changes: Record<string, unknown> = {},
) {
  await db.query(
    'INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes,customer_account_id) VALUES($1,$2,$3,$4,$5,$6)',
    [actor.email, action, entityType, entityId, JSON.stringify({ rentro: true, ...changes }), actor.accountId],
  );
}
