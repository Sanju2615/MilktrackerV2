# MilkTracker - Deployment Pack for Developers

## Current Live Sandbox URLs (Verified Working)

| Service       | URL                                                                                       | Status  |
|---------------|-------------------------------------------------------------------------------------------|---------|
| **Frontend**  | https://5173-iznd925fctvloefuqdf7p-18e660f9.sandbox.novita.ai                            | Running |
| **Backend API** | https://3000-iznd925fctvloefuqdf7p-18e660f9.sandbox.novita.ai                          | Running |
| **Health Check** | https://3000-iznd925fctvloefuqdf7p-18e660f9.sandbox.novita.ai/health                  | Running |

> **Note:** Sandbox URLs are temporary. For permanent deployment, follow the Production Deployment guide below.

---

## Architecture Overview

```
                         +----------------------------+
                         |      Frontend (React)      |
                         |   Vite Dev Server :5173    |
                         |   /api/* proxied to :3000  |
                         +-------------+--------------+
                                       |
                                       | Proxy
                                       v
                         +----------------------------+
                         |    Backend (Express.js)    |
                         |     Node.js API :3000      |
                         |    JWT Authentication      |
                         +-----+------ +--------------+
                               |       |
                    +----------+       +----------+
                    v                              v
           +----------------+           +------------------+
           |  MySQL/MariaDB |           | TrakCare (ODBC)  |
           |  milktracker   |           | InterSystems IRIS|
           |  (Standalone)  |           | (Mock in sandbox)|
           +----------------+           +------------------+
```

### Key Points
- Frontend uses **relative API paths** (`/api/v1/...`) proxied by Vite to the backend
- Backend serves a REST API on port 3000 with JWT auth on all routes except `/health` and `/api/v1/auth/login`
- MySQL stores all standalone data (users, inventory, feeding, audit logs, config)
- TrakCare provides patient (baby) and order data via ODBC; falls back to **mock data** when unavailable

---

## Test Credentials

| Username    | Password    | Role           |
|-------------|-------------|----------------|
| jmartinez   | admin123    | Administrator  |
| sjohnson    | manager123  | Nurse Manager  |
| mchen       | nurse123    | Nurse          |
| dwilliams   | doctor123   | Physician      |
| rpatel      | tech123     | Technician     |

---

## API Endpoints Reference

All endpoints require `Authorization: Bearer <token>` header except where noted.

### Authentication (No auth required for login)
| Method | Endpoint                    | Description              |
|--------|----------------------------|--------------------------|
| POST   | `/api/v1/auth/login`       | Login (returns JWT token)|
| POST   | `/api/v1/auth/logout`      | Logout                   |
| GET    | `/api/v1/auth/me`          | Get current user         |
| POST   | `/api/v1/auth/change-password` | Change password      |

### Milk Inventory
| Method | Endpoint                        | Description                 |
|--------|---------------------------------|-----------------------------|
| GET    | `/api/v1/milk`                  | List inventory (filterable) |
| GET    | `/api/v1/milk/stats`            | Inventory statistics        |
| POST   | `/api/v1/milk/collect`          | Collect new milk            |
| GET    | `/api/v1/milk/:id`              | Get by ID                   |
| GET    | `/api/v1/milk/barcode/:barcode` | Get by barcode              |
| POST   | `/api/v1/milk/:id/reserve`      | Reserve for patient         |
| POST   | `/api/v1/milk/:id/transfer`     | Transfer storage            |
| POST   | `/api/v1/milk/:id/discard`      | Discard                     |

### Inventory Management
| Method | Endpoint                            | Description           |
|--------|-------------------------------------|-----------------------|
| GET    | `/api/v1/inventory/storage-units`   | List storage units    |
| POST   | `/api/v1/inventory/storage-units`   | Create storage unit   |
| GET    | `/api/v1/inventory/alerts`          | Expiry alerts         |
| GET    | `/api/v1/inventory/stats`           | Inventory stats       |

### TrakCare (Patients & Orders)
| Method | Endpoint                                | Description           |
|--------|-----------------------------------------|-----------------------|
| GET    | `/api/v1/trakcare/health`               | Health check (public) |
| GET    | `/api/v1/trakcare/babies?isActive=true` | List babies           |
| GET    | `/api/v1/trakcare/babies/:mrn`          | Get baby by MRN       |
| GET    | `/api/v1/trakcare/orders`               | List orders           |
| GET    | `/api/v1/trakcare/patients/:mrn/orders` | Patient orders        |

### Feeding Administration
| Method | Endpoint                      | Description           |
|--------|-------------------------------|-----------------------|
| GET    | `/api/v1/feeding`             | List administrations  |
| POST   | `/api/v1/feeding/administer`  | Record feeding        |
| POST   | `/api/v1/feeding/:id/verify`  | Verify feeding        |
| GET    | `/api/v1/feeding/patient/:mrn`| Patient feedings      |

