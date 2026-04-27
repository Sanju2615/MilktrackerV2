/**
 * Feeding Administration Routes
 * Record and retrieve feedings
 * 
 * Changes:
 *  - numeric_id (AUTO_INCREMENT) is the display ID; UUID id is internal only
 *  - patient_mrn stores the **actual** MRN, not the patient ID
 *  - administered_by user is auto-populated from the logged-in session (no second nurse step)
 *  - Second-nurse verification route removed
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
// No UUID needed - all IDs are AUTO_INCREMENT integers
const db = require('../utils/db');
const { camelizeRow, camelizeRows } = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * Helper: Check if a value is actually defined
 */
const isDefined = (val) => val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null';

/**
 * POST /api/v1/feeding/administer
 * Record a feeding administration.
 * 
 * HIMSS 6 Closed-Loop Enforcement:
 *   - verificationMethod must be 'barcode' or 'manual_override'
 *   - If 'manual_override': overrideCategory + overrideJustification are REQUIRED
 *   - Administered-by user is auto-populated from the logged-in session
 *   - patient_mrn must be the **real MRN** (e.g. 0004818), NOT the IRIS patient ID
 */
router.post('/administer', [
  body('patientMrn').trim().notEmpty(),
  body('patientName').trim().notEmpty(),
  body('milkInventoryId').optional().trim(),
  body('barcode').optional().trim(),
  body('volumeOrdered').optional().isInt(),
  body('volumeGiven').isInt({ min: 1 }),
  body('feedingType').trim().notEmpty(),
  body('route').optional().trim(),
  body('administeredAt').optional().isISO8601(),
  body('verificationMethod').isIn(['barcode', 'manual_override']).withMessage('verificationMethod must be barcode or manual_override'),
  body('overrideCategory').optional().trim(),
  body('overrideJustification').optional().trim(),
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
      patientMrn, patientName, milkInventoryId, barcode,
      orderId, volumeOrdered, volumeGiven, feedingType, route,
      administeredAt, tolerance, residual, vomit, stool, notes,
      verificationMethod, overrideCategory, overrideJustification
    } = req.body;

    // ── Closed-loop gate ──────────────────────────────────────
    if (verificationMethod === 'manual_override') {
      if (!overrideCategory || !overrideJustification || !overrideJustification.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Override requires both a category and written justification'
        });
      }
    }
    // ──────────────────────────────────────────────────────────

    // Auto-populate nurse name from the logged-in session
    const administeredByName = req.user
      ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
      : 'System';

    // Build the combined notes field including any override info
    const overridePrefix = verificationMethod === 'manual_override'
      ? `[OVERRIDE] Category: ${overrideCategory}. Justification: ${overrideJustification}. `
      : '';
    const combinedNotes = overridePrefix + (notes || '');

    // Insert – id is AUTO_INCREMENT, filled by DB automatically
    const [insertResult] = await db.query(
      `INSERT INTO feeding_administrations 
        (patient_mrn, patient_name, milk_inventory_id, barcode, order_id,
         volume_ordered_ml, volume_given_ml, feeding_type, route,
         administered_at, administered_by_user_id, administered_by_name,
         tolerance, residual_ml, vomit, stool, notes, verification_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientMrn, patientName, milkInventoryId || null, barcode || null, orderId || null,
       volumeOrdered || null, volumeGiven, feedingType, route || 'oral',
       administeredAt || new Date().toISOString(), req.user ? req.user.id : null, administeredByName,
       tolerance || 'good', residual || null,
       vomit || false, stool || false, combinedNotes || null, verificationMethod]
    );

    const adminId = insertResult.insertId;

    // Update milk inventory: subtract volume given, update status
    let milkVolumeInfo = null;
    if (barcode || milkInventoryId) {
      // Find the milk record
      const lookupField = barcode ? 'barcode' : 'id';
      const lookupValue = barcode || milkInventoryId;
      
      const [milkRows] = await db.query(
        `SELECT id, barcode, volume_ml, status, patient_mrn FROM milk_inventory WHERE ${lookupField} = ?`,
        [lookupValue]
      );
      
      if (milkRows.length > 0) {
        const milk = milkRows[0];

        // ── SERVER-SIDE MRN CHECK: milk must belong to the same patient ──
        if (milk.patient_mrn && patientMrn &&
            milk.patient_mrn.trim().toLowerCase() !== patientMrn.trim().toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: `MRN mismatch: milk belongs to patient ${milk.patient_mrn}, not ${patientMrn}`
          });
        }
        // ─────────────────────────────────────────────────────────────────

        const originalVolume = milk.volume_ml;
        const remainingVolume = Math.max(0, originalVolume - volumeGiven);
        const newStatus = remainingVolume <= 0 ? 'administered' : 'available';
        
        await db.query(
          'UPDATE milk_inventory SET volume_ml = ?, status = ?, updated_at = NOW() WHERE id = ?',
          [remainingVolume, newStatus, milk.id]
        );
        
        milkVolumeInfo = {
          milkId: milk.id,
          milkBarcode: milk.barcode,
          originalVolumeMl: originalVolume,
          volumeGivenMl: volumeGiven,
          remainingVolumeMl: remainingVolume,
          milkStatus: newStatus
        };
      }
    }

    // adminId IS the auto-increment integer id now

    await auditService.log({
      userId: req.user ? req.user.id : null,
      userName: administeredByName,
      action: 'administer_feeding',
      entityType: 'feeding_administration',
      entityId: adminId,
      patientMrn,
      details: `Administered ${volumeGiven}ml via ${feedingType} to ${patientName} by ${administeredByName}` +
               (verificationMethod === 'manual_override' ? ` [OVERRIDE: ${overrideCategory}]` : ' [Barcode Verified]')
    });

    res.status(201).json({
      success: true,
      message: 'Feeding recorded successfully',
      data: { 
        id: adminId,
        administeredByName,
        milkVolume: milkVolumeInfo
      }
    });
  } catch (error) {
    console.error('Administer feeding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record feeding',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/feeding
 * Get feeding administrations
 */
router.get('/', async (req, res) => {
  try {
    const { patientMrn, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT 
        fa.*,
        COALESCE(fa.administered_by_name, CONCAT(admin_by.first_name, ' ', admin_by.last_name)) as administered_by_name
      FROM feeding_administrations fa
      LEFT JOIN users admin_by ON fa.administered_by_user_id = admin_by.id
      WHERE 1=1
    `;

    const params = [];

    if (isDefined(patientMrn)) {
      sql += ' AND fa.patient_mrn = ?';
      params.push(patientMrn);
    }

    sql += ' ORDER BY fa.administered_at DESC LIMIT ? OFFSET ?';
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    params.push(limitNum, (pageNum - 1) * limitNum);

    const [feedings] = await db.query(sql, params);

    res.json({
      success: true,
      data: camelizeRows(feedings)
    });
  } catch (error) {
    console.error('Get feedings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedings',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/feeding/patient/:mrn
 * Get feeding history for a patient
 */
router.get('/patient/:mrn', async (req, res) => {
  try {
    const { mrn } = req.params;

    const [feedings] = await db.query(
      `SELECT 
        fa.*,
        COALESCE(fa.administered_by_name, CONCAT(admin_by.first_name, ' ', admin_by.last_name)) as administered_by_name
      FROM feeding_administrations fa
      LEFT JOIN users admin_by ON fa.administered_by_user_id = admin_by.id
      WHERE fa.patient_mrn = ?
      ORDER BY fa.administered_at DESC`,
      [mrn]
    );

    res.json({
      success: true,
      data: camelizeRows(feedings)
    });
  } catch (error) {
    console.error('Get patient feedings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve patient feedings',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/feeding/completed
 * Get completed feeding administrations (for the Completed Orders page)
 * Returns feedings with their incremental numeric_id for display
 */
router.get('/completed', async (req, res) => {
  try {
    const { patientMrn, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT 
        fa.*,
        COALESCE(fa.administered_by_name, CONCAT(admin_by.first_name, ' ', admin_by.last_name)) as administered_by_name,
        mi.volume_ml as current_milk_volume,
        mi.status as current_milk_status,
        mi.milk_type
      FROM feeding_administrations fa
      LEFT JOIN users admin_by ON fa.administered_by_user_id = admin_by.id
      LEFT JOIN milk_inventory mi ON fa.barcode = mi.barcode
      WHERE 1=1
    `;

    const params = [];

    if (isDefined(patientMrn)) {
      sql += ' AND fa.patient_mrn = ?';
      params.push(patientMrn);
    }

    sql += ' ORDER BY fa.administered_at DESC LIMIT ? OFFSET ?';
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    params.push(limitNum, (pageNum - 1) * limitNum);

    const [feedings] = await db.query(sql, params);

    // Count total
    let countSql = 'SELECT COUNT(*) as total FROM feeding_administrations WHERE 1=1';
    const countParams = [];
    if (isDefined(patientMrn)) {
      countSql += ' AND patient_mrn = ?';
      countParams.push(patientMrn);
    }
    const [countRows] = await db.query(countSql, countParams);
    const total = countRows[0]?.total || 0;

    res.json({
      success: true,
      data: camelizeRows(feedings),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get completed feedings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve completed feedings',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
