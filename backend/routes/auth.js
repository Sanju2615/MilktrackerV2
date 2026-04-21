/**
 * Authentication Routes
 * Login, logout, password reset
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../utils/db');
const auditService = require('../services/auditService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;

/**
 * POST /api/v1/auth/login
 * User login
 */
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('stationId').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { username, password, stationId } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    // Get user from database
    const [users] = await db.query(
      `SELECT u.id, u.employee_id, u.username, u.password_hash, u.first_name, u.last_name,
              u.email, u.role, u.status, u.login_attempts, u.last_login_at,
              u.primary_station_id, ns.name as primary_station_name
       FROM users u
       LEFT JOIN nurse_stations ns ON u.primary_station_id = ns.id
       WHERE u.username = ?`,
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    const user = users[0];

    // Check account status
    if (user.status === 'locked') {
      await auditService.log({
        userId: user.id,
        userName: `${user.first_name} ${user.last_name}`,
        action: 'login_failed',
        details: 'Account is locked',
        ipAddress,
        userAgent,
        stationId
      });

      return res.status(403).json({
        success: false,
        error: 'Account is locked. Please contact administrator.'
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment login attempts
      const newAttempts = (user.login_attempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

      await db.query(
        `UPDATE users SET login_attempts = ?, status = IF(?, 'locked', status) WHERE id = ?`,
        [newAttempts, shouldLock, user.id]
      );

      await auditService.log({
        userId: user.id,
        userName: `${user.first_name} ${user.last_name}`,
        action: 'login_failed',
        details: `Invalid password. Attempt ${newAttempts}/${MAX_LOGIN_ATTEMPTS}`,
        ipAddress,
        userAgent,
        stationId
      });

      return res.status(401).json({
        success: false,
        error: shouldLock 
          ? 'Account locked due to too many failed attempts. Contact administrator.'
          : 'Invalid username or password'
      });
    }

    // Get user's assigned stations
    const [stations] = await db.query(
      `SELECT s.id, s.name, s.code, us.is_primary
       FROM user_stations us
       JOIN nurse_stations s ON us.station_id = s.id
       WHERE us.user_id = ? AND s.is_active = true`,
      [user.id]
    );

    // Reset login attempts and update last login
    await db.query(
      `UPDATE users SET login_attempts = 0, last_login_at = NOW() WHERE id = ?`,
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Log successful login
    await auditService.log({
      userId: user.id,
      userName: `${user.first_name} ${user.last_name}`,
      action: 'login',
      details: `User logged in${stationId ? ` at station ${stationId}` : ''}`,
      ipAddress,
      userAgent,
      stationId
    });

    // Return user data and token
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          employeeId: user.employee_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          primaryStation: user.primary_station_id ? {
            id: user.primary_station_id,
            name: user.primary_station_name
          } : null,
          assignedStations: stations,
          lastLoginAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/auth/debug-login (PUBLIC - for testing only)
 * Debug login - returns user info without requiring auth
 */
router.post('/debug-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Get user from database
    const [users] = await db.query(
      `SELECT id, username, password_hash, first_name, last_name, email, role, status 
       FROM users WHERE username = ?`,
      [username]
    );
    
    if (users.length === 0) {
      return res.json({ success: false, error: 'User not found', username });
    }
    
    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    res.json({
      success: true,
      userFound: true,
      passwordValid: isPasswordValid,
      userStatus: user.status,
      userRole: user.role,
      message: isPasswordValid ? 'Password is correct!' : 'Password is incorrect'
    });
  } catch (error) {
    console.error('Debug login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/auth/logout
 * User logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'logout',
      details: 'User logged out',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.user
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

/**
 * POST /api/v1/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get current password hash
    const [users] = await db.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'change_password',
      details: 'Password changed successfully',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      details: error.message,
      code: error.code || undefined
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password (admin only)
 */
router.post('/reset-password', authenticate, async (req, res) => {
  try {
    // Check if user has permission
    if (!req.user.permissions.includes('user_edit')) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to reset passwords'
      });
    }

    const { userId, newPassword } = req.body;

    if (!userId || !newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'User ID and new password (min 8 chars) are required'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );

    await auditService.log({
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      action: 'reset_password',
      entityType: 'user',
      entityId: userId,
      details: 'Password reset by administrator',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      details: error.message,
      code: error.code || undefined
    });
  }
});

module.exports = router;
