#!/bin/bash
# ============================================================
# MilkTracker - API Endpoint Verification Script
# Tests all major API endpoints and reports results
# ============================================================
# Usage: ./test-api.sh [base_url]
# Default base_url: http://localhost:3000
# ============================================================

BASE_URL="${1:-http://localhost:3000}"
API="${BASE_URL}/api/v1"
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local method=$1
  local path=$2
  local desc=$3
  local data=$4
  local auth=$5
  TOTAL=$((TOTAL + 1))

  local opts="-s -o /tmp/api_response.json -w %{http_code}"
  [ -n "$auth" ] && opts="$opts -H \"Authorization: Bearer $auth\""

  if [ "$method" = "POST" ]; then
    local status=$(eval curl $opts -X POST -H "'Content-Type: application/json'" -d "'$data'" "${API}${path}")
  else
    local status=$(eval curl $opts -X GET -H "'Content-Type: application/json'" "${API}${path}")
  fi

  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    PASS=$((PASS + 1))
    echo -e "${GREEN}[PASS]${NC} $method $path -> $status ($desc)"
  else
    FAIL=$((FAIL + 1))
    local body=$(cat /tmp/api_response.json 2>/dev/null | head -c 120)
    echo -e "${RED}[FAIL]${NC} $method $path -> $status ($desc) $body"
  fi
}

echo "============================================"
echo "  MilkTracker API Test Suite"
echo "  Target: $BASE_URL"
echo "============================================"
echo ""

# Health check (no auth - uses base URL directly, not /api/v1)
echo "--- Public Endpoints ---"
TOTAL=$((TOTAL + 1))
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
if [ "$HEALTH_STATUS" = "200" ]; then
  PASS=$((PASS + 1))
  echo -e "${GREEN}[PASS]${NC} GET /health -> $HEALTH_STATUS (Health check)"
else
  FAIL=$((FAIL + 1))
  echo -e "${RED}[FAIL]${NC} GET /health -> $HEALTH_STATUS (Health check)"
fi

# Login
echo ""
echo "--- Authentication ---"
TOTAL=$((TOTAL + 1))
LOGIN_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"username":"jmartinez","password":"admin123"}' \
  "${API}/auth/login")

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
  PASS=$((PASS + 1))
  echo -e "${GREEN}[PASS]${NC} POST /auth/login -> Token obtained"
else
  FAIL=$((FAIL + 1))
  echo -e "${RED}[FAIL]${NC} POST /auth/login -> No token"
  echo "Cannot continue without authentication. Exiting."
  exit 1
fi

check GET "/auth/me" "Current user" "" "$TOKEN"

# Milk
echo ""
echo "--- Milk Inventory ---"
check GET "/milk" "List inventory" "" "$TOKEN"
check GET "/milk/stats" "Statistics" "" "$TOKEN"

# Inventory
echo ""
echo "--- Inventory Management ---"
check GET "/inventory/storage-units" "Storage units" "" "$TOKEN"
check GET "/inventory/alerts" "Alerts" "" "$TOKEN"
check GET "/inventory/stats" "Stats" "" "$TOKEN"

# TrakCare
echo ""
echo "--- TrakCare Integration ---"
check GET "/trakcare/babies?isActive=true" "Babies (active)" "" "$TOKEN"
check GET "/trakcare/orders" "Orders" "" "$TOKEN"
check GET "/trakcare/babies/MRN001234" "Baby by MRN" "" "$TOKEN"
check GET "/trakcare/patients/MRN001234/orders" "Patient orders" "" "$TOKEN"

# Feeding
echo ""
echo "--- Feeding ---"
check GET "/feeding" "List feedings" "" "$TOKEN"

# Discard Reasons
echo ""
echo "--- Discard Reasons ---"
check GET "/discard-reasons" "List reasons" "" "$TOKEN"

# Config
echo ""
echo "--- Configuration ---"
check GET "/config" "System config" "" "$TOKEN"

# Reports
echo ""
echo "--- Reports ---"
check GET "/reports/daily-summary" "Daily summary" "" "$TOKEN"
check GET "/reports/inventory-status" "Inventory status" "" "$TOKEN"
check GET "/reports/expiry" "Expiry report" "" "$TOKEN"
check GET "/reports/patient-usage" "Patient usage" "" "$TOKEN"

# Users & Stations
echo ""
echo "--- Users & Stations ---"
check GET "/users" "List users" "" "$TOKEN"
check GET "/stations" "List stations" "" "$TOKEN"

# Audit
echo ""
echo "--- Audit ---"
check GET "/audit/logs" "Audit logs" "" "$TOKEN"
check GET "/audit/stats" "Audit stats" "" "$TOKEN"
check POST "/audit/log" "Log action" '{"action":"test","entityType":"test","details":"API test"}' "$TOKEN"

# Summary
echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed, $TOTAL total"
if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
else
  echo -e "  ${RED}$FAIL TESTS FAILED${NC}"
fi
echo "============================================"

# Cleanup
rm -f /tmp/api_response.json

exit $FAIL
