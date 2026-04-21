/**
 * Inventory Management Routes
 * Storage units, alerts, and inventory operations
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/v1/inventory/storage-units
 * Get all storage units
 */
router.get('/storage-units', async (req, res) => {
  try {
    const [units] = await db.query(
      `SELECT 
        su.*,
        COUNT(mi.id) as current_count
      FROM storage_units su
      LEFT JOIN milk_inventory mi ON su.id = mi.storage_unit_id AND mi.status = 'available'
      WHERE su.is_active = true
      GROUP BY su.id
      ORDER BY su.name`
    );

    res.json({
      success: true,
      data: units
    });
  } catch (error) {
    console.error('Get storage units error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve storage units'
    });
  }
});

/**
 * POST /api/v1/inventory/storage-units
 * Create storage unit
 */
router.post('/storage-units', [
  body('name').trim().notEmpty(),
  body('code').trim().notEmpty(),
  body('type').isIn(['freezer', 'refrigerator']),
  body('capacity').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, code, type, location, temperatureMin, temperatureMax, capacity } = req.body;

    const unitId = uuidv4();
    await db.query(
      `INSERT INTO storage_units 
        (id, name, code, type, location, temperature_min, temperature_max, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [unitId, name, code, type, location || null, temperatureMin || null, temperatureMax || null, capacity || null]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'create_storage_unit',
      entityType: 'storage_unit',
      entityId: unitId,
      details: `Created ${type}: ${name}`
    });

    res.status(201).json({
      success: true,
      message: 'Storage unit created',
      data: { id: unitId }
    });
  } catch (error) {
    console.error('Create storage unit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create storage unit'
    });
  }
});

/**
 * GET /api/v1/inventory/alerts
 * Get inventory alerts (expiring, expired)
 */
router.get('/alerts', async (req, res) => {
  try {
    // Get expiring soon (within 24 hours)
    const [expiringSoon] = await db.query(
      `SELECT 
        mi.*,
        'expiring_soon' as alert_type,
        TIMESTAMPDIFF(HOUR, NOW(), mi.expires_at) as hours_remaining
      FROM milk_inventory mi
      WHERE mi.status = 'available'
        AND mi.expires_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
        AND mi.expires_at > NOW()
      ORDER BY mi.expires_at`
    );

    // Get expired
    const [expired] = await db.query(
      `SELECT 
        mi.*,
        'expired' as alert_type,
        TIMESTAMPDIFF(HOUR, mi.expires_at, NOW()) as hours_expired
      FROM milk_inventory mi
      WHERE mi.status = 'available'
        AND mi.expires_at < NOW()
      ORDER BY mi.expires_at DESC`
    );

    res.json({
      success: true,
      data: {
        expiringSoon,
        expired,
        totalAlerts: expiringSoon.length + expired.length
      }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts'
    });
  }
});

/**
 * GET /api/v1/inventory/stats
 * Get inventory statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Total by status
    const [statusStats] = await db.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(volume_ml), 0) as total_volume
       FROM milk_inventory
       GROUP BY status`
    );

    // Total by milk type
    const [typeStats] = await db.query(
      `SELECT milk_type, COUNT(*) as count, COALESCE(SUM(volume_ml), 0) as total_volume
       FROM milk_inventory
       WHERE status = 'available'
       GROUP BY milk_type`
    );

    // Total by storage type
    const [storageStats] = await db.query(
      `SELECT su.type as storage_type, COUNT(*) as count, COALESCE(SUM(mi.volume_ml), 0) as total_volume
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
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

module.exports = router;
