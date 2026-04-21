/**
 * Global Error Handler Middleware
 * Handles all errors and returns appropriate responses
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message || err);
  if (process.env.NODE_ENV !== 'production') {
    console.error('  Code:', err.code || 'none');
    console.error('  Path:', req.method, req.originalUrl);
  }

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = null;
  let errorCode = null;

  // MySQL connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    statusCode = 503;
    message = 'Database connection failed. The MySQL server may not be running.';
    errorCode = 'DB_CONNECTION_FAILED';
  }

  // MySQL protocol errors
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    statusCode = 503;
    message = 'Database access denied. Check DB_USER and DB_PASSWORD in .env configuration.';
    errorCode = 'DB_ACCESS_DENIED';
  }

  if (err.code === 'ER_BAD_DB_ERROR') {
    statusCode = 503;
    message = 'Database not found. Run database/schema.sql to create the milktracker database.';
    errorCode = 'DB_NOT_FOUND';
  }

  if (err.code === 'ER_NO_SUCH_TABLE') {
    statusCode = 503;
    message = 'Database tables missing. Run database/schema.sql to create the required tables.';
    errorCode = 'DB_TABLES_MISSING';
  }

  // MySQL query errors
  if (err.code && err.code.startsWith('ER_')) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409;
        message = 'Duplicate entry. This record already exists.';
        errorCode = 'DUPLICATE_ENTRY';
        break;
      case 'ER_NO_REFERENCED_ROW':
      case 'ER_NO_REFERENCED_ROW_2':
        statusCode = 400;
        message = 'Referenced record does not exist.';
        errorCode = 'REFERENCE_NOT_FOUND';
        break;
      case 'ER_BAD_NULL_ERROR':
        statusCode = 400;
        message = 'Required field is missing.';
        errorCode = 'REQUIRED_FIELD_MISSING';
        break;
      case 'ER_DATA_TOO_LONG':
        statusCode = 400;
        message = 'Input data too long for the field.';
        errorCode = 'DATA_TOO_LONG';
        break;
      default:
        if (!errorCode) {
          statusCode = 500;
          message = `Database error: ${err.code}`;
          errorCode = err.code;
        }
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = err.errors;
    errorCode = 'VALIDATION_FAILED';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    errorCode = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    errorCode = 'TOKEN_EXPIRED';
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: message,
    code: errorCode,
    errors: errors,
    ...(process.env.NODE_ENV !== 'production' && { 
      debug: {
        originalError: err.message,
        errorCode: err.code,
        stack: err.stack?.split('\n').slice(0, 5)
      }
    })
  });
};

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = 'ApiError';
  }
}

module.exports = {
  errorHandler,
  ApiError
};
