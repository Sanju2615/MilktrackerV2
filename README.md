# Human Milk Tracker - King's College Hospital Jeddah

## Quick Start

### 1. Database Setup
```bash
mysql -u root -p -e "CREATE DATABASE milktracker;"
mysql -u root -p milktracker < database/schema.sql
```

### 2. Backend Setup
```bash
cd backend
npm install
npm start
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. Open Browser
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Default Login Credentials

| Username | Password | Role |
|----------|----------|------|
| jmartinez | admin123 | Administrator |
| sjohnson | manager123 | Nurse Manager |
| mchen | nurse123 | Nurse |
| dwilliams | doctor123 | Physician |
| rpatel | tech123 | Technician |

## Features
- HIMSS 6 Compliant
- TrakCare Integration (ODBC)
- Barcode Scanning
- Two-person Verification
- Audit Logging
