/**
 * Milk Collection & Inventory Routes
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
// No UUID needed - all IDs are AUTO_INCREMENT integers
const moment = require('moment');
const db = require('../utils/db');
const { camelizeRow, camelizeRows } = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * Helper: Check if a query param is actually defined
 * (not undefined, not the string "undefined", not empty)
 */
const isDefined = (val) => val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null';

/**
 * GET /api/v1/milk/stats
 * Get milk inventory statistics
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
router.get('/stats', async (req, res) => {
  try {
    // Total by status
    const [statusStats] = await db.query(
      `SELECT status, COUNT(*) as count, SUM(volume_ml) as total_volume
       FROM milk_inventory
       GROUP BY status`
    );

    // Total by milk type
    const [typeStats] = await db.query(
      `SELECT milk_type, COUNT(*) as count, SUM(volume_ml) as total_volume
       FROM milk_inventory
       WHERE status = 'available'
       GROUP BY milk_type`
    );

    // Total by storage type
    const [storageStats] = await db.query(
      `SELECT su.type as storage_type, COUNT(*) as count, SUM(mi.volume_ml) as total_volume
       FROM milk_inventory mi
       LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
       WHERE mi.status = 'available'
       GROUP BY su.type`
    );

    // Today's collections
    const [todayCollections] = await db.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(volume_ml), 0) as total_volume
       FROM milk_inventory
       WHERE DATE(created_at) = CURDATE()`
    );

    // Today's administrations
    const [todayAdministrations] = await db.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(volume_given_ml), 0) as total_volume
       FROM feeding_administrations
       WHERE DATE(administered_at) = CURDATE()`
    );

    res.json({
      success: true,
      data: {
        byStatus: camelizeRows(statusStats),
        byType: camelizeRows(typeStats),
        byStorage: camelizeRows(storageStats),
        todayCollections: camelizeRow(todayCollections[0]),
        todayAdministrations: camelizeRow(todayAdministrations[0])
      }
    });
  } catch (error) {
    console.error('Get milk stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk statistics',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/milk/next-sequence/:patientMrn
 * Get the next barcode sequence number for a patient
 */
