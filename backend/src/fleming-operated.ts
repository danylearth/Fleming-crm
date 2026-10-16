// Rentro landlords manage some properties themselves (properties.management_mode='self_managed').
// Fleming's background work — staff reminder tasks, rent charges, invoices, dashboard counts — must only
// touch properties Fleming operates. Every such query adds one of these conditions.

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function checked(alias: string) {
  if (!IDENTIFIER.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return alias;
}

/** A properties row (by alias or table name) that Fleming operates. */
export const flemingOperatedSql = (propertyAlias = 'p') => `${checked(propertyAlias)}.management_mode = 'fleming'`;

/** A row with a property_id (tenants, maintenance…) whose property, if any, Fleming operates. Rows without a property stay included. */
export const flemingOperatedRowSql = (rowAlias = 't') =>
  `NOT EXISTS (SELECT 1 FROM properties fo WHERE fo.id = ${checked(rowAlias)}.property_id AND fo.management_mode <> 'fleming')`;
