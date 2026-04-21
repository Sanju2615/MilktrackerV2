/**
 * Audit Logging Service
 * HIMSS 6 Compliant Audit Trail
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { camelizeRows } = require('../utils/db');

/**
 * Helper: Check if a value is actually defined
 */
const isDefined = (val) => val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null';

/**
 * Log an audit event
 */
const log = async ({
  userId,
  userName,
  action,
  entityType = null,
  entityId = null,
  patientMrn = null,
  details = null,
  ipAddress = null,
  userAgent = null,
  stationId = null
}) => {
  try {
    const sql = `
      INSERT INTO audit_logs 
        (id, user_id, user_name, action, entity_type, entity_id, patient_mrn, details, ip_address, user_agent, station_id, created_at)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    await db.query(sql, [
      uuidv4(),
      userId || null,
      userName || null,
      action,
      entityType || null,
      entityId || null,
      patientMrn || null,
      details || null,
      ipAddress || null,
      userAgent || null,
      stationId || null
    ]);
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw - audit logging should not break the application
  }
};

/**
 * Get audit logs with filters
 */
const getLogs = async (filters = {}, page = 1, limit = 50) => {
  try {
    let sql = `
      SELECT 
        al.id,
        al.user_id,
        al.user_name,
        al.action,
        al.entity_type,
        al.entity_id,
        al.patient_mrn,
        al.details,
        al.ip_address,
        al.station_id,
        al.created_at,
        ns.name as station_name
      FROM audit_logs al
      LEFT JOIN nurse_stations ns ON al.station_id = ns.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (isDefined(filters.userId)) {
      sql += ' AND al.user_id = ?';
      params.push(filters.userId);
    }
    
    if (isDefined(filters.action)) {
      sql += ' AND al.action = ?';
      params.push(filters.action);
    }
    
    if (isDefined(filters.patientMrn)) {
      sql += ' AND al.patient_mrn = ?';
      params.push(filters.patientMrn);
    }
    
    if (isDefined(filters.entityType)) {
      sql += ' AND al.entity_type = ?';
      params.push(filters.entityType);
    }
    
    if (isDefined(filters.startDate)) {
      sql += ' AND al.created_at >= ?';
      params.push(filters.startDate);
    }
    
    if (isDefined(filters.endDate)) {
      sql += ' AND al.created_at <= ?';
      params.push(filters.endDate);
    }
    
    if (isDefined(filters.search)) {
      sql += ` AND (
        al.user_name LIKE ? OR 
        al.details LIKE ? OR 
        al.patient_mrn LIKE ?
      )`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Count total
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/m, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0]?.total || 0;
    
    // Add pagination - ensure integers for MySQL
    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    params.push(limitNum, (pageNum - 1) * limitNum);
    
    const [logs] = await db.query(sql, params);
    
    return {
      logs: camelizeRows(logs),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  } catch (error) {
    console.error('Get audit logs error:', error);
    throw error;
  }
};

/**
 * Get audit statistics
 */
const getStats = async (startDate, endDate) => {
  try {
    const sql = `
      SELECT 
        action,
        COUNT(*) as count
      FROM audit_logs
      WHERE created_at BETWEEN ? AND ?
      GROUP BY action
      ORDER BY count DESC
    `;
    
    const [stats] = await db.query(sql, [startDate, endDate]);
    return camelizeRows(stats);
  } catch (error) {
    console.error('Get audit stats error:', error);
    throw error;
  }
};

/**
 * Clean old audit logs
 */
const cleanOldLogs = async (retentionDays = 365) => {
  try {
    const sql = `
      DELETE FROM audit_logs
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    
    const [result] = await db.query(sql, [retentionDays]);
    return result.affectedRows;
  } catch (error) {
    console.error('Clean old logs error:', error);
    throw error;
  }
};

module.exports = {
  log,
  getLogs,
  getStats,
  cleanOldLogs
};