### Reports
| Method | Endpoint                            | Description           |
|--------|-------------------------------------|-----------------------|
| GET    | `/api/v1/reports/daily-summary`     | Daily summary         |
| GET    | `/api/v1/reports/patient-usage`     | Patient usage         |
| GET    | `/api/v1/reports/inventory-status`  | Inventory status      |
| GET    | `/api/v1/reports/expiry`            | Expiring items        |

### Users & Stations
| Method | Endpoint                          | Description           |
|--------|-----------------------------------|-----------------------|
| GET    | `/api/v1/users`                   | List users            |
| POST   | `/api/v1/users`                   | Create user           |
| PUT    | `/api/v1/users/:id`               | Update user           |
| PUT    | `/api/v1/users/:id/status`        | Update user status    |
| PUT    | `/api/v1/users/:id/stations`      | Assign stations       |
| GET    | `/api/v1/stations`                | List stations         |
| POST   | `/api/v1/stations`                | Create station        |

### Audit & Config
| Method | Endpoint                      | Description           |
|--------|-------------------------------|-----------------------|
| GET    | `/api/v1/audit/logs`          | Get audit logs        |
| POST   | `/api/v1/audit/log`           | Log action            |
| GET    | `/api/v1/audit/stats`         | Audit statistics      |
| GET    | `/api/v1/config`              | System configuration  |
| PUT    | `/api/v1/config/:key`         | Update config value   |
| GET    | `/api/v1/discard-reasons`     | List discard reasons  |

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js** >= 18.0.0
- **MySQL 8.x** or **MariaDB 10.6+**
- **npm** >= 9.0.0

### 1. Clone and Setup Database

```bash
# Create database and user
mysql -u root -p <<'SQL'
CREATE DATABASE IF NOT EXISTS milktracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'milktracker_user'@'localhost' IDENTIFIED BY 'milktracker123';
GRANT ALL PRIVILEGES ON milktracker.* TO 'milktracker_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# Import schema (tables + seed data)
# Note: schema.sql uses DELIMITER for stored procedures.
# Import in two steps if your client doesn't support DELIMITER:

# Step 1: Import tables and data (lines 1-292)
head -292 database/schema.sql | mysql -u milktracker_user -pmilktracker123 milktracker

# Step 2: Create stored procedures manually
mysql -u milktracker_user -pmilktracker123 milktracker <<'SQL'
DROP PROCEDURE IF EXISTS sp_discard_milk;
CREATE PROCEDURE sp_discard_milk(IN p_milk_id VARCHAR(36), IN p_reason VARCHAR(100), IN p_notes TEXT, IN p_user_id VARCHAR(36))
BEGIN
  UPDATE milk_inventory SET status = 'discarded', updated_at = NOW() WHERE id = p_milk_id;
  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) 
  VALUES (UUID(), p_user_id, 'discard_milk', 'milk_inventory', p_milk_id, CONCAT('Reason: ', p_reason, '. Notes: ', p_notes));
END;

DROP PROCEDURE IF EXISTS sp_reserve_milk;
CREATE PROCEDURE sp_reserve_milk(IN p_milk_id VARCHAR(36), IN p_patient_mrn VARCHAR(50), IN p_user_id VARCHAR(36))
BEGIN
  UPDATE milk_inventory SET status = 'reserved', reserved_for_patient_mrn = p_patient_mrn, reserved_at = NOW(), reserved_by_user_id = p_user_id, updated_at = NOW() WHERE id = p_milk_id AND status = 'available';
  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, patient_mrn, details) 
  VALUES (UUID(), p_user_id, 'reserve_milk', 'milk_inventory', p_milk_id, p_patient_mrn, CONCAT('Reserved for patient: ', p_patient_mrn));
END;
SQL

# Verify:
mysql -u milktracker_user -pmilktracker123 milktracker -e "SHOW TABLES; SELECT COUNT(*) AS users FROM users;"
```

### 2. Configure Backend

```bash
cd backend
cp .env.example .env   # Or copy the .env below

npm install
```

**backend/.env** (minimum required):
```ini
NODE_ENV=development
PORT=3000
API_BASE_URL=/api/v1

JWT_SECRET=change-this-to-a-strong-random-secret-in-production
JWT_EXPIRES_IN=60m
JWT_REFRESH_EXPIRES_IN=7d

DB_HOST=localhost
DB_PORT=3306
DB_NAME=milktracker
DB_USER=milktracker_user
DB_PASSWORD=milktracker123
DB_CONNECTION_LIMIT=10

# TrakCare ODBC - leave as-is if not available, app uses mock data
TRAKCARE_CONNECTION_STRING=DRIVER={InterSystems IRIS ODBC35};SERVER=100.96.26.65;PORT=56772;DATABASE=TRAK;UID=mekc-skumar;PWD=KCHJ@1234;

BCRYPT_ROUNDS=10
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
CORS_CREDENTIALS=true

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

APP_NAME=Human Milk Tracker
APP_VERSION=1.0.0
HIMSS6_MODE=true

ENABLE_TRAKCARE_SYNC=true
ENABLE_AUDIT_LOGGING=true
```

