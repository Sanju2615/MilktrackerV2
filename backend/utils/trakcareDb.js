/**
 * TrakCare Database Connection Utility
 * Connects to InterSystems IRIS via the Native API SDK
 * Reads baby and order data from the Custom_MEKC_INT_Operational views
 *
 * Required npm package: @intersystems/intersystems-iris-native
 * Connects over the IRIS Super Server protocol (port 56772)
 *
 * IMPORTANT – IRIS SQL via Native API quirks addressed here:
 *   1. No column aliases (AS ...) – IRIS parser can mangle them.
 *      We SELECT bare column names and map positionally in JS.
 *   2. No bind-parameter placeholders (?) – values are inlined safely.
 *   3. No OFFSET/FETCH NEXT – use TOP N for row limiting.
 *   4. No WHERE 1=1 – build WHERE clauses conditionally.
 *   5. Use %GetData(position) exclusively – %Get(name) does not exist
 *      on %SQL.StatementResult in all IRIS versions.
 *   6. Use %SYSTEM.SQL Execute() as primary path – it's simpler and
 *      avoids %Prepare parsing issues seen with %SQL.Statement.
 */

const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// 1. Load the IRIS Native SDK (with binary-path fixup for Debian / Docker)
// ---------------------------------------------------------------------------
let irisnative   = null;
let irisLoadError = null;

try {
  const binDir    = path.join(__dirname, '..', 'node_modules', '@intersystems',
                              'intersystems-iris-native', 'bin');
  const rhxDir    = path.join(binDir, 'lnxrhx64');
  const dockerDir = path.join(binDir, 'dockerubuntux64');
  if (!fs.existsSync(rhxDir) && fs.existsSync(dockerDir)) {
    try { fs.symlinkSync('dockerubuntux64', rhxDir); } catch (_) { /* ignore */ }
  }
  irisnative = require('@intersystems/intersystems-iris-native');
} catch (error) {
  irisLoadError = error.message;
  console.warn('WARNING: IRIS Native SDK not available:', error.message);
}

// ---------------------------------------------------------------------------
// 2. Configuration
// ---------------------------------------------------------------------------
const TRAKCARE_CONFIG = {
  host:      process.env.TRAKCARE_HOST      || '100.96.26.65',
  port:      parseInt(process.env.TRAKCARE_PORT || '56772', 10),
  namespace: process.env.TRAKCARE_NAMESPACE  || 'TRAK',
  user:      process.env.TRAKCARE_USER       || 'mekc-skumar',
  password:  process.env.TRAKCARE_PASSWORD   || 'KCHJ@1234',
  timeout:   parseInt(process.env.TRAKCARE_TIMEOUT || '10', 10),
};

// ---------------------------------------------------------------------------
// 3. Connection state
// ---------------------------------------------------------------------------
let connection   = null;
let irisInstance = null;
let isConnected  = false;

// ---------------------------------------------------------------------------
// 4. Connect / disconnect helpers
// ---------------------------------------------------------------------------
const connect = async () => {
  if (!irisnative) {
    throw new Error('IRIS Native SDK not available: ' + irisLoadError);
  }
  if (connection && !connection.isClosed()) {
    return irisInstance;
  }
  try {
    console.log(`Connecting to TrakCare IRIS at ${TRAKCARE_CONFIG.host}:${TRAKCARE_CONFIG.port} ns=${TRAKCARE_CONFIG.namespace} ...`);
    connection = irisnative.createConnection({
      host:         TRAKCARE_CONFIG.host,
      port:         TRAKCARE_CONFIG.port,
      ns:           TRAKCARE_CONFIG.namespace,
      user:         TRAKCARE_CONFIG.user,
      pwd:          TRAKCARE_CONFIG.password,
      timeout:      TRAKCARE_CONFIG.timeout,
      sharedmemory: false,
    });
    irisInstance = connection.createIris();
    isConnected  = true;
    console.log('TrakCare (InterSystems IRIS) connected successfully via Native API');
    return irisInstance;
  } catch (error) {
    isConnected  = false;
    connection   = null;
    irisInstance = null;
    console.error('TrakCare connection failed:', error.message);
    throw error;
  }
};

const isTrakCareConnected = () => {
  if (!connection) return false;
  try { return !connection.isClosed(); } catch (_) { return false; }
};

// ---------------------------------------------------------------------------
// 5. SQL helpers
// ---------------------------------------------------------------------------

