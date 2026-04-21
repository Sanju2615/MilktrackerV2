/**
 * Database Connection Utility
 * MySQL connection pool for MilkTracker
 * 
 * IMPORTANT: Uses pool.query() (not pool.execute()) for dynamic SQL queries.
 * pool.execute() uses prepared statements which fail with dynamic WHERE clauses
 * and LIMIT/OFFSET when params include undefined or type-mismatched values.
 */

const mysql = require('mysql2/promise');

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'milktracker',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// Test connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✓ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
};

/**
 * Sanitize params - replace undefined/null with proper MySQL null,
 * and ensure numeric LIMIT/OFFSET values are actual numbers.
 */
const sanitizeParams = (params = []) => {
  return params.map(p => {
    if (p === undefined) return null;
    return p;
  });
};

/**
 * Execute query with parameters.
 * Uses pool.query() (not pool.execute()) to avoid prepared statement issues
 * with dynamic SQL and LIMIT/OFFSET clauses.
 */
const query = async (sql, params = []) => {
  try {
    const sanitized = sanitizeParams(params);
    const [results] = await pool.query(sql, sanitized);
    return [results, null];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Execute transaction
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Get single row
const getOne = async (sql, params = []) => {
  const [results] = await query(sql, params);
  return results[0] || null;
};

// Get multiple rows
const getMany = async (sql, params = []) => {
  const [results] = await query(sql, params);
  return results;
};

// Insert and return ID
const insert = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);
  const [result] = await pool.query(sql, sanitized);
  return result.insertId;
};

// Update and return affected rows
const update = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);
  const [result] = await pool.query(sql, sanitized);
  return result.affectedRows;
};

// Delete and return affected rows
const remove = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);
  const [result] = await pool.query(sql, sanitized);
  return result.affectedRows;
};

module.exports = {
  pool,
  testConnection,
  query,
  transaction,
  getOne,
  getMany,
  insert,
  update,
  remove
};
