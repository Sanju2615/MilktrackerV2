/**
 * Nurse Stations Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/v1/stations
 * Get all nurse stations
 */
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;

    let sql = 'SELECT * FROM nurse_stations WHERE 1=1';
    
    if (includeInactive !== 'true') {
      sql += ' AND is_active = true';
    }
    
    sql += ' ORDER BY name';

    const [stations] = await db.query(sql);

    res.json({
      success: true,
      data: stations
    });
  } catch (error) {
    console.error('Get stations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stations'
    });
  }
});

/**
 * GET /api/v1/stations/:id
 * Get station by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [stations] = await db.query(
      'SELECT * FROM nurse_stations WHERE id = ?',
      [id]
    );

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    res.json({
      success: true,
      data: stations[0]
    });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve station'
    });
  }
});

/**
 * POST /api/v1/stations
 * Create new station
 */
router.post('/', [
  body('name').trim().notEmpty(),
  body('code').trim().notEmpty(),
  body('location').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, code, location } = req.body;

    // Check if code exists
    const [existing] = await db.query(
      'SELECT id FROM nurse_stations WHERE code = ?',
      [code]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Station code already exists'
      });
    }

    const stationId = uuidv4();
    await db.query(
      'INSERT INTO nurse_stations (id, name, code, location) VALUES (?, ?, ?, ?)',
      [stationId, name, code, location]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'create_station',
      entityType: 'nurse_station',
      entityId: stationId,
      details: `Created station: ${name}`
    });

    res.status(201).json({
      success: true,
      message: 'Station created successfully',
      data: { id: stationId }
    });
  } catch (error) {
    console.error('Create station error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create station'
    });
  }
});

/**
 * PUT /api/v1/stations/:id
 * Update station
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, location, isActive } = req.body;

    const updates = [];
    const values = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (code) {
      updates.push('code = ?');
      values.push(code);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      values.push(location);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    values.push(id);
    await db.query(
      `UPDATE nurse_stations SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'update_station',
      entityType: 'nurse_station',
      entityId: id,
      details: 'Updated station information'
    });

    res.json({
      success: true,
      message: 'Station updated successfully'
    });
  } catch (error) {
    console.error('Update station error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update station'
    });
  }
});

module.exports = router;
