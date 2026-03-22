import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import { query, queryOne, insert, run } from './db-pg';
import { AuthRequest } from './auth';

// Ensure inventory uploads directory exists
const inventoryUploadsDir = path.join(__dirname, '../uploads/inventory');
const thumbnailsDir = path.join(inventoryUploadsDir, 'thumbnails');

if (!fs.existsSync(inventoryUploadsDir)) {
  fs.mkdirSync(inventoryUploadsDir, { recursive: true });
}
if (!fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
}

// Multer config for inventory photos
const inventoryStorage = multer.diskStorage({
  destination: inventoryUploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `inventory_${uniqueSuffix}${ext}`);
  }
});

const inventoryUpload = multer({
  storage: inventoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper function to generate thumbnail
async function generateThumbnail(originalPath: string, thumbnailPath: string) {
  try {
    await sharp(originalPath)
      .resize(400, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
  }
}

// Audit logging helper
async function logAudit(userId: number | undefined, userEmail: string | undefined, action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, userEmail || null, action, entityType, entityId || null, changes ? JSON.stringify(changes) : null]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function registerInventoryRoutes(app: Express, authMiddleware: any) {

  // ============ INVENTORIES ============

  app.get('/api/inventories', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const inventories = await query(`
        SELECT
          i.*,
          p.address as property_address,
          t.name as tenant_name,
          u.name as conducted_by_name,
          (SELECT COUNT(*) FROM inventory_photos ip WHERE ip.inventory_id = i.id) as photo_count,
          (SELECT COUNT(*) FROM inventory_rooms ir WHERE ir.inventory_id = i.id) as room_count
        FROM inventories i
        LEFT JOIN properties p ON p.id = i.property_id
        LEFT JOIN tenants t ON t.id = i.tenant_id
        LEFT JOIN users u ON u.id = i.conducted_by
        ORDER BY i.created_at DESC
      `);
      res.json(inventories);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch inventories' });
    }
  });

  app.post('/api/inventories', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { property_id, tenant_id, inventory_type, inspection_date, notes } = req.body;

      if (!property_id || !inventory_type || !inspection_date) {
        return res.status(400).json({ error: 'property_id, inventory_type, and inspection_date are required' });
      }

      const id = await insert(
        `INSERT INTO inventories (property_id, tenant_id, inventory_type, inspection_date, conducted_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [property_id, tenant_id || null, inventory_type, inspection_date, req.user?.id, notes || null]
      );

      await logAudit(req.user?.id, req.user?.email, 'create', 'inventory', id);
      res.json({ id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create inventory' });
    }
  });

  app.get('/api/inventories/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const inventory = await queryOne(`
        SELECT
          i.*,
          p.address as property_address,
          p.postcode,
          t.name as tenant_name,
          u.name as conducted_by_name,
          (SELECT COUNT(*) FROM inventory_photos ip WHERE ip.inventory_id = i.id) as photo_count,
          (SELECT COUNT(*) FROM inventory_rooms ir WHERE ir.inventory_id = i.id) as room_count
        FROM inventories i
        LEFT JOIN properties p ON p.id = i.property_id
        LEFT JOIN tenants t ON t.id = i.tenant_id
        LEFT JOIN users u ON u.id = i.conducted_by
        WHERE i.id = $1
      `, [req.params.id]);

      if (!inventory) {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      await logAudit(req.user?.id, req.user?.email, 'view', 'inventory', parseInt(req.params.id));
      res.json(inventory);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });

  app.put('/api/inventories/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { overall_condition, notes, status } = req.body;

      await run(
        `UPDATE inventories SET overall_condition=$1, notes=$2, status=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
        [overall_condition || null, notes || null, status || 'in_progress', req.params.id]
      );

      await logAudit(req.user?.id, req.user?.email, 'update', 'inventory', parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update inventory' });
    }
  });

  app.put('/api/inventories/:id/complete', authMiddleware, async (req: AuthRequest, res) => {
    try {
      await run(
        `UPDATE inventories SET status='completed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [req.params.id]
      );

      await logAudit(req.user?.id, req.user?.email, 'update', 'inventory', parseInt(req.params.id), { status: 'completed' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to complete inventory' });
    }
  });

  app.delete('/api/inventories/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Delete associated photos from filesystem
      const photos = await query(`SELECT filename, thumbnail_filename FROM inventory_photos WHERE inventory_id = $1`, [req.params.id]);
      for (const photo of photos) {
        const filePath = path.join(inventoryUploadsDir, photo.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (photo.thumbnail_filename) {
          const thumbPath = path.join(thumbnailsDir, photo.thumbnail_filename);
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }
      }

      await run(`DELETE FROM inventories WHERE id = $1`, [req.params.id]);
      await logAudit(req.user?.id, req.user?.email, 'delete', 'inventory', parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete inventory' });
    }
  });

  // ============ INVENTORY ROOMS ============

  app.get('/api/inventories/:id/rooms', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const rooms = await query(`
        SELECT
          r.*,
          (SELECT COUNT(*) FROM inventory_photos ip WHERE ip.room_id = r.id) as photo_count
        FROM inventory_rooms r
        WHERE r.inventory_id = $1
        ORDER BY r.created_at
      `, [req.params.id]);
      res.json(rooms);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  app.post('/api/inventories/:id/rooms', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { room_name, room_type, condition, notes } = req.body;

      if (!room_name || !room_type) {
        return res.status(400).json({ error: 'room_name and room_type are required' });
      }

      const id = await insert(
        `INSERT INTO inventory_rooms (inventory_id, room_name, room_type, condition, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, room_name, room_type, condition || null, notes || null]
      );

      res.json({ id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  app.put('/api/inventory-rooms/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { room_name, room_type, condition, notes } = req.body;

      await run(
        `UPDATE inventory_rooms SET room_name=$1, room_type=$2, condition=$3, notes=$4 WHERE id=$5`,
        [room_name, room_type, condition, notes, req.params.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update room' });
    }
  });

  app.delete('/api/inventory-rooms/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Delete associated photos from filesystem
      const photos = await query(`SELECT filename, thumbnail_filename FROM inventory_photos WHERE room_id = $1`, [req.params.id]);
      for (const photo of photos) {
        const filePath = path.join(inventoryUploadsDir, photo.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (photo.thumbnail_filename) {
          const thumbPath = path.join(thumbnailsDir, photo.thumbnail_filename);
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }
      }

      await run(`DELETE FROM inventory_rooms WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete room' });
    }
  });

  // ============ INVENTORY PHOTOS ============

  app.get('/api/inventories/:id/photos', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const photos = await query(`
        SELECT
          p.*,
          r.room_name
        FROM inventory_photos p
        LEFT JOIN inventory_rooms r ON r.id = p.room_id
        WHERE p.inventory_id = $1
        ORDER BY p.room_id, p.photo_order, p.created_at
      `, [req.params.id]);
      res.json(photos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch photos' });
    }
  });

  app.post('/api/inventory-photos/:inventoryId/:roomId', authMiddleware, inventoryUpload.single('file'), async (req: AuthRequest, res) => {
    try {
      const { inventoryId, roomId } = req.params;
      const { caption } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Generate thumbnail
      const thumbnailFilename = `thumb_${file.filename}`;
      const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
      await generateThumbnail(file.path, thumbnailPath);

      // Get image dimensions
      const metadata = await sharp(file.path).metadata();

      // Get current max photo_order for this room
      const maxOrder = await queryOne(
        `SELECT COALESCE(MAX(photo_order), -1) as max_order FROM inventory_photos WHERE room_id = $1`,
        [roomId]
      );

      const id = await insert(
        `INSERT INTO inventory_photos
         (inventory_id, room_id, filename, original_name, mime_type, size, width, height, thumbnail_filename, photo_order, caption, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          inventoryId,
          roomId,
          file.filename,
          file.originalname,
          file.mimetype,
          file.size,
          metadata.width || null,
          metadata.height || null,
          thumbnailFilename,
          maxOrder.max_order + 1,
          caption || null,
          req.user?.id
        ]
      );

      const photo = await queryOne(`SELECT * FROM inventory_photos WHERE id = $1`, [id]);
      res.json(photo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });

  app.delete('/api/inventory-photos/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const photo = await queryOne(`SELECT * FROM inventory_photos WHERE id = $1`, [req.params.id]);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Delete files
      const filePath = path.join(inventoryUploadsDir, photo.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      if (photo.thumbnail_filename) {
        const thumbPath = path.join(thumbnailsDir, photo.thumbnail_filename);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }

      await run(`DELETE FROM inventory_photos WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete photo' });
    }
  });

  // Serve inventory photos
  app.use('/uploads/inventory', authMiddleware, (req, res, next) => {
    // Serve static files from inventory uploads directory
    const filePath = path.join(inventoryUploadsDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });
}
