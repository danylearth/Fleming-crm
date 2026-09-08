-- One-time history migration; subsequent restarts must not shift tenant addresses.

      UPDATE tenants t
      SET address_before_previous = t.previous_address,
          previous_address = t.current_address,
          current_address = CONCAT_WS(', ', p.address,
            CASE WHEN COALESCE(p.address, '') ILIKE '%' || COALESCE(p.postcode, '') || '%' THEN NULL ELSE NULLIF(p.postcode, '') END)
      FROM properties p
      WHERE p.id = t.property_id
        AND COALESCE(t.status, 'active') = 'active'
        AND COALESCE(TRIM(t.current_address), '') <> COALESCE(TRIM(CONCAT_WS(', ', p.address,
          CASE WHEN COALESCE(p.address, '') ILIKE '%' || COALESCE(p.postcode, '') || '%' THEN NULL ELSE NULLIF(p.postcode, '') END)), '');
    
-- Only unambiguous active joint pairs on one property can be safely linked.
WITH pairs AS (
 SELECT property_id, array_agg(id ORDER BY id) AS ids
 FROM tenants WHERE status = 'active' AND is_joint_tenancy = 1 AND property_id IS NOT NULL
 GROUP BY property_id HAVING count(*) = 2
)
UPDATE tenants t SET linked_tenant_id = CASE WHEN t.id = p.ids[1] THEN p.ids[2] ELSE p.ids[1] END
FROM pairs p WHERE t.id = ANY(p.ids) AND t.linked_tenant_id IS NULL;