### 3. Configure Frontend

```bash
cd frontend
npm install
```

**frontend/.env**:
```ini
VITE_API_BASE_URL=/api/v1
```

### 4. Start Services

```bash
# Terminal 1: Backend
cd backend
npm start        # or: npm run dev (with nodemon auto-reload)

# Terminal 2: Frontend
cd frontend
npm run dev      # Vite dev server on port 5173, proxies /api to :3000
```

### 5. Open Browser
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health**: http://localhost:3000/health

---

## Production Deployment

### Option A: Single Server with Nginx (Recommended)

#### 1. Build Frontend

```bash
cd frontend
npm run build    # Outputs to frontend/dist/
```

> **Note:** The TypeScript compiler (`tsc -b`) may report type warnings. For a production build skipping type-check:
> ```bash
> npx vite build
> ```

#### 2. Backend serves static frontend

Set `NODE_ENV=production` in backend/.env. The Express server auto-serves `frontend/dist/` in production mode.

#### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name milktracker.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name milktracker.yourdomain.com;

    ssl_certificate     /etc/ssl/certs/milktracker.crt;
    ssl_certificate_key /etc/ssl/private/milktracker.key;

    # All traffic goes to Node.js backend (which serves both API and frontend)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 4. Process Management (PM2)

```bash
npm install -g pm2

cd backend
pm2 start server.js --name milktracker-api
pm2 save
pm2 startup    # Auto-start on server reboot
```

### Option B: Separate Frontend and Backend Servers

#### Frontend (Nginx static)
```nginx
server {
    listen 443 ssl;
    server_name milktracker.yourdomain.com;
    root /var/www/milktracker/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://api.milktracker.internal:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### Backend
```bash
# Update CORS_ORIGIN in backend/.env to include the frontend's domain
CORS_ORIGIN=https://milktracker.yourdomain.com

cd backend
pm2 start server.js --name milktracker-api
```

### Option C: Docker Deployment

Create `docker-compose.yml` at project root:

```yaml
version: '3.8'

services:
  db:
    image: mariadb:11
    restart: always
    environment:
      MARIADB_ROOT_PASSWORD: rootpassword
      MARIADB_DATABASE: milktracker
      MARIADB_USER: milktracker_user
      MARIADB_PASSWORD: milktracker123
    volumes:
      - db_data:/var/lib/mysql
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "3306:3306"
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: db
      DB_PORT: 3306
      DB_NAME: milktracker
      DB_USER: milktracker_user
      DB_PASSWORD: milktracker123
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      CORS_ORIGIN: http://localhost,http://localhost:80
    ports:
      - "3000:3000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: always
    depends_on:
      - backend
    ports:
      - "80:80"
      - "443:443"

volumes:
  db_data:
```

**backend/Dockerfile**:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**frontend/Dockerfile**:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## Bugs Fixed in This Release

### 1. MySQL2 `ER_WRONG_ARGUMENTS` / `Incorrect arguments to mysqld_stmt_execute`

**Root Cause:** `db.js` used `pool.execute()` (prepared statements) for dynamic SQL with conditional WHERE clauses and LIMIT/OFFSET. When `undefined` values leaked in as parameters, MySQL rejected the type mismatch.

**Fix:** Changed `pool.execute()` to `pool.query()` in `backend/utils/db.js` and added a `sanitizeParams()` helper that converts `undefined` to `null`.

### 2. Frontend Sending `"undefined"` String as Query Parameters

**Root Cause:** API client methods like `milkApi.getInventory({ patientMrn: undefined })` produced URLs like `?patientMrn=undefined`, which the backend treated as a valid filter string.

**Fix:** Added `cleanParams()` and `buildQueryString()` utilities in `frontend/src/services/api.ts` that strip any key whose value is `undefined`, `null`, `''`, or the literal string `"undefined"` / `"null"`.

### 3. Backend Routes Missing Guard for `"undefined"` String Values

**Root Cause:** Even with frontend fixes, route handlers would add SQL WHERE conditions for meaningless values.

**Fix:** Added `isDefined()` helper in backend routes (`milk.js`, `feeding.js`, `reports.js`, `auditService.js`) that checks `val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null'`.

### 4. Route Ordering - `/milk/stats` vs `/milk/:id`

