/**
 * Feeding Administration Routes
 * Record and verify feedings
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
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
 * Record a feeding administration
 */
router.post('/administer', [
  body('patientMrn').trim().notEmpty(),
  body('patientName').trim().notEmpty(),
  body('milkInventoryId').optional().trim(),
  body('barcode').optional().trim(),
  body('volumeOrdered').optional().isInt(),
  body('volumeGiven').isInt({ min: 1 }),
  body('feedingType').isIn(['bottle', 'syringe', 'gavage', 'breastfeeding']),
  body('route').isIn(['oral', 'ng_tube', 'og_tube', 'g_tube']),
  body('administeredAt').isISO8601()
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
      administeredAt, tolerance, residual, vomit, stool, notes
    } = req.body;

    const adminId = uuidv4();

    await db.query(
      `INSERT INTO feeding_administrations 
        (id, patient_mrn, patient_name, milk_inventory_id, barcode, order_id,
         volume_ordered_ml, volume_given_ml, feeding_type, route,
         administered_at, administered_by_user_id, tolerance, residual_ml,
         vomit, stool, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, patientMrn, patientName, milkInventoryId || null, barcode || null, orderId || null,
       volumeOrdered || null, volumeGiven, feedingType, route,
       administeredAt, req.user.id, tolerance || 'good', residual || null,
       vomit || false, stool || false, notes || null]
    );

    // Update milk inventory status if barcode provided
    if (barcode) {
      await db.query(
        'UPDATE milk_inventory SET status = "administered", updated_at = NOW() WHERE barcode = ?',
        [barcode]
      );
    }

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'administer_feeding',
      entityType: 'feeding_administration',
      entityId: adminId,
      patientMrn,
      details: `Administered ${volumeGiven}ml via ${feedingType} to ${patientName}`
    });

    res.status(201).json({
      success: true,
      message: 'Feeding recorded successfully',
      data: { id: adminId }
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
 * POST /api/v1/feeding/:id/verify
 * Verify a feeding (second nurse verification)
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;

    // Get feeding info
    const [feeding] = await db.query(
      'SELECT patient_mrn, patient_name FROM feeding_administrations WHERE id = ?',
      [id]
    );

    if (feeding.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Feeding not found'
      });
    }

    await db.query(
      `UPDATE feeding_administrations 
       SET verified_by_user_id = ?, verified_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'verify_feeding',
      entityType: 'feeding_administration',
      entityId: id,
      patientMrn: feeding[0].patient_mrn,
      details: `Verified feeding for ${feeding[0].patient_name}`
    });

    res.json({
      success: true,
      message: 'Feeding verified successfully'
    });
  } catch (error) {
    console.error('Verify feeding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify feeding',
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
        CONCAT(admin_by.first_name, ' ', admin_by.last_name) as administered_by_name,
        CONCAT(verify_by.first_name, ' ', verify_by.last_name) as verified_by_name
      FROM feeding_administrations fa
      LEFT JOIN users admin_by ON fa.administered_by_user_id = admin_by.id
      LEFT JOIN users verify_by ON fa.verified_by_user_id = verify_by.id
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
        CONCAT(admin_by.first_name, ' ', admin_by.last_name) as administered_by_name,
        CONCAT(verify_by.first_name, ' ', verify_by.last_name) as verified_by_name
      FROM feeding_administrations fa
      LEFT JOIN users admin_by ON fa.administered_by_user_id = admin_by.id
      LEFT JOIN users verify_by ON fa.verified_by_user_id = verify_by.id
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

module.exports = router;
