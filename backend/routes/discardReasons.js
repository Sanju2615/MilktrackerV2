/**
 * Discard Reasons Routes
 * Manage discard reasons for milk inventory
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { camelizeRow, camelizeRows } = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/v1/discard-reasons
 * Get all discard reasons
 */
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;

    let sql = `
      SELECT id, reason_value, reason_label, description, icon_name,
             requires_notes, is_active, is_system, display_order
      FROM discard_reasons
      WHERE 1=1
    `;

    if (includeInactive !== 'true') {
      sql += ' AND is_active = true';
    }

    sql += ' ORDER BY display_order, reason_label';

    const [reasons] = await db.query(sql);

    res.json({
      success: true,
      data: camelizeRows(reasons)
    });
  } catch (error) {
    console.error('Get discard reasons error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve discard reasons',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/discard-reasons/:id
 * Get discard reason by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [reasons] = await db.query(
      'SELECT * FROM discard_reasons WHERE id = ?',
      [id]
    );

    if (reasons.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Discard reason not found'
      });
    }

    res.json({
      success: true,
      data: camelizeRow(reasons[0])
    });
  } catch (error) {
    console.error('Get discard reason error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve discard reason',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/discard-reasons
 * Create new discard reason
 */
router.post('/', [
  body('value').trim().notEmpty().matches(/^[a-z_]+$/),
  body('label').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('iconName').optional().trim(),
  body('requiresNotes').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { value, label, description, iconName = 'FileText', requiresNotes = false } = req.body;

    // Check if value exists
    const [existing] = await db.query(
      'SELECT id FROM discard_reasons WHERE reason_value = ?',
      [value]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Discard reason value already exists'
      });
    }

    const reasonId = uuidv4();
    await db.query(
      `INSERT INTO discard_reasons 
        (id, reason_value, reason_label, description, icon_name, requires_notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reasonId, value, label, description, iconName, requiresNotes, req.user.id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'create_discard_reason',
      entityType: 'discard_reason',
      entityId: reasonId,
      details: `Created discard reason: ${label}`
    });

    res.status(201).json({
      success: true,
      message: 'Discard reason created',
      data: { id: reasonId }
    });
  } catch (error) {
    console.error('Create discard reason error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create discard reason',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * PUT /api/v1/discard-reasons/:id
 * Update discard reason
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, description, iconName, requiresNotes } = req.body;

    // Check if system reason
    const [reasons] = await db.query(
      'SELECT is_system FROM discard_reasons WHERE id = ?',
      [id]
    );

    if (reasons.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Discard reason not found'
      });
    }

    const updates = [];
    const values = [];

    if (label) {
      updates.push('reason_label = ?');
      values.push(label);
    }
    if (description) {
      updates.push('description = ?');
      values.push(description);
    }
    if (iconName) {
      updates.push('icon_name = ?');
      values.push(iconName);
    }
    if (requiresNotes !== undefined) {
      updates.push('requires_notes = ?');
      values.push(requiresNotes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    values.push(id);
    await db.query(
      `UPDATE discard_reasons SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'update_discard_reason',
      entityType: 'discard_reason',
      entityId: id,
      details: 'Updated discard reason'
    });

    res.json({
      success: true,
      message: 'Discard reason updated'
    });
  } catch (error) {
    console.error('Update discard reason error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update discard reason',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * PUT /api/v1/discard-reasons/:id/toggle
 * Toggle discard reason active status
 */
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if system reason
    const [reasons] = await db.query(
      'SELECT is_system, is_active, reason_label FROM discard_reasons WHERE id = ?',
      [id]
    );

    if (reasons.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Discard reason not found'
      });
    }

    const newStatus = !reasons[0].is_active;

    await db.query(
      'UPDATE discard_reasons SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'toggle_discard_reason',
      entityType: 'discard_reason',
      entityId: id,
      details: `${newStatus ? 'Activated' : 'Deactivated'} discard reason: ${reasons[0].reason_label}`
    });

    res.json({
      success: true,
      message: `Discard reason ${newStatus ? 'activated' : 'deactivated'}`
    });
  } catch (error) {
    console.error('Toggle discard reason error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle discard reason',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * DELETE /api/v1/discard-reasons/:id
 * Delete discard reason (non-system only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if system reason
    const [reasons] = await db.query(
      'SELECT is_system, reason_label FROM discard_reasons WHERE id = ?',
      [id]
    );

    if (reasons.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Discard reason not found'
      });
    }

    if (reasons[0].is_system) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete system discard reasons'
      });
    }

    await db.query('DELETE FROM discard_reasons WHERE id = ?', [id]);

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'delete_discard_reason',
      entityType: 'discard_reason',
      entityId: id,
      details: `Deleted discard reason: ${reasons[0].reason_label}`
    });

    res.json({
      success: true,
      message: 'Discard reason deleted'
    });
  } catch (error) {
    console.error('Delete discard reason error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete discard reason',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
