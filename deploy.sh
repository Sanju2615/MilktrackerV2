#!/bin/bash
# ============================================================
# MilkTracker - Quick Deploy Script
# King's College Hospital Jeddah
# ============================================================
# Usage: ./deploy.sh [dev|prod]
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-dev}"

echo "============================================"
echo "  MilkTracker Deploy Script"
echo "  Mode: $MODE"
echo "============================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ----------------------------------------------------------
# 1. Check prerequisites
# ----------------------------------------------------------
echo ""
echo "--- Checking prerequisites ---"

if ! command -v node &>/dev/null; then
  log_err "Node.js not found. Install Node.js >= 18."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  log_err "Node.js version $(node -v) too old. Need >= 18."
  exit 1
fi
log_ok "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  log_err "npm not found."
  exit 1
fi
log_ok "npm $(npm -v)"

if command -v mysql &>/dev/null; then
  log_ok "MySQL client found"
elif command -v mariadb &>/dev/null; then
  log_ok "MariaDB client found"
else
  log_warn "No MySQL/MariaDB client found. Database setup must be done manually."
fi

# ----------------------------------------------------------
# 2. Install dependencies
# ----------------------------------------------------------
echo ""
echo "--- Installing dependencies ---"

cd "$SCRIPT_DIR/backend"
npm install
log_ok "Backend dependencies installed"

cd "$SCRIPT_DIR/frontend"
npm install
log_ok "Frontend dependencies installed"

# ----------------------------------------------------------
# 3. Check environment files
# ----------------------------------------------------------
echo ""
echo "--- Checking configuration ---"

if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  log_warn "backend/.env not found. Creating from template..."
  cat > "$SCRIPT_DIR/backend/.env" <<'ENV'
NODE_ENV=development
PORT=3000
API_BASE_URL=/api/v1
JWT_SECRET=change-this-to-a-strong-random-secret
JWT_EXPIRES_IN=60m
JWT_REFRESH_EXPIRES_IN=7d
DB_HOST=localhost
DB_PORT=3306
DB_NAME=milktracker
DB_USER=milktracker_user
DB_PASSWORD=milktracker123
DB_CONNECTION_LIMIT=10
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
ENV
  log_ok "Created backend/.env with defaults"
else
  log_ok "backend/.env exists"
fi

if [ ! -f "$SCRIPT_DIR/frontend/.env" ]; then
  echo "VITE_API_BASE_URL=/api/v1" > "$SCRIPT_DIR/frontend/.env"
  log_ok "Created frontend/.env"
else
  log_ok "frontend/.env exists"
fi

# ----------------------------------------------------------
# 4. Database check
# ----------------------------------------------------------
echo ""
echo "--- Database check ---"

DB_USER=$(grep DB_USER "$SCRIPT_DIR/backend/.env" | cut -d= -f2)
DB_PASS=$(grep DB_PASSWORD "$SCRIPT_DIR/backend/.env" | cut -d= -f2)
DB_NAME=$(grep DB_NAME "$SCRIPT_DIR/backend/.env" | cut -d= -f2)
DB_HOST=$(grep DB_HOST "$SCRIPT_DIR/backend/.env" | cut -d= -f2)

if command -v mysql &>/dev/null || command -v mariadb &>/dev/null; then
  DB_CMD=$(command -v mariadb || command -v mysql)
  if $DB_CMD -u "$DB_USER" -p"$DB_PASS" -h "$DB_HOST" "$DB_NAME" -e "SELECT 1" &>/dev/null; then
    TABLES=$($DB_CMD -u "$DB_USER" -p"$DB_PASS" -h "$DB_HOST" "$DB_NAME" -N -e "SHOW TABLES" 2>/dev/null | wc -l)
    log_ok "Database connected ($TABLES tables)"
  else
    log_warn "Cannot connect to database. Run schema import manually."
    echo "  See DEPLOYMENT.md for database setup instructions."
  fi
else
  log_warn "Skipping database check (no MySQL client)"
fi

# ----------------------------------------------------------
# 5. Start services
# ----------------------------------------------------------
echo ""
echo "--- Starting services ---"

if [ "$MODE" = "prod" ]; then
  # Production: build frontend, start backend only
  echo "Building frontend for production..."
  cd "$SCRIPT_DIR/frontend"
  npx vite build
  log_ok "Frontend built to dist/"

  cd "$SCRIPT_DIR/backend"
  export NODE_ENV=production

  if command -v pm2 &>/dev/null; then
    pm2 delete milktracker-api 2>/dev/null || true
    pm2 start server.js --name milktracker-api
    log_ok "Backend started with PM2"
    pm2 status
  else
    echo "Starting backend... (use PM2 for production: npm i -g pm2)"
    node server.js &
    log_ok "Backend started (PID: $!)"
  fi

  echo ""
  echo "============================================"
  echo "  Production deployment complete!"
  echo "  App: http://localhost:3000"
  echo "============================================"

else
  # Development: start both services
  cd "$SCRIPT_DIR/backend"
  node server.js > /tmp/milktracker-backend.log 2>&1 &
  BACKEND_PID=$!
  sleep 2

  if curl -s http://localhost:3000/health | grep -q "healthy"; then
    log_ok "Backend started on port 3000 (PID: $BACKEND_PID)"
  else
    log_err "Backend failed to start. Check /tmp/milktracker-backend.log"
    exit 1
  fi

  cd "$SCRIPT_DIR/frontend"
  npx vite --host 0.0.0.0 --port 5173 > /tmp/milktracker-frontend.log 2>&1 &
  FRONTEND_PID=$!
  sleep 3

  if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200"; then
    log_ok "Frontend started on port 5173 (PID: $FRONTEND_PID)"
  else
    log_err "Frontend failed to start. Check /tmp/milktracker-frontend.log"
  fi

  echo ""
  echo "============================================"
  echo "  Development servers running!"
  echo "  Frontend: http://localhost:5173"
  echo "  Backend:  http://localhost:3000"
  echo "  Health:   http://localhost:3000/health"
  echo ""
  echo "  Login: jmartinez / admin123"
  echo ""
  echo "  Logs:"
  echo "    Backend:  tail -f /tmp/milktracker-backend.log"
  echo "    Frontend: tail -f /tmp/milktracker-frontend.log"
  echo ""
  echo "  Stop: kill $BACKEND_PID $FRONTEND_PID"
  echo "============================================"
fi
