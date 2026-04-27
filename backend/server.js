/**
 * Human Milk Tracker - Backend Server
 * King's College Hospital Jeddah
 * HIMSS 6 Compliant API Server
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const db = require('./utils/db');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const stationRoutes = require('./routes/stations');
const milkRoutes = require('./routes/milk');
const feedingRoutes = require('./routes/feeding');
const inventoryRoutes = require('./routes/inventory');
const auditRoutes = require('./routes/audit');
const discardReasonRoutes = require('./routes/discardReasons');
const trakcareRoutes = require('./routes/trakcare');
const reportRoutes = require('./routes/reports');
const configRoutes = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;

// Disable ETag to prevent 304 responses for API endpoints
app.set('etag', false);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any sandbox.novita.ai subdomain (for dev/test sandboxes)
    if (/\.sandbox\.novita\.ai$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check endpoint (PUBLIC - no auth required)
app.get('/health', (req, res) => {
  const dbStatus = db.getStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    database: {
      mysql: dbStatus.connected ? 'connected' : 'disconnected',
      lastError: dbStatus.lastError
    }
  });
});

// MySQL Database health check (PUBLIC - no auth required)
app.get('/api/v1/db/health', async (req, res) => {
  try {
    const connected = await db.testConnection();
    if (connected) {
      // Verify tables exist
      const [tables] = await db.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
        [process.env.DB_NAME || 'milktracker']
      );
      const tableNames = tables.map(t => t.TABLE_NAME);

      res.json({
        success: true,
        message: 'MySQL database connected',
        tables: tableNames,
        config: {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || '3306',
          database: process.env.DB_NAME || 'milktracker'
        }
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'MySQL database connection failed',
        error: db.getStatus().lastError,
        config: {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || '3306',
          database: process.env.DB_NAME || 'milktracker'
        }
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'MySQL database health check failed',
      error: error.message
    });
  }
});

// TrakCare health check (PUBLIC - no auth required)
app.get('/api/v1/trakcare/health', async (req, res) => {
  try {
    const trakcareDb = require('./utils/trakcareDb');
    if (trakcareDb.isTrakCareConnected()) {
      res.json({
        success: true,
        message: 'TrakCare connection is healthy',
        timestamp: new Date().toISOString()
      });
    } else {
      // Try to connect
      await trakcareDb.connect();
      res.json({
        success: true,
        message: 'TrakCare connection established',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // TrakCare not available - expected if IRIS server is unreachable
    res.status(503).json({
      success: false,
      message: 'TrakCare not available - IRIS server unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/stations', authenticate, stationRoutes);
app.use('/api/v1/milk', authenticate, milkRoutes);
app.use('/api/v1/feeding', authenticate, feedingRoutes);
app.use('/api/v1/inventory', authenticate, inventoryRoutes);
app.use('/api/v1/audit', authenticate, auditRoutes);
app.use('/api/v1/discard-reasons', authenticate, discardReasonRoutes);
app.use('/api/v1/trakcare', authenticate, trakcareRoutes);
app.use('/api/v1/reports', authenticate, reportRoutes);
app.use('/api/v1/config', authenticate, configRoutes);

// Serve static files (frontend) in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// 404 handler (must be before errorHandler to catch unmatched routes)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error handling (catches errors thrown via next(error) from routes)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     Human Milk Tracker - Backend Server                      ║
║     King's College Hospital Jeddah                           ║
║                                                              ║
║     Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(32 - (process.env.NODE_ENV || 'development').length)}║
║     Port: ${PORT}${' '.repeat(43)}║
║     API Base: ${process.env.API_BASE_URL || '/api/v1'}${' '.repeat(37 - (process.env.API_BASE_URL || '/api/v1').length)}║
║                                                              ║
║     HIMSS 6 Compliant | FHIR R4 | HL7 v2.x                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Test MySQL database connection on startup
  db.testConnection()
    .then(connected => {
      if (!connected) {
        console.warn('⚠ MySQL database not reachable on startup');
        console.warn('  Users, audit logs, inventory, feeding APIs will not work');
        console.warn('  TrakCare patient/order queries will still work via IRIS');
        console.warn('  Run database/schema.sql to create the database and tables');
      }
    })
    .catch(err => console.warn('⚠ MySQL startup check error:', err.message));

  // Auto-connect to TrakCare on startup
  try {
    const trakcareDb = require('./utils/trakcareDb');
    trakcareDb.connect()
      .then(() => console.log('✓ TrakCare IRIS connected on startup'))
      .catch(err => console.warn('⚠ TrakCare IRIS not reachable on startup:', err.message));
  } catch (_) { /* ignore */ }
});

module.exports = app;