router.get('/next-sequence/:patientMrn', async (req, res) => {
  try {
    const { patientMrn } = req.params;
    
    // Find the highest sequence number for this patient's barcodes
    // Barcode format: MRN-NNNN (e.g., 00499-0001)
    const [rows] = await db.query(
      `SELECT barcode FROM milk_inventory WHERE patient_mrn = ? ORDER BY created_at DESC`,
      [patientMrn]
    );
    
    let maxSeq = 0;
    for (const row of rows) {
      // Try to parse sequence from barcode format MRN-NNNN
      const match = row.barcode?.match(/-(\d{4})$/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    
    res.json({
      success: true,
      data: { nextSequence: maxSeq + 1, patientMrn }
    });
  } catch (error) {
    console.error('Get next sequence error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next sequence',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/milk/collect
 * Collect milk and create inventory entry
 */
router.post('/collect', [
  body('patientMrn').trim().notEmpty(),
  body('patientName').trim().notEmpty(),
  body('volume').isInt({ min: 1 }),
  body('milkType').isIn(['breast_milk', 'donor_milk', 'formula']),
  body('expressedAt').isISO8601(),
  body('storageUnitId').optional().trim(),
  body('storageLocation').optional().isIn(['freezer', 'refrigerator']),
  body('barcode').optional().trim(),
  body('serialNumber').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      patientMrn, patientName, volume, milkType, expressedAt,
      storageUnitId, storageLocation, serialNumber = 1, notes, collectionMethod
    } = req.body;

    // Resolve storage unit: use storageUnitId if provided, otherwise look up by storageLocation type
    let resolvedStorageUnitId = storageUnitId || null;
    let storageType = null;

    if (!resolvedStorageUnitId && isDefined(storageLocation)) {
      // Find an active storage unit matching the requested type (freezer/refrigerator)
      const [units] = await db.query(
        'SELECT id, type FROM storage_units WHERE type = ? AND is_active = TRUE ORDER BY current_count ASC LIMIT 1',
        [storageLocation]
      );
      if (units.length > 0) {
        resolvedStorageUnitId = units[0].id;
        storageType = units[0].type;
      } else {
        storageType = storageLocation; // Use the type for expiry calc even without a unit
      }
    } else if (resolvedStorageUnitId) {
      const [storageUnit] = await db.query('SELECT type FROM storage_units WHERE id = ?', [resolvedStorageUnitId]);
      if (storageUnit.length > 0) {
        storageType = storageUnit[0].type;
      }
    }

    // Calculate expiry date based on storage type
    const expiryDays = storageType === 'freezer' ? 180 : 3;
    const expiresAt = moment(expressedAt).add(expiryDays, 'days').toDate();

    // Use client-provided barcode if available, otherwise auto-generate MRN-NNNN format
    let barcode = req.body.barcode;
    if (!barcode) {
      // Find the highest sequence number for this patient
      const [seqRows] = await db.query(
        `SELECT barcode FROM milk_inventory WHERE patient_mrn = ? ORDER BY created_at DESC`,
        [patientMrn]
      );
      let maxSeq = 0;
      for (const row of seqRows) {
        const match = row.barcode?.match(/-(\d{4})$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
      barcode = `${patientMrn}-${String(maxSeq + 1).padStart(4, '0')}`;
    }

    const [insertResult] = await db.query(
      `INSERT INTO milk_inventory 
        (barcode, patient_mrn, patient_name, volume_ml, milk_type, 
         expressed_at, expires_at, storage_unit_id, status, serial_number, 
         collection_method, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
      [barcode, patientMrn, patientName, volume, milkType,
       expressedAt, expiresAt, resolvedStorageUnitId, serialNumber,
       collectionMethod || null, notes || null, req.user.id]
    );

    const milkId = insertResult.insertId;

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'collect_milk',
      entityType: 'milk_inventory',
      entityId: milkId,
      patientMrn,
      details: `Collected ${volume}ml ${milkType} for ${patientName}`
    });

    res.status(201).json({
      success: true,
      message: 'Milk collected successfully',
      data: {
        id: milkId,
        barcode,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Collect milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/milk
 * Get milk inventory with filters
 */
router.get('/', async (req, res) => {
  try {
    let {
      patientMrn, status, milkType, storageLocation,
      expiringSoon, page, limit
    } = req.query;

    // Parse and validate pagination parameters
    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    let sql = `
      SELECT 
        mi.id, mi.barcode, mi.patient_mrn, mi.patient_name,
        mi.volume_ml, mi.milk_type, mi.expressed_at, mi.expires_at,
        mi.shelf_position, mi.status,
        mi.reserved_for_patient_mrn, mi.reserved_at, mi.serial_number,
        mi.notes, mi.created_at,
        su.name as storage_unit_name,
        su.type as storage_location,
        su.type as storage_type,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM milk_inventory mi
      LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
      LEFT JOIN users u ON mi.created_by = u.id
      WHERE 1=1
    `;

    const params = [];

    // Only add filter conditions if values are actually defined (not "undefined" string)
    if (isDefined(patientMrn)) {
      sql += ' AND mi.patient_mrn = ?';
      params.push(patientMrn);
    }

    if (isDefined(status)) {
      sql += ' AND mi.status = ?';
      params.push(status);
    }

    if (isDefined(milkType)) {
      sql += ' AND mi.milk_type = ?';
      params.push(milkType);
    }

    if (isDefined(storageLocation)) {
      sql += ' AND su.type = ?';
      params.push(storageLocation);
    }

    if (expiringSoon === 'true') {
      sql += ' AND mi.expires_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR) AND mi.status = "available"';
    }

    // Count total
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/m, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY mi.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number((page - 1) * limit));

    const [milk] = await db.query(sql, params);

    res.json({
      success: true,
      data: camelizeRows(milk),
      pagination: {
        page: page,
        limit: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get milk inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk inventory',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/milk/patient/:mrn
 * Get available milk inventory for a specific patient (for FIFO display)
 * Returns milk sorted by expiry date (nearest expiry first - FIFO)
 */
router.get('/patient/:mrn', async (req, res) => {
  try {
    const { mrn } = req.params;

    const [milkItems] = await db.query(
      `SELECT 
        mi.*,
        su.name as storage_unit_name,
        su.type as storage_location
      FROM milk_inventory mi
      LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
      WHERE mi.patient_mrn = ? AND mi.status IN ('available', 'reserved')
      ORDER BY mi.expires_at ASC, mi.created_at ASC`,
      [mrn]
    );

    res.json({
      success: true,
      data: camelizeRows(milkItems),
      count: milkItems.length
    });
  } catch (error) {
    console.error('Get patient milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve patient milk inventory',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/milk/barcode/:barcode
 * Get milk by barcode
 */
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const [milk] = await db.query(
      `SELECT 
        mi.*,
        su.name as storage_unit_name,
        su.type as storage_location
      FROM milk_inventory mi
      LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
      WHERE mi.barcode = ?`,
      [barcode]
    );

    if (milk.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Milk not found'
      });
    }

    res.json({
      success: true,
      data: camelizeRow(milk[0])
    });
  } catch (error) {
    console.error('Get milk by barcode error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/milk/:id
 * Get milk by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [milk] = await db.query(
      `SELECT 
        mi.*,
        su.name as storage_unit_name,
        su.type as storage_location,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM milk_inventory mi
      LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
      LEFT JOIN users u ON mi.created_by = u.id
      WHERE mi.id = ?`,
      [id]
    );

    if (milk.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Milk not found'
      });
    }

    res.json({
      success: true,
      data: camelizeRow(milk[0])
    });
  } catch (error) {
    console.error('Get milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/milk/:id/discard
 * Discard milk
 */
router.post('/:id/discard', [
  body('reason').trim().notEmpty(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { reason, notes } = req.body;

    // Get milk info before discarding
    const [milk] = await db.query(
      'SELECT patient_mrn, patient_name, barcode FROM milk_inventory WHERE id = ?',
      [id]
    );

    if (milk.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Milk not found'
      });
    }

    await db.query(
      'UPDATE milk_inventory SET status = "discarded", updated_at = NOW() WHERE id = ?',
      [id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'discard_milk',
      entityType: 'milk_inventory',
      entityId: id,
      patientMrn: milk[0].patient_mrn,
      details: `Discarded milk ${milk[0].barcode}. Reason: ${reason}. Notes: ${notes || 'N/A'}`
    });

    res.json({
      success: true,
      message: 'Milk discarded successfully'
    });
  } catch (error) {
    console.error('Discard milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discard milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/milk/:id/reserve
 * Reserve milk for a patient
 */
router.post('/:id/reserve', [
  body('patientMrn').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { patientMrn } = req.body;

    // Check if milk is available
    const [milk] = await db.query(
      'SELECT status, patient_mrn FROM milk_inventory WHERE id = ?',
      [id]
    );

    if (milk.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Milk not found'
      });
    }

    if (milk[0].status !== 'available') {
      return res.status(400).json({
        success: false,
        error: `Milk is not available (status: ${milk[0].status})`
      });
    }

    await db.query(
      `UPDATE milk_inventory 
       SET status = "reserved", reserved_for_patient_mrn = ?, 
           reserved_at = NOW(), reserved_by_user_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [patientMrn, req.user.id, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'reserve_milk',
      entityType: 'milk_inventory',
      entityId: id,
      patientMrn,
      details: `Reserved milk for patient ${patientMrn}`
    });

    res.json({
      success: true,
      message: 'Milk reserved successfully'
    });
  } catch (error) {
    console.error('Reserve milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reserve milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/milk/:id/prepare
 * Prepare milk: deduct ordered volume from the original container, CREATE a new
 * inventory record for the prepared (reserved) portion, and keep the original
 * record with remaining volume as "available".
 * 
 * Body: { patientMrn, orderedVolume, orderId? }
 * Returns: { prepBarcode, remainingVolume, deductedVolume, milkStatus, preparedMilkId }
 */
router.post('/:id/prepare', [
  body('patientMrn').trim().notEmpty(),
  body('orderedVolume').isInt({ min: 1 }),
  body('orderId').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { patientMrn, orderedVolume, orderId } = req.body;

    // Fetch the milk record
    const [milkRows] = await db.query(
      `SELECT id, barcode, volume_ml, status, patient_mrn, patient_name,
              milk_type, expressed_at, expires_at, storage_unit_id,
              shelf_position, serial_number, collection_method, notes, created_by
       FROM milk_inventory WHERE id = ?`,
      [id]
    );

    if (milkRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milk not found' });
    }

    const milk = milkRows[0];

    // MRN safety check
    if (milk.patient_mrn && patientMrn &&
        milk.patient_mrn.trim().toLowerCase() !== patientMrn.trim().toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: `MRN mismatch: milk belongs to patient ${milk.patient_mrn}, not ${patientMrn}`
      });
    }

    // Must be available
    if (milk.status !== 'available') {
      return res.status(400).json({
        success: false,
        error: `Milk is not available for preparation (status: ${milk.status})`
      });
    }

    // Check expiry
    if (milk.expires_at && new Date(milk.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Milk has expired and cannot be prepared'
      });
    }

    // Volume check
    if (orderedVolume > milk.volume_ml) {
      return res.status(400).json({
        success: false,
        error: `Ordered volume (${orderedVolume}ml) exceeds available volume (${milk.volume_ml}ml)`
      });
    }

    // Calculate remaining volume in the original container
    const remainingVolume = milk.volume_ml - orderedVolume;

    // Generate prep barcode: ORIGINALBARCODE-PREP-YYYYMMDD-HHMM
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const prepBarcode = `${milk.barcode}-PREP-${dateStr}-${timeStr}`;

    // --- 1. Update the ORIGINAL milk record: deduct the prepared volume ---
    // If remaining > 0, it stays "available" for future preparations
    // If remaining == 0, mark original as "depleted"
    const originalNewStatus = remainingVolume > 0 ? 'available' : 'depleted';
    await db.query(
      `UPDATE milk_inventory 
       SET volume_ml = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [remainingVolume, originalNewStatus, id]
    );

    // --- 2. INSERT a new record for the prepared portion (status = "reserved") ---
    const [insertResult] = await db.query(
      `INSERT INTO milk_inventory 
        (barcode, patient_mrn, patient_name, volume_ml, milk_type,
         expressed_at, expires_at, storage_unit_id, shelf_position,
         status, serial_number, collection_method, notes,
         reserved_for_patient_mrn, reserved_at, reserved_by_user_id,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, NOW(), ?, ?, NOW(), NOW())`,
      [
        prepBarcode,
        milk.patient_mrn,
        milk.patient_name,
        orderedVolume,           // prepared volume becomes the new record's volume
        milk.milk_type,
        milk.expressed_at,
        milk.expires_at,
        milk.storage_unit_id,
        milk.shelf_position,
        milk.serial_number,
        milk.collection_method,
        orderId ? `Prepared from ${milk.barcode} for order ${orderId}` : `Prepared from ${milk.barcode}`,
        patientMrn,
        req.user ? req.user.id : null,
        req.user ? req.user.id : null
      ]
    );

    const preparedMilkId = insertResult.insertId;

    // Log audit
    await auditService.log({
      userId: req.user ? req.user.id : null,
      userName: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'System',
      action: 'prepare_milk',
      entityType: 'milk_inventory',
      entityId: preparedMilkId,
      patientMrn,
      details: `Prepared ${orderedVolume}ml from ${milk.barcode} (${milk.volume_ml}ml → ${remainingVolume}ml remaining). New reserved record ID: ${preparedMilkId}, Prep barcode: ${prepBarcode}.`
    });

    res.json({
      success: true,
      message: 'Milk prepared and reserved successfully',
      data: {
        milkId: milk.id,
        preparedMilkId,
        originalBarcode: milk.barcode,
        prepBarcode,
        originalVolume: milk.volume_ml,
        deductedVolume: orderedVolume,
        remainingVolume,
        milkStatus: 'reserved'
      }
    });
  } catch (error) {
    console.error('Prepare milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to prepare milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/milk/:id/transfer
 * Transfer milk to different storage
 */
router.post('/:id/transfer', [
  body('storageUnitId').trim().notEmpty(),
  body('shelfPosition').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { storageUnitId, shelfPosition } = req.body;

    await db.query(
      `UPDATE milk_inventory 
       SET storage_unit_id = ?, shelf_position = ?, updated_at = NOW()
       WHERE id = ?`,
      [storageUnitId, shelfPosition || null, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'transfer_milk',
      entityType: 'milk_inventory',
      entityId: id,
      details: `Transferred milk to storage unit ${storageUnitId}, shelf ${shelfPosition}`
    });

    res.json({
      success: true,
      message: 'Milk transferred successfully'
    });
  } catch (error) {
    console.error('Transfer milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transfer milk',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