/**
 * Convert a value returned by the IRIS Native API to a plain JS type.
 * The SDK can return BigInt for integer columns – JSON.stringify and
 * Express's res.json() cannot serialise BigInt, so we convert it here.
 */
function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') {
    // If the value fits safely in a Number, convert; otherwise use String
    return (val >= Number.MIN_SAFE_INTEGER && val <= Number.MAX_SAFE_INTEGER)
      ? Number(val)
      : String(val);
  }
  return val;
}

/**
 * BigInt-safe JSON.stringify for debug logging.
 */
function safeStringify(obj) {
  return JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/**
 * Safely escape a value for inline SQL.
 *   Strings  → 'value' (single quotes doubled)
 *   Numbers  → number literal
 *   null     → NULL
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  // Treat boolean
  if (typeof val === 'boolean') return val ? '1' : '0';
  // String – escape single quotes
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/**
 * Execute a SQL query via the IRIS Native API.
 *
 * Strategy:
 *   A) Primary: %SYSTEM.SQL  Execute()  – one-step, avoids %Prepare pitfalls.
 *   B) Fallback: %SQL.Statement %New  → %Prepare → %Execute.
 *
 * All parameters MUST already be inlined into `sql` (no ? placeholders).
 * Columns are read positionally with %GetData(1..N).
 *
 * @param {string}   sql           – complete SQL text (no placeholders)
 * @param {string[]} columnKeys    – JS property names for each column, in SELECT order
 * @returns {Object[]}             – array of plain objects keyed by columnKeys
 */
const executeQuery = async (sql, columnKeys) => {
  const iris = await connect();
  const colCount = columnKeys.length;

  console.log('[TrakCare SQL] Executing:', sql.replace(/\s+/g, ' ').trim());
  console.log('[TrakCare SQL] Expected columns:', colCount, '→', columnKeys.join(', '));

  // ------------------------------------------------------------------
  // Approach A: %SYSTEM.SQL  Execute(sql)
  // Returns a %SQL.StatementResult (result set).
  // ------------------------------------------------------------------
  let resultSet = null;
  let usedApproach = '';

  try {
    resultSet = iris.classMethodObject('%SYSTEM.SQL', 'Execute', sql);
    usedApproach = '%SYSTEM.SQL.Execute';
    console.log('[TrakCare SQL] %SYSTEM.SQL.Execute succeeded');
  } catch (e) {
    console.log('[TrakCare SQL] %SYSTEM.SQL.Execute failed:', e.message, '– trying %SQL.Statement fallback');
  }

  // ------------------------------------------------------------------
  // Approach B: %SQL.Statement  %New → %Prepare → %Execute
  // ------------------------------------------------------------------
  if (!resultSet) {
    try {
      const stmt   = iris.classMethodObject('%SQL.Statement', '%New');
      const status = stmt.invoke('%Prepare', sql);
      console.log('[TrakCare SQL] %Prepare status:', status, '(type:', typeof status, ')');

      if (status !== 1 && status !== '1') {
        console.warn('[TrakCare SQL] %Prepare returned non-OK status – query may fail');
      }

      resultSet = stmt.invokeObject('%Execute');
      usedApproach = '%SQL.Statement';
      console.log('[TrakCare SQL] %SQL.Statement execute succeeded');
    } catch (e2) {
      console.error('[TrakCare SQL] Both query approaches failed:', e2.message);
      throw new Error('TrakCare SQL execution failed: ' + e2.message);
    }
  }

  // ------------------------------------------------------------------
  // Read SQLCODE (best-effort – may not exist on all result types)
  // ------------------------------------------------------------------
  try {
    // %SQL.StatementResult exposes %SQLCODE as a property
    const sqlCode = resultSet.invoke('%Get', '%SQLCODE');
    console.log('[TrakCare SQL] SQLCODE:', sqlCode);
    if (sqlCode && Number(sqlCode) < 0) {
      let msg = '';
      try { msg = resultSet.invoke('%Get', '%Message'); } catch (_) {}
      console.error('[TrakCare SQL] SQL error:', sqlCode, msg);
    }
  } catch (_) {
    // %Get may not exist – that's OK, we'll rely on %Next
    console.log('[TrakCare SQL] (SQLCODE not readable via %Get – expected on some IRIS versions)');
  }

  // ------------------------------------------------------------------
  // Iterate rows with %Next / %GetData
  // ------------------------------------------------------------------
  const rows = [];
  let rowCount = 0;

  // Try different iteration patterns – %Next() returns 1 while rows exist
  let hasRow = false;
  try {
    // Try invokeBoolean first – it's the intended API for boolean returns
    hasRow = resultSet.invokeBoolean('%Next');
    console.log('[TrakCare SQL] First %Next (invokeBoolean):', hasRow);
  } catch (e) {
    console.log('[TrakCare SQL] invokeBoolean(%Next) failed:', e.message, '– trying invoke');
    try {
      const nextVal = resultSet.invoke('%Next');
      hasRow = (nextVal === 1 || nextVal === '1' || nextVal === true);
      console.log('[TrakCare SQL] First %Next (invoke):', nextVal, '→ hasRow:', hasRow);
    } catch (e2) {
      console.error('[TrakCare SQL] %Next failed entirely:', e2.message);
      hasRow = false;
    }
  }

  while (hasRow) {
    const row = {};
    for (let i = 0; i < colCount; i++) {
      try {
        row[columnKeys[i]] = normalizeValue(resultSet.invoke('%GetData', i + 1));
      } catch (_) {
        row[columnKeys[i]] = null;
      }
    }
    rows.push(row);
    rowCount++;

    if (rowCount === 1) {
      console.log('[TrakCare SQL] First row:', safeStringify(row));
    }

    // Advance to next row
    try {
      hasRow = resultSet.invokeBoolean('%Next');
    } catch (_) {
      try {
        const nv = resultSet.invoke('%Next');
        hasRow = (nv === 1 || nv === '1' || nv === true);
      } catch (_2) {
        hasRow = false;
      }
    }
  }

  console.log(`[TrakCare SQL] Total rows: ${rowCount} (approach: ${usedApproach})`);

  // Cleanup
  try { resultSet.close(); } catch (_) {}

  return rows;
};

// ---------------------------------------------------------------------------
// 6. Domain functions – Babies
// ---------------------------------------------------------------------------

/**
 * Column names in the database (in SELECT order).
 * These are the REAL column names – no aliases.
 */
const BABY_DB_COLUMNS = [
  'BabyID', 'MRN', 'FirstName', 'LastName', 'DateOfBirth',
  'Gender', 'MotherName', 'MotherMRN', 'Room', 'Bed',
  'AdmissionDate', 'IsActive',
];

/**
 * Corresponding JS keys for the API response.
 * Must be in the same order as BABY_DB_COLUMNS.
 */
const BABY_JS_KEYS = [
  'patientId', 'mrn', 'firstName', 'lastName', 'dateOfBirth',
  'gender', 'motherName', 'motherMrn', 'room', 'bed',
  'admissionDate', 'isActive',
];

const BABY_TABLE = 'Custom_MEKC_INT_Operational.MilkTrackerBabies';

/**
 * Get all babies from TrakCare, with optional filters.
 */
const getBabies = async (filters = {}) => {
  // Build SELECT – plain column names, no aliases
  const selectCols = BABY_DB_COLUMNS.join(', ');

  // Build WHERE conditions (all values inlined)
  const conditions = [];

  if (filters.isActive !== undefined) {
    conditions.push(`IsActive = ${filters.isActive ? 1 : 0}`);
  }

  if (filters.search) {
    const s = sqlEscape('%' + filters.search + '%');
    conditions.push(`(FirstName LIKE ${s} OR LastName LIKE ${s} OR MRN LIKE ${s} OR MotherName LIKE ${s})`);
  }

  if (filters.mrn) {
    conditions.push(`MRN = ${sqlEscape(filters.mrn)}`);
  }

  const whereClause = conditions.length > 0
    ? ' WHERE ' + conditions.join(' AND ')
    : '';

  const orderBy = ' ORDER BY FirstName, LastName';

  // Pagination via TOP N (IRIS-compatible)
  let topClause = '';
  if (filters.limit) {
    const limit = parseInt(filters.limit, 10);
    topClause = ` TOP ${limit}`;
    // Note: IRIS TOP does not support OFFSET.  For page > 1 we would need
    // a subquery or %ROWID approach.  For now we fetch TOP N for page 1
    // (which covers the 50-record default) and rely on client-side paging
    // for further pages if needed.
  }

  const sql = `SELECT${topClause} ${selectCols} FROM ${BABY_TABLE}${whereClause}${orderBy}`;

  const rows = await executeQuery(sql, BABY_JS_KEYS);

  console.log(`[TrakCare] getBabies: ${rows.length} rows returned`);
  if (rows.length > 0) {
    console.log('[TrakCare] Sample row keys:', Object.keys(rows[0]).join(', '));
  }

  return rows;
};

/**
 * Get a single baby by MRN.
 */
const getBabyByMRN = async (mrn) => {
  const selectCols = BABY_DB_COLUMNS.join(', ');
  const sql = `SELECT ${selectCols} FROM ${BABY_TABLE} WHERE MRN = ${sqlEscape(mrn)}`;
  const rows = await executeQuery(sql, BABY_JS_KEYS);
  return rows[0] || null;
};

// ---------------------------------------------------------------------------
// 7. Domain functions – Orders
// ---------------------------------------------------------------------------

const ORDER_DB_COLUMNS = [
  'OrderID', 'PatientMRN', 'PatientName', 'PatientID',
  'OrderType', 'FeedingType', 'Volume', 'Frequency',
  'Route', 'OrderedBy', 'OrderedAt', 'Status', 'Notes',
];

const ORDER_JS_KEYS = [
  'orderId', 'patientMrn', 'patientName', 'patientId',
  'orderType', 'feedingType', 'volume', 'frequency',
  'route', 'orderedBy', 'orderedAt', 'status', 'notes',
];

const ORDER_TABLE = 'Custom_MEKC_INT_Operational.MilkTrackerBabiesOrders';

/**
 * Get all orders, with optional filters.
 */
const getOrders = async (filters = {}) => {
  const selectCols = ORDER_DB_COLUMNS.join(', ');
  const conditions = [];

  if (filters.patientMrn) {
    conditions.push(`PatientMRN = ${sqlEscape(filters.patientMrn)}`);
  }
  if (filters.status) {
    conditions.push(`Status = ${sqlEscape(filters.status)}`);
  }
  if (filters.orderId) {
    conditions.push(`OrderID = ${sqlEscape(filters.orderId)}`);
  }

  const whereClause = conditions.length > 0
    ? ' WHERE ' + conditions.join(' AND ')
    : '';

  const orderBy = ' ORDER BY OrderedAt DESC';

  let topClause = '';
  if (filters.limit) {
    topClause = ` TOP ${parseInt(filters.limit, 10)}`;
  }

  const sql = `SELECT${topClause} ${selectCols} FROM ${ORDER_TABLE}${whereClause}${orderBy}`;
  return executeQuery(sql, ORDER_JS_KEYS);
};

/**
 * Get a single order by ID.
 */
const getOrderById = async (orderId) => {
  const selectCols = ORDER_DB_COLUMNS.join(', ');
  const sql = `SELECT ${selectCols} FROM ${ORDER_TABLE} WHERE OrderID = ${sqlEscape(orderId)}`;
  const rows = await executeQuery(sql, ORDER_JS_KEYS);
  return rows[0] || null;
};

/**
 * Get orders for a specific patient.
 */
const getPatientOrders = async (patientMrn, status = null) => {
  const selectCols = ORDER_DB_COLUMNS.join(', ');
  const conditions = [`PatientMRN = ${sqlEscape(patientMrn)}`];
  if (status) {
    conditions.push(`Status = ${sqlEscape(status)}`);
  }
  const whereClause = ' WHERE ' + conditions.join(' AND ');
  const sql = `SELECT ${selectCols} FROM ${ORDER_TABLE}${whereClause} ORDER BY OrderedAt DESC`;
  return executeQuery(sql, ORDER_JS_KEYS);
};

// ---------------------------------------------------------------------------
// 8. Close connection
// ---------------------------------------------------------------------------
const close = async () => {
  try {
    if (connection && !connection.isClosed()) {
      connection.close();
    }
  } catch (error) {
    console.error('Error closing TrakCare connection:', error.message);
  } finally {
    connection   = null;
    irisInstance = null;
    isConnected  = false;
    console.log('TrakCare connection closed');
  }
};

// ---------------------------------------------------------------------------
// 9. Exports
// ---------------------------------------------------------------------------
module.exports = {
  connect,
  getBabies,
  getBabyByMRN,
  getOrders,
  getOrderById,
  getPatientOrders,
  close,
  isTrakCareConnected,
};
