/**
 * Reports Routes
 * Generate various reports for milk tracking
 */

const express = require('express');
const db = require('../utils/db');
const { camelizeRow, camelizeRows } = require('../utils/db');

const router = express.Router();

/**
 * Helper: Check if a value is actually defined
 */
const isDefined = (val) => val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null';

/**
 * GET /api/v1/reports/daily-summary
 * Daily summary report
 */
router.get('/daily-summary', async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = isDefined(date) ? date : new Date().toISOString().split('T')[0];

    // Collections
    const [collections] = await db.query(
      `SELECT 
        milk_type,
        COUNT(*) as count,
        COALESCE(SUM(volume_ml), 0) as total_volume
      FROM milk_inventory
      WHERE DATE(created_at) = ?
      GROUP BY milk_type`,
      [reportDate]
    );

    // Administrations
    const [administrations] = await db.query(
      `SELECT 
        feeding_type,
        COUNT(*) as count,
        COALESCE(SUM(volume_given_ml), 0) as total_volume
      FROM feeding_administrations
      WHERE DATE(administered_at) = ?
      GROUP BY feeding_type`,
      [reportDate]
    );

    // Discards
    const [discards] = await db.query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(volume_ml), 0) as total_volume
      FROM milk_inventory
      WHERE status = 'discarded' AND DATE(updated_at) = ?`,
      [reportDate]
    );

    res.json({
      success: true,
      data: {
        date: reportDate,
        collections: camelizeRows(collections),
        administrations: camelizeRows(administrations),
        discards: camelizeRow(discards[0])
      }
    });
  } catch (error) {
    console.error('Daily summary report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate daily summary',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/reports/patient-usage
 * Patient milk usage report
 */
router.get('/patient-usage', async (req, res) => {
  try {
    const { patientMrn, startDate, endDate } = req.query;

    let sql = `
      SELECT 
        fa.patient_mrn,
        fa.patient_name,
        DATE(fa.administered_at) as date,
        COUNT(*) as feeding_count,
        COALESCE(SUM(fa.volume_given_ml), 0) as total_volume,
        GROUP_CONCAT(DISTINCT fa.feeding_type) as feeding_types
      FROM feeding_administrations fa
      WHERE 1=1
    `;

    const params = [];

    if (isDefined(patientMrn)) {
      sql += ' AND fa.patient_mrn = ?';
      params.push(patientMrn);
    }

    if (isDefined(startDate)) {
      sql += ' AND DATE(fa.administered_at) >= ?';
      params.push(startDate);
    }

    if (isDefined(endDate)) {
      sql += ' AND DATE(fa.administered_at) <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY fa.patient_mrn, fa.patient_name, DATE(fa.administered_at) ORDER BY date DESC';

    const [usage] = await db.query(sql, params);

    res.json({
      success: true,
      data: camelizeRows(usage)
    });
  } catch (error) {
    console.error('Patient usage report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate patient usage report',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/reports/inventory-status
 * Current inventory status report
 */
router.get('/inventory-status', async (req, res) => {
  try {
    const [status] = await db.query(
      `SELECT 
        mi.status,
        mi.milk_type,
        su.type as storage_type,
        COUNT(*) as count,
        COALESCE(SUM(mi.volume_ml), 0) as total_volume
      FROM milk_inventory mi
      LEFT JOIN storage_units su ON mi.storage_unit_id = su.id
      GROUP BY mi.status, mi.milk_type, su.type`
    );

    res.json({
      success: true,
      data: camelizeRows(status)
    });
  } catch (error) {
    console.error('Inventory status report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate inventory status report',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/reports/expiry
 * Expiry report
 */
router.get('/expiry', async (req, res) => {
  try {
    // Expiring in next 7 days
    const [expiring] = await db.query(
      `SELECT 
        mi.*,
        DATEDIFF(mi.expires_at, NOW()) as days_remaining
      FROM milk_inventory mi
      WHERE mi.status = 'available'
        AND mi.expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)
      ORDER BY mi.expires_at`
    );

    res.json({
      success: true,
      data: {
        expiringCount: expiring.length,
        expiring: camelizeRows(expiring)
      }
    });
  } catch (error) {
    console.error('Expiry report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate expiry report',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
