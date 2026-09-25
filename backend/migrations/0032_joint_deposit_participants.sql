CREATE TABLE bank_feed_allocation_participants (
 id SERIAL PRIMARY KEY,
 allocation_id INTEGER NOT NULL REFERENCES bank_feed_allocations(id) ON DELETE CASCADE,
 tenant_id INTEGER REFERENCES tenants(id) ON DELETE RESTRICT,
 enquiry_id INTEGER REFERENCES tenant_enquiries(id) ON DELETE RESTRICT,
 CHECK(num_nonnulls(tenant_id,enquiry_id)=1)
);
CREATE UNIQUE INDEX allocation_tenant ON bank_feed_allocation_participants(allocation_id,tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX allocation_enquiry ON bank_feed_allocation_participants(allocation_id,enquiry_id) WHERE enquiry_id IS NOT NULL;
INSERT INTO bank_feed_allocation_participants(allocation_id,tenant_id)
 SELECT id,tenant_id FROM bank_feed_allocations WHERE kind='deposit' AND tenant_id IS NOT NULL;
