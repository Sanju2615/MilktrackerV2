/**
 * System Configuration Routes
 */

const express = require('express');
const db = require('../utils/db');
const { camelizeRow, camelizeRows } = require('../utils/db');
const auditService = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/v1/config
 * Get all system configuration
 */
router.get('/', async (req, res) => {
  try {
    const [config] = await db.query('SELECT config_key, config_value, description FROM system_config');
    
    const configObj = {};
    config.forEach(item => {
      configObj[item.config_key] = {
        value: item.config_value,
        description: item.description
      };
    });

    res.json({
      success: true,
      data: configObj
    });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve configuration',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * GET /api/v1/config/:key
 * Get specific config value
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const [config] = await db.query(
      'SELECT config_key, config_value, description FROM system_config WHERE config_key = ?',
      [key]
    );

    if (config.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration key not found'
      });
    }

    res.json({
      success: true,
      data: camelizeRow(config[0])
    });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve configuration',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * PUT /api/v1/config/:key
 * Update configuration value
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    await db.query(
      'UPDATE system_config SET config_value = ?, updated_by = ? WHERE config_key = ?',
      [value, req.user.id, key]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'update_config',
      entityType: 'system_config',
      entityId: key,
      details: `Updated config ${key} to ${value}`
    });

    res.json({
      success: true,
      message: 'Configuration updated'
    });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