**Root Cause:** `/api/v1/milk/stats` was defined after `/api/v1/milk/:id`, so Express matched `stats` as an `:id` parameter.

**Fix:** Moved the `/stats` route before `/:id` in `backend/routes/milk.js`.

### 5. TrakCare ODBC Module Crash

**Root Cause:** The `odbc` native module was compiled for a different platform (Windows), causing `ERR_DLOPEN_FAILED` (invalid ELF header).

**Fix:** Wrapped `require('odbc')` in try/catch in `backend/utils/trakcareDb.js`, gracefully falling back to mock data.

### 6. CORS Blocking Sandbox URLs

**Root Cause:** CORS was only allowing `localhost` origins, blocking requests from sandbox subdomains.

**Fix:** Updated `backend/server.js` with dynamic CORS origin checking that accepts any `*.sandbox.novita.ai` subdomain, plus explicit origins from `CORS_ORIGIN` env var.

### 7. Vite `allowedHosts` Blocking External Access

**Root Cause:** Vite 7 blocks requests from non-localhost hostnames by default.

**Fix:** Set `server.allowedHosts: true` in `frontend/vite.config.ts`.

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| `backend/utils/db.js` | `pool.execute()` -> `pool.query()`; added `sanitizeParams()` |
| `backend/utils/trakcareDb.js` | Graceful ODBC load with try/catch; mock fallback |
| `backend/routes/milk.js` | `isDefined()` guards; `/stats` before `/:id` |
| `backend/routes/feeding.js` | `isDefined()` guard for `patientMrn` |
| `backend/routes/inventory.js` | `COALESCE` for `SUM()` null handling |
| `backend/routes/reports.js` | `isDefined()` guards for all filters |
| `backend/services/auditService.js` | `isDefined()` guards for log filters |
| `backend/server.js` | Dynamic CORS origin; TrakCare health with mock fallback |
| `backend/.env` | CORS origins updated; rate limit increased |
| `frontend/src/services/api.ts` | `cleanParams()` / `buildQueryString()` utilities |
| `frontend/.env` | `VITE_API_BASE_URL=/api/v1` (relative) |
| `frontend/vite.config.ts` | Added API proxy and `allowedHosts: true` |

---

## Database Schema Quick Reference

### Tables
- **nurse_stations** - Hospital stations/locations
- **users** - Staff with roles (admin, nurse_manager, nurse, physician, technician, viewer)
- **user_stations** - Many-to-many user-station assignments
- **discard_reasons** - Predefined milk discard reasons
- **storage_units** - Freezers and refrigerators with capacity
- **milk_inventory** - Core milk tracking (barcode, patient, volume, type, status, expiry)
- **feeding_administrations** - Feeding records with two-person verification
- **audit_logs** - HIMSS 6 compliant audit trail
- **system_config** - Key-value system configuration

### Stored Procedures
- `sp_discard_milk(milk_id, reason, notes, user_id)`
- `sp_reserve_milk(milk_id, patient_mrn, user_id)`

### Triggers
- `trg_milk_inventory_audit` - Auto-logs status changes in `milk_inventory`

---

## TrakCare Integration Notes

The application connects to **InterSystems IRIS** (TrakCare) via ODBC to read:
- `MilkTrackerBabies` - Patient (baby) records
- `MilkTrackerBabiesOrders` - Feeding orders from CPOE

**In environments without TrakCare access**, the system automatically falls back to **mock data** (5 sample babies, 3 sample orders). This is expected behavior in dev/sandbox environments.

To enable real TrakCare connectivity:
1. Install the **InterSystems IRIS ODBC35** driver on the server
2. Configure connection parameters in `backend/.env`
3. Ensure network access to the TrakCare server (default: `100.96.26.65:56772`)

---

## Troubleshooting

### "Access denied" on database connection
- Verify `DB_USER` and `DB_PASSWORD` in `backend/.env` match the MySQL user
- Ensure `dotenv` is loaded: `require('dotenv').config()` must be at the top of `server.js`

### CORS errors in browser console
- Add your frontend URL to `CORS_ORIGIN` in `backend/.env` (comma-separated)
- For sandbox environments, the wildcard `*.sandbox.novita.ai` is auto-allowed

### TrakCare "ODBC module not available"
- This is expected in dev environments without InterSystems IRIS ODBC driver
- The app falls back to mock data automatically
- No action required unless real TrakCare integration is needed

### Frontend shows blank page
- Check browser console for errors
- Verify `VITE_API_BASE_URL=/api/v1` in `frontend/.env`
- Ensure Vite proxy is configured: `vite.config.ts` must have `/api` proxy to `http://localhost:3000`

### MySQL "Incorrect arguments to mysqld_stmt_execute"
- This was the original bug; it's now fixed
- If it reoccurs, ensure `backend/utils/db.js` uses `pool.query()` not `pool.execute()`
