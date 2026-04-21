/**
 * Audit Log Routes
 * HIMSS 6 Compliant Audit Trail
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/v1/audit/logs
 * Get audit logs with filters
 */
router.get('/logs', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let {
      userId, action, patientMrn, entityType, search,
      startDate, endDate, page, limit
    } = req.query;

    // Parse and validate pagination parameters
    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const filters = {
      userId,
      action,
      patientMrn,
      entityType,
      search,
      startDate,
      endDate
    };

    const result = await auditService.getLogs(filters, page, limit);

    res.json({
      success: true,
      data: result.logs,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/audit/log
 * Log an action from client
 */
router.post('/log', async (req, res) => {
  try {
    const { action, entityType, entityId, patientMrn, orderId, details } = req.body;

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action,
      entityType,
      entityId,
      patientMrn,
      orderId,
      details,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Action logged successfully'
    });
  } catch (error) {
    console.error('Log action error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log action',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/audit/stats
 * Get audit statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    
    const stats = await auditService.getStats(
      startDate || defaultStart.toISOString(),
      endDate || new Date().toISOString()
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit statistics',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
