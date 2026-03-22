import { Pool } from 'pg';

/**
 * Inventory Management Database Migration
 * Run this to add inventory tables to existing Fleming CRM database
 */

export async function runInventoryMigration(pool: Pool) {
  const client = await pool.connect();
  try {
    console.log('Running inventory migration...');

    await client.query(`
      -- INVENTORIES (main inventory record)
      CREATE TABLE IF NOT EXISTS inventories (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        inventory_type TEXT NOT NULL CHECK(inventory_type IN ('check_in', 'check_out', 'periodic', 'mid_term')),
        inspection_date DATE NOT NULL,
        conducted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'approved', 'disputed')),
        overall_condition TEXT CHECK(overall_condition IN ('excellent', 'good', 'fair', 'poor', NULL)),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      -- INVENTORY_ROOMS (breakdown by room)
      CREATE TABLE IF NOT EXISTS inventory_rooms (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        room_name TEXT NOT NULL,
        room_type TEXT CHECK(room_type IN ('bedroom', 'living_room', 'kitchen', 'bathroom', 'hallway', 'garden', 'other', NULL)),
        condition TEXT CHECK(condition IN ('excellent', 'good', 'fair', 'poor', NULL)),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- INVENTORY_ITEMS (specific items within rooms)
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES inventory_rooms(id) ON DELETE CASCADE,
        item_name TEXT NOT NULL,
        item_type TEXT,
        quantity INTEGER DEFAULT 1,
        condition TEXT CHECK(condition IN ('excellent', 'good', 'fair', 'poor', 'damaged', NULL)),
        notes TEXT,
        meter_reading REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- INVENTORY_PHOTOS (photos linked to rooms or items)
      CREATE TABLE IF NOT EXISTS inventory_photos (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        room_id INTEGER REFERENCES inventory_rooms(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        thumbnail_filename TEXT,
        ai_enhanced_filename TEXT,
        ai_enhancement_status TEXT CHECK(ai_enhancement_status IN ('pending', 'processing', 'completed', 'failed', NULL)),
        photo_order INTEGER DEFAULT 0,
        caption TEXT,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_inventories_property ON inventories(property_id);
      CREATE INDEX IF NOT EXISTS idx_inventories_status ON inventories(status);
      CREATE INDEX IF NOT EXISTS idx_inventories_conducted_by ON inventories(conducted_by);
      CREATE INDEX IF NOT EXISTS idx_inventory_rooms_inventory ON inventory_rooms(inventory_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_items_room ON inventory_items(room_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_photos_inventory ON inventory_photos(inventory_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_photos_room ON inventory_photos(room_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_photos_item ON inventory_photos(item_id);
    `);

    console.log('✅ Inventory migration completed successfully!');
  } catch (error) {
    console.error('❌ Inventory migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
