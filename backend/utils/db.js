/**
 * Database Connection Utility
 * MySQL connection pool for MilkTracker
 * 
 * IMPORTANT: Uses pool.query() (not pool.execute()) for dynamic SQL queries.
 * pool.execute() uses prepared statements which fail with dynamic WHERE clauses
 * and LIMIT/OFFSET when params include undefined or type-mismatched values.
 */

const mysql = require('mysql2/promise');

/**
 * Convert a snake_case string to camelCase.
 * e.g., 'first_name' -> 'firstName', 'primary_station_id' -> 'primaryStationId'
 */
const snakeToCamel = (str) =>
  str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * Convert all keys in an object from snake_case to camelCase.
 * Returns a new object (does not mutate the original).
 */
const camelizeRow = (row) => {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const key of Object.keys(row)) {
    out[snakeToCamel(key)] = row[key];
  }
  return out;
};

/**
 * Convert all rows in an array from snake_case keys to camelCase keys.
 */
const camelizeRows = (rows) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map(camelizeRow);
};

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

// Connection state tracking
let dbConnected = false;
let lastConnectionError = null;

// Test connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✓ MySQL database connected successfully');
    console.log(`  Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
    console.log(`  Database: ${process.env.DB_NAME || 'milktracker'}`);
    console.log(`  User: ${process.env.DB_USER || 'root'}`);
    dbConnected = true;
    lastConnectionError = null;
    connection.release();
    return true;
  } catch (error) {
    dbConnected = false;
    lastConnectionError = error.message;
    console.error('✗ MySQL database connection failed:', error.message);
    console.error(`  Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
    console.error(`  Database: ${process.env.DB_NAME || 'milktracker'}`);
    console.error(`  User: ${process.env.DB_USER || 'root'}`);
    console.error(`  Error code: ${error.code || 'unknown'}`);
    return false;
  }
};

/**
 * Get database connection status
 */
const getStatus = () => ({
  connected: dbConnected,
  lastError: lastConnectionError,
  config: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'milktracker',
    user: process.env.DB_USER || 'root',
  }
});

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
    dbConnected = true;
    return [results, null];
  } catch (error) {
    dbConnected = false;
    lastConnectionError = error.message;
    console.error('Database query error:', error.message);
    console.error('  SQL:', sql.substring(0, 200));
    console.error('  Error code:', error.code || 'unknown');
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
    dbConnected = true;
    return result;
  } catch (error) {
    await connection.rollback();
    dbConnected = false;
    lastConnectionError = error.message;
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
  dbConnected = true;
  return result.insertId;
};

// Update and return affected rows
const update = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);
  const [result] = await pool.query(sql, sanitized);
  dbConnected = true;
  return result.affectedRows;
};

// Delete and return affected rows
const remove = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);
  const [result] = await pool.query(sql, sanitized);
  dbConnected = true;
  return result.affectedRows;
};

module.exports = {
  pool,
  testConnection,
  getStatus,
  query,
  transaction,
  getOne,
  getMany,
  insert,
  update,
  remove,
  camelizeRow,
  camelizeRows
};
