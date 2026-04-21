/**
 * Authentication Middleware
 * Validates JWT tokens and sets req.user
 */

const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Authenticate middleware - validates JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const [users] = await db.query(
      `SELECT u.id, u.employee_id, u.username, u.first_name, u.last_name, 
              u.email, u.role, u.status, u.primary_station_id, u.last_login_at,
              ns.name as primary_station_name
       FROM users u
       LEFT JOIN nurse_stations ns ON u.primary_station_id = ns.id
       WHERE u.id = ? AND u.status = 'active'`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found or account is inactive.'
      });
    }

    const user = users[0];
    
    // Get user permissions based on role
    const permissions = getRolePermissions(user.role);
    
    // Get user's assigned stations
    const [stations] = await db.query(
      `SELECT s.id, s.name, s.code, us.is_primary
       FROM user_stations us
       JOIN nurse_stations s ON us.station_id = s.id
       WHERE us.user_id = ? AND s.is_active = true`,
      [user.id]
    );

    // Set user info on request
    req.user = {
      id: user.id,
      employeeId: user.employee_id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      permissions,
      primaryStation: user.primary_station_id ? {
        id: user.primary_station_id,
        name: user.primary_station_name
      } : null,
      assignedStations: stations,
      lastLoginAt: user.last_login_at
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Please log in again.'
      });
    }

    console.error('Auth middleware error:', error);
    
    // Detect MySQL connection errors so frontend can show a helpful message
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        success: false,
        error: 'Database unavailable. The MySQL server may not be running.',
        code: 'DB_CONNECTION_FAILED',
        details: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication failed.',
      details: error.message,
      code: error.code || undefined
    });
  }
};

/**
 * Get permissions for a role
 */
const getRolePermissions = (role) => {
  const rolePermissions = {
    admin: [
      'patient_view', 'patient_create', 'patient_edit', 'patient_delete',
      'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
      'administer_feeding', 'administer_verify', 'administer_override',
      'inventory_view', 'inventory_manage', 'inventory_discard',
      'user_view', 'user_create', 'user_edit', 'user_delete', 'user_assign_station',
      'audit_view', 'audit_export',
      'system_settings', 'report_view', 'report_export'
    ],
    nurse_manager: [
      'patient_view', 'patient_create', 'patient_edit',
      'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
      'administer_feeding', 'administer_verify', 'administer_override',
      'inventory_view', 'inventory_manage', 'inventory_discard',
      'user_view', 'user_edit', 'user_assign_station',
      'audit_view',
      'report_view', 'report_export'
    ],
    nurse: [
      'patient_view',
      'order_view',
      'administer_feeding', 'administer_verify',
      'inventory_view', 'inventory_manage',
      'report_view'
    ],
    physician: [
      'patient_view', 'patient_create', 'patient_edit',
      'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
      'administer_feeding', 'administer_verify',
      'inventory_view',
      'report_view'
    ],
    technician: [
      'patient_view',
      'inventory_view', 'inventory_manage',
      'report_view'
    ],
    viewer: [
      'patient_view',
      'order_view',
      'inventory_view',
      'report_view'
    ]
  };

  return rolePermissions[role] || [];
};

/**
 * Check permission middleware factory
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action.'
      });
    }

    next();
  };
};

/**
 * Check multiple permissions (ANY)
 */
const requireAnyPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    const hasPermission = permissions.some(p => req.user.permissions.includes(p));
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action.'
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  requirePermission,
  requireAnyPermission,
  getRolePermissions
};
