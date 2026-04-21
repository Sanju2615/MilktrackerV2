/**
 * Milk Collection & Inventory Routes
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../utils/db');
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
        byStatus: statusStats,
        byType: typeStats,
        byStorage: storageStats,
        todayCollections: todayCollections[0],
        todayAdministrations: todayAdministrations[0]
      }
    });
  } catch (error) {
    console.error('Get milk stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk statistics'
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
      storageUnitId, serialNumber = 1, notes, collectionMethod
    } = req.body;

    // Calculate expiry date (default to 3 days if no storage unit specified)
    let expiryDays = 3;
    if (storageUnitId) {
      const [storageUnit] = await db.query('SELECT type FROM storage_units WHERE id = ?', [storageUnitId]);
      if (storageUnit.length > 0) {
        expiryDays = storageUnit[0].type === 'freezer' ? 180 : 3;
      }
    }
    const expiresAt = moment(expressedAt).add(expiryDays, 'days').toDate();

    // Generate barcode
    const dateCode = moment(expressedAt).format('YYYYMMDD');
    const typeCode = milkType.substring(0, 2).toUpperCase();
    const barcode = `${patientMrn}-${String(serialNumber).padStart(3, '0')}-${typeCode}-${volume}-${dateCode}`;

    const milkId = uuidv4();

    await db.query(
      `INSERT INTO milk_inventory 
        (id, barcode, patient_mrn, patient_name, volume_ml, milk_type, 
         expressed_at, expires_at, storage_unit_id, status, serial_number, 
         collection_method, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
      [milkId, barcode, patientMrn, patientName, volume, milkType,
       expressedAt, expiresAt, storageUnitId || null, serialNumber,
       collectionMethod || null, notes || null, req.user.id]
    );

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
      error: 'Failed to collect milk'
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
      data: milk,
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
      error: 'Failed to retrieve milk inventory'
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
        su.name as storage_unit_name
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
      data: milk[0]
    });
  } catch (error) {
    console.error('Get milk by barcode error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk'
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
      data: milk[0]
    });
  } catch (error) {
    console.error('Get milk error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve milk'
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
      error: 'Failed to discard milk'
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
      error: 'Failed to reserve milk'
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
      error: 'Failed to transfer milk'
    });
  }
});

module.exports = router;
