ALTER TABLE inventories ADD COLUMN IF NOT EXISTS review_issued_at TIMESTAMPTZ;
CREATE TABLE inventory_documents (
  inventory_id INTEGER PRIMARY KEY REFERENCES inventories(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf', data BYTEA NOT NULL
);
CREATE TABLE inventory_reviews (
  id SERIAL PRIMARY KEY, inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id), token TEXT NOT NULL UNIQUE,
  tenant_name TEXT NOT NULL, email TEXT, phone TEXT, due_date DATE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, signed_at TIMESTAMPTZ, signature_name TEXT,
  general_comments TEXT, email_id TEXT, email_error TEXT, sms_id TEXT, sms_error TEXT,
  sending_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(inventory_id,tenant_id)
);
CREATE TABLE inventory_photo_reviews (
  review_id INTEGER REFERENCES inventory_reviews(id) ON DELETE CASCADE,
  photo_id INTEGER REFERENCES inventory_photos(id) ON DELETE CASCADE,
  approved BOOLEAN NOT NULL DEFAULT FALSE, comment TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(review_id,photo_id)
);
CREATE TABLE inventory_tenant_photos (
  id SERIAL PRIMARY KEY, review_id INTEGER NOT NULL REFERENCES inventory_reviews(id) ON DELETE CASCADE,
  caption TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Serialise source edits with issuance. Issued inventories remain an immutable record.
CREATE FUNCTION protect_issued_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id INTEGER; issued TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME='inventories' THEN
    IF OLD.review_issued_at IS NOT NULL THEN RAISE EXCEPTION 'Issued inventories cannot be changed'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME='inventory_items' THEN
    SELECT inventory_id INTO parent_id FROM inventory_rooms WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.room_id ELSE NEW.room_id END;
  ELSE
    parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.inventory_id ELSE NEW.inventory_id END;
  END IF;
  SELECT review_issued_at INTO issued FROM inventories WHERE id=parent_id FOR UPDATE;
  IF issued IS NOT NULL THEN RAISE EXCEPTION 'Issued inventories cannot be changed'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_inventory BEFORE UPDATE OR DELETE ON inventories FOR EACH ROW EXECUTE FUNCTION protect_issued_inventory();
CREATE TRIGGER protect_inventory_rooms BEFORE INSERT OR UPDATE OR DELETE ON inventory_rooms FOR EACH ROW EXECUTE FUNCTION protect_issued_inventory();
CREATE TRIGGER protect_inventory_photos BEFORE INSERT OR UPDATE OR DELETE ON inventory_photos FOR EACH ROW EXECUTE FUNCTION protect_issued_inventory();
CREATE TRIGGER protect_inventory_items BEFORE INSERT OR UPDATE OR DELETE ON inventory_items FOR EACH ROW EXECUTE FUNCTION protect_issued_inventory();
CREATE TRIGGER protect_inventory_documents BEFORE INSERT OR UPDATE OR DELETE ON inventory_documents FOR EACH ROW EXECUTE FUNCTION protect_issued_inventory();
