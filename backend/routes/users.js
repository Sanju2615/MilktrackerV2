/**
 * User Management Routes
 * CRUD operations for users and stations
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auditService = require('../services/auditService');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/v1/users
 * Get all users
 */
router.get('/', async (req, res) => {
  try {
    let { role, status, search, page, limit } = req.query;

    // Handle undefined/null string values from frontend
    if (role === 'undefined' || role === 'null' || role === '') role = undefined;
    if (status === 'undefined' || status === 'null' || status === '') status = undefined;
    if (search === 'undefined' || search === 'null' || search === '') search = undefined;

    // Parse and validate pagination parameters - handle string "undefined"
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    // Ensure valid numbers
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100; // Max limit
    
    // Ensure integers for SQL
    page = Math.floor(page);
    limit = Math.floor(limit);

    let sql = `
      SELECT 
        u.id, u.employee_id, u.username, u.first_name, u.last_name,
        u.email, u.phone, u.role, u.status, u.last_login_at,
        u.primary_station_id, u.created_at, u.updated_at,
        ns.name as primary_station_name
      FROM users u
      LEFT JOIN nurse_stations ns ON u.primary_station_id = ns.id
      WHERE 1=1
    `;

    const params = [];

    if (role) {
      sql += ' AND u.role = ?';
      params.push(role);
    }

    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    if (search) {
      sql += ` AND (
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.username LIKE ? OR
        u.email LIKE ? OR
        u.employee_id LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Count total
    const countSql = sql.replace(/SELECT.*?FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    // Add pagination - ensure integers for MySQL
    const offset = (page - 1) * limit;
    sql += ` ORDER BY u.first_name, u.last_name LIMIT ${limit} OFFSET ${offset}`;
    const [users] = await db.query(sql, params);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: page,
        limit: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users'
    });
  }
});

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await db.query(
      `SELECT 
        u.id, u.employee_id, u.username, u.first_name, u.last_name,
        u.email, u.phone, u.role, u.status, u.last_login_at,
        u.primary_station_id, u.created_at, u.updated_at,
        ns.name as primary_station_name
      FROM users u
      LEFT JOIN nurse_stations ns ON u.primary_station_id = ns.id
      WHERE u.id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get assigned stations
    const [stations] = await db.query(
      `SELECT s.id, s.name, s.code, us.is_primary
       FROM user_stations us
       JOIN nurse_stations s ON us.station_id = s.id
       WHERE us.user_id = ? AND s.is_active = true`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...users[0],
        assignedStations: stations
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user'
    });
  }
});

/**
 * POST /api/v1/users
 * Create new user
 */
router.post('/', [
  requirePermission('user_create'),
  body('employeeId').trim().notEmpty(),
  body('username').trim().notEmpty(),
  body('password').isLength({ min: 8 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('email').isEmail(),
  body('role').isIn(['admin', 'nurse_manager', 'nurse', 'physician', 'technician', 'viewer'])
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
      employeeId, username, password, firstName, lastName,
      email, phone, role, primaryStationId
    } = req.body;

    // Check if username exists
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ? OR employee_id = ?',
      [username, employeeId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Username or employee ID already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    await db.query(
      `INSERT INTO users 
        (id, employee_id, username, password_hash, first_name, last_name, email, phone, role, primary_station_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, employeeId, username, hashedPassword, firstName, lastName, email, phone, role, primaryStationId, req.user.id]
    );

    // Assign to primary station if provided
    if (primaryStationId) {
      await db.query(
        'INSERT INTO user_stations (id, user_id, station_id, is_primary, assigned_by) VALUES (?, ?, ?, true, ?)',
        [uuidv4(), userId, primaryStationId, req.user.id]
      );
    }

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'create_user',
      entityType: 'user',
      entityId: userId,
      details: `Created user: ${firstName} ${lastName} (${role})`
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { id: userId }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

/**
 * PUT /api/v1/users/:id
 * Update user
 */
router.put('/:id', [
  requirePermission('user_edit'),
  param('id').notEmpty(),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('email').optional().isEmail(),
  body('role').optional().isIn(['admin', 'nurse_manager', 'nurse', 'physician', 'technician', 'viewer'])
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
    const updates = req.body;

    // Build update query
    const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'role', 'primary_station_id'];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = ?`);
        values.push(value);
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    values.push(id);

    await db.query(
      `UPDATE users SET ${setClause.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
      [...values.slice(0, -1), req.user.id, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'update_user',
      entityType: 'user',
      entityId: id,
      details: 'Updated user information'
    });

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * PUT /api/v1/users/:id/status
 * Update user status
 */
router.put('/:id/status', [
  requirePermission('user_edit'),
  body('status').isIn(['active', 'inactive', 'locked']),
  body('reason').notEmpty()
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
    const { status, reason } = req.body;

    await db.query(
      'UPDATE users SET status = ?, updated_at = NOW(), updated_by = ? WHERE id = ?',
      [status, req.user.id, id]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'change_user_status',
      entityType: 'user',
      entityId: id,
      details: `Status changed to ${status}. Reason: ${reason}`
    });

    res.json({
      success: true,
      message: `User status changed to ${status}`
    });
  } catch (error) {
    console.error('Change status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change user status'
    });
  }
});

/**
 * PUT /api/v1/users/:id/stations
 * Assign stations to user
 */
router.put('/:id/stations', [
  requirePermission('user_assign_station'),
  body('stationIds').isArray(),
  body('primaryStationId').optional()
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
    const { stationIds, primaryStationId } = req.body;

    await db.transaction(async (conn) => {
      // Remove existing assignments
      await conn.execute('DELETE FROM user_stations WHERE user_id = ?', [id]);

      // Add new assignments
      for (const stationId of stationIds) {
        await conn.execute(
          'INSERT INTO user_stations (id, user_id, station_id, is_primary, assigned_by) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), id, stationId, stationId === primaryStationId, req.user.id]
        );
      }

      // Update primary station
      if (primaryStationId) {
        await conn.execute(
          'UPDATE users SET primary_station_id = ? WHERE id = ?',
          [primaryStationId, id]
        );
      }
    });

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'assign_stations',
      entityType: 'user',
      entityId: id,
      details: `Assigned stations: ${stationIds.join(', ')}`
    });

    res.json({
      success: true,
      message: 'Stations assigned successfully'
    });
  } catch (error) {
    console.error('Assign stations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign stations'
    });
  }
});

// ==================== STATIONS ROUTES ====================

/**
 * GET /api/v1/users/stations
 * Get all stations
 */
router.get('/stations/all', async (req, res) => {
  try {
    const [stations] = await db.query(
      'SELECT * FROM nurse_stations WHERE is_active = true ORDER BY name'
    );

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
 * POST /api/v1/users/stations
 * Create new station
 */
router.post('/stations', [
  requirePermission('system_settings'),
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

module.exports = router;
