

const express = require('express');
const { query, validationResult } = require('express-validator');
const trakcareDb = require('../utils/trakcareDb');
const auditService = require('../services/auditService');

const router = express.Router();

// Prevent browser caching of TrakCare data – always return fresh results
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

/**
 * GET /api/v1/trakcare/babies
 * Get all babies from TrakCare SQL Server
 */
router.get('/babies', [
  query('search').optional().trim(),
  query('isActive').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { search, isActive, page = 1, limit = 50 } = req.query;

    const filters = {
      search,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    // Get babies from TrakCare SQL Server
    const babies = await trakcareDb.getBabies(filters);

    console.log(`TrakCare: Retrieved ${babies.length} babies from IRIS`);
    if (babies.length > 0) {
      console.log('TrakCare: Sample baby keys:', Object.keys(babies[0]).join(', '));
    }

    // Log access
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'view_trakcare_babies',
      details: `Retrieved ${babies.length} babies from TrakCare`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: babies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: babies.length, 
        totalPages: Math.ceil(babies.length / limit)
      }
    });
  } catch (error) {
    console.error('Get TrakCare babies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve babies from TrakCare',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/trakcare/babies/:mrn
 * Get a specific baby by MRN from TrakCare
 */
router.get('/babies/:mrn', async (req, res) => {
  try {
    const { mrn } = req.params;

    const baby = await trakcareDb.getBabyByMRN(mrn);

    if (!baby) {
      return res.status(404).json({
        success: false,
        error: 'Baby not found in TrakCare'
      });
    }

    // Log access
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'view_trakcare_baby',
      patientMrn: mrn,
      details: `Viewed baby details for MRN: ${mrn}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: baby
    });
  } catch (error) {
    console.error('Get TrakCare baby error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve baby from TrakCare',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/trakcare/orders
 * Get all feeding orders from TrakCare
 */
router.get('/orders', [
  query('patientMrn').optional().trim(),
  query('status').optional().isIn(['active', 'completed', 'cancelled', 'pending']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { patientMrn, status, page = 1, limit = 50 } = req.query;

    const filters = {
      patientMrn,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const orders = await trakcareDb.getOrders(filters);

    // Log access
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'view_trakcare_orders',
      patientMrn: patientMrn || null,
      details: `Retrieved ${orders.length} orders from TrakCare`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: orders.length,
        totalPages: Math.ceil(orders.length / limit)
      }
    });
  } catch (error) {
    console.error('Get TrakCare orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve orders from TrakCare',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/trakcare/orders/:orderId
 * Get a specific order by ID from TrakCare
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await trakcareDb.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found in TrakCare'
      });
    }

    // Log access
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'view_trakcare_order',
      patientMrn: order.patientMrn,
      details: `Viewed order details for OrderID: ${orderId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get TrakCare order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve order from TrakCare',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/trakcare/patients/:mrn/orders
 * Get all orders for a specific patient from TrakCare
 */
router.get('/patients/:mrn/orders', async (req, res) => {
  try {
    const { mrn } = req.params;
    const { status } = req.query;

    const orders = await trakcareDb.getPatientOrders(mrn, status);

    // Log access
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'view_patient_orders',
      patientMrn: mrn,
      details: `Retrieved ${orders.length} orders for patient ${mrn}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Get patient orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve patient orders from TrakCare',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/trakcare/health
 * Check TrakCare connection health
 */
router.get('/health', async (req, res) => {
  try {
    await trakcareDb.connect();
    res.json({
      success: true,
      message: 'TrakCare connection is healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'TrakCare connection failed',
      message: error.message
    });
  }
});

module.exports = router;
