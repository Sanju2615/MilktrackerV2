-- =====================================================
-- Human Milk Tracker - MySQL Database Schema
-- King's College Hospital Jeddah
-- HIMSS 6 Compliant with Audit Logging
-- =====================================================

-- Create database
CREATE DATABASE IF NOT EXISTS milktracker 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE milktracker;

-- =====================================================
-- USER MANAGEMENT TABLES
-- =====================================================

-- Nurse Stations
CREATE TABLE IF NOT EXISTS nurse_stations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  location VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- Users (Hospital Staff)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role ENUM('admin', 'nurse_manager', 'nurse', 'physician', 'technician', 'viewer') NOT NULL DEFAULT 'nurse',
  status ENUM('active', 'inactive', 'locked') NOT NULL DEFAULT 'active',
  primary_station_id VARCHAR(36),
  login_attempts INT DEFAULT 0,
  last_login_at TIMESTAMP NULL,
  password_changed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(36),
  updated_by VARCHAR(36),
  FOREIGN KEY (primary_station_id) REFERENCES nurse_stations(id),
  INDEX idx_username (username),
  INDEX idx_employee_id (employee_id),
  INDEX idx_role (role),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- User Station Assignments (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_stations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  station_id VARCHAR(36) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by VARCHAR(36),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES nurse_stations(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_station (user_id, station_id),
  INDEX idx_user (user_id),
  INDEX idx_station (station_id)
) ENGINE=InnoDB;

-- =====================================================
-- DISCARD REASONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS discard_reasons (
  id VARCHAR(36) PRIMARY KEY,
  reason_value VARCHAR(50) NOT NULL UNIQUE,
  reason_label VARCHAR(100) NOT NULL,
  description TEXT,
  icon_name VARCHAR(50) DEFAULT 'FileText',
  requires_notes BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(36),
  INDEX idx_active (is_active),
  INDEX idx_value (reason_value)
) ENGINE=InnoDB;

-- Insert default discard reasons (ignore if already exists)
INSERT IGNORE INTO discard_reasons (id, reason_value, reason_label, description, icon_name, requires_notes, is_system, display_order) VALUES
('reason-expired', 'expired', 'Expired', 'Milk has passed expiration date', 'Clock', FALSE, TRUE, 1),
('reason-contaminated', 'contaminated', 'Contaminated', 'Suspected contamination', 'AlertTriangle', TRUE, TRUE, 2),
('reason-broken-container', 'broken_container', 'Broken Container', 'Container damaged or leaking', 'Package', FALSE, TRUE, 3),
('reason-wrong-label', 'wrong_label', 'Wrong Label', 'Incorrect or illegible labeling', 'Barcode', FALSE, TRUE, 4),
('reason-mother-request', 'mother_request', 'Mother Request', 'At mother\'s request', 'User', FALSE, TRUE, 5),
('reason-quality-concern', 'quality_concern', 'Quality Concern', 'Appearance or odor concern', 'AlertCircle', TRUE, TRUE, 6),
('reason-other', 'other', 'Other', 'Other reason (specify in notes)', 'FileText', TRUE, TRUE, 7);

-- =====================================================
-- MILK INVENTORY TABLES
-- =====================================================

-- Storage Units (Freezers/Refrigerators)
CREATE TABLE IF NOT EXISTS storage_units (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  type ENUM('freezer', 'refrigerator') NOT NULL,
  location VARCHAR(200),
  temperature_min DECIMAL(4,1),
  temperature_max DECIMAL(4,1),
  capacity INT,
  current_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- Milk Inventory
CREATE TABLE IF NOT EXISTS milk_inventory (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(100) NOT NULL UNIQUE,
  patient_mrn VARCHAR(50) NOT NULL,
  patient_name VARCHAR(200) NOT NULL,
  patient_id VARCHAR(36),
  volume_ml INT NOT NULL,
  milk_type ENUM('breast_milk', 'donor_milk', 'formula') NOT NULL DEFAULT 'breast_milk',
  expressed_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  storage_unit_id VARCHAR(36),
  shelf_position VARCHAR(50),
  status ENUM('available', 'reserved', 'expired', 'discarded', 'administered') NOT NULL DEFAULT 'available',
  reserved_for_patient_mrn VARCHAR(50),
  reserved_at TIMESTAMP NULL,
  reserved_by_user_id VARCHAR(36),
  collection_method ENUM('pumping', 'hand_expression') DEFAULT 'pumping',
  serial_number INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(36),
  FOREIGN KEY (storage_unit_id) REFERENCES storage_units(id),
  INDEX idx_barcode (barcode),
  INDEX idx_patient_mrn (patient_mrn),
  INDEX idx_status (status),
  INDEX idx_expires (expires_at),
  INDEX idx_storage (storage_unit_id),
  INDEX idx_milk_type (milk_type)
) ENGINE=InnoDB;

-- =====================================================
-- FEEDING ADMINISTRATION TABLES
-- =====================================================

-- Feeding Administrations
CREATE TABLE IF NOT EXISTS feeding_administrations (
  id VARCHAR(36) PRIMARY KEY,
  patient_mrn VARCHAR(50) NOT NULL,
  patient_name VARCHAR(200) NOT NULL,
  patient_id VARCHAR(36),
  order_id VARCHAR(36),
  milk_inventory_id VARCHAR(36),
  barcode VARCHAR(100),
  volume_ordered_ml INT,
  volume_given_ml INT NOT NULL,
  feeding_type ENUM('bottle', 'syringe', 'gavage', 'breastfeeding') NOT NULL,
  route ENUM('oral', 'ng_tube', 'og_tube', 'g_tube') NOT NULL,
  administered_at TIMESTAMP NOT NULL,
  administered_by_user_id VARCHAR(36) NOT NULL,
  verified_by_user_id VARCHAR(36),
  verified_at TIMESTAMP NULL,
  tolerance ENUM('good', 'fair', 'poor') DEFAULT 'good',
  residual_ml INT,
  vomit BOOLEAN DEFAULT FALSE,
  stool BOOLEAN DEFAULT FALSE,
  notes TEXT,
  cpoe_synced BOOLEAN DEFAULT FALSE,
  cpoe_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (milk_inventory_id) REFERENCES milk_inventory(id),
  FOREIGN KEY (administered_by_user_id) REFERENCES users(id),
  FOREIGN KEY (verified_by_user_id) REFERENCES users(id),
  INDEX idx_patient_mrn (patient_mrn),
  INDEX idx_administered_at (administered_at),
  INDEX idx_order (order_id),
  INDEX idx_cpoe_synced (cpoe_synced)
) ENGINE=InnoDB;

-- =====================================================
-- AUDIT LOG TABLE (HIMSS 6 Compliance)
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  user_name VARCHAR(200),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  patient_mrn VARCHAR(50),
  details TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  station_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_patient (patient_mrn),
  INDEX idx_created (created_at),
  INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- =====================================================
-- SYSTEM CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS system_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(36)
) ENGINE=InnoDB;

-- Default system configuration
INSERT IGNORE INTO system_config (config_key, config_value, description) VALUES
('session_timeout_minutes', '15', 'User session timeout in minutes'),
('idle_timeout_minutes', '5', 'Idle timeout before auto-logout in minutes'),
('max_login_attempts', '5', 'Maximum failed login attempts before account lock'),
('password_min_length', '8', 'Minimum password length'),
('freezer_expiry_days', '180', 'Milk expiry in freezer (days)'),
('refrigerator_expiry_days', '3', 'Milk expiry in refrigerator (days)'),
('himss6_mode', 'true', 'Enable HIMSS 6 compliance features'),
('trakcare_sync_enabled', 'true', 'Enable TrakCare integration'),
('trakcare_server', '', 'TrakCare database server'),
('trakcare_database', 'Custom_MEKC_INT_Operational', 'TrakCare database name');

-- NOTE: TrakCare data is fetched directly via API from SQL Server
-- Tables MilkTrackerBabies and MilkTrackerBabiesOrders are in TrakCare (SQL Server)
-- This database only stores MilkTracker standalone data

-- =====================================================
-- SEED DATA - DEMO USERS
-- =====================================================

-- Demo nurse stations
INSERT IGNORE INTO nurse_stations (id, name, code, location) VALUES
('station-001', 'NICU Station 1', 'NICU-01', 'NICU Floor 3'),
('station-002', 'NICU Station 2', 'NICU-02', 'NICU Floor 3'),
('station-003', 'Pediatrics Station 1', 'PEDS-01', 'Pediatrics Floor 2'),
('station-004', 'Pediatrics Station 2', 'PEDS-02', 'Pediatrics Floor 2'),
('station-005', 'Milk Preparation Lab', 'MILK-LAB', 'Laboratory Floor 1');

-- Demo storage units
INSERT IGNORE INTO storage_units (id, name, code, type, location, temperature_min, temperature_max, capacity) VALUES
('storage-001', 'Main Freezer A', 'FZ-A', 'freezer', 'Milk Lab', -20.0, -18.0, 500),
('storage-002', 'Main Freezer B', 'FZ-B', 'freezer', 'Milk Lab', -20.0, -18.0, 500),
('storage-003', 'Refrigerator A', 'RF-A', 'refrigerator', 'Milk Lab', 2.0, 4.0, 200),
('storage-004', 'NICU Freezer', 'NICU-FZ', 'freezer', 'NICU Station 1', -20.0, -18.0, 100);

-- Demo users with working passwords
-- Password hash generated with bcrypt (cost factor 10)
-- jmartinez / admin123
-- sjohnson / manager123
-- mchen / nurse123
-- dwilliams / doctor123
-- rpatel / tech123
INSERT IGNORE INTO users (id, employee_id, username, password_hash, first_name, last_name, email, role, status, primary_station_id) VALUES
('user-001', 'EMP001', 'jmartinez', '$2b$10$tfNp9Hx/tb57/XxEEaKMBufIvchw3PyBZORQX8r/X/no7NbfyvCt6', 'James', 'Martinez', 'jmartinez@kch.com', 'admin', 'active', 'station-005'),
('user-002', 'EMP002', 'sjohnson', '$2b$10$.1N6rrPkxHX6VN4epz9ZpOa4CGDRFNtG88fHYFUWbfH0lLefBoq82', 'Sarah', 'Johnson', 'sjohnson@kch.com', 'nurse_manager', 'active', 'station-001'),
('user-003', 'EMP003', 'mchen', '$2b$10$ffMPqpfUKAm0r/L2cmL1weqHz/sU5e7JLQ7UMguU6cLtMGipsUXD.', 'Michael', 'Chen', 'mchen@kch.com', 'nurse', 'active', 'station-001'),
('user-004', 'EMP004', 'dwilliams', '$2b$10$hoBtPnUuam5bM1qEWKypaOoJGgPcvk/Y4OWZ8nxD7DK74H43Jnzw2', 'David', 'Williams', 'dwilliams@kch.com', 'physician', 'active', 'station-001'),
('user-005', 'EMP005', 'rpatel', '$2b$10$UEvLZONbRmsK38OJBzpZlegcWwuo6snrO54dvtrY3rwBXSUi.dXNy', 'Ravi', 'Patel', 'rpatel@kch.com', 'technician', 'active', 'station-005');

-- Assign stations to users
INSERT IGNORE INTO user_stations (id, user_id, station_id, is_primary) VALUES
('us-001', 'user-001', 'station-005', TRUE),
('us-002', 'user-002', 'station-001', TRUE),
('us-003', 'user-002', 'station-002', FALSE),
('us-004', 'user-003', 'station-001', TRUE),
('us-005', 'user-003', 'station-002', FALSE),
('us-006', 'user-004', 'station-001', TRUE),
('us-007', 'user-005', 'station-005', TRUE);

-- =====================================================
-- STORED PROCEDURES
-- =====================================================

DELIMITER //

-- Procedure to discard milk
CREATE PROCEDURE IF NOT EXISTS sp_discard_milk(
  IN p_milk_id VARCHAR(36),
  IN p_reason VARCHAR(100),
  IN p_notes TEXT,
  IN p_user_id VARCHAR(36)
)
BEGIN
  UPDATE milk_inventory 
  SET status = 'discarded',
      updated_at = NOW()
  WHERE id = p_milk_id;
  
  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (UUID(), p_user_id, 'discard_milk', 'milk_inventory', p_milk_id, 
          CONCAT('Reason: ', p_reason, '. Notes: ', p_notes));
END //

-- Procedure to reserve milk
CREATE PROCEDURE IF NOT EXISTS sp_reserve_milk(
  IN p_milk_id VARCHAR(36),
  IN p_patient_mrn VARCHAR(50),
  IN p_user_id VARCHAR(36)
)
BEGIN
  UPDATE milk_inventory 
  SET status = 'reserved',
      reserved_for_patient_mrn = p_patient_mrn,
      reserved_at = NOW(),
      reserved_by_user_id = p_user_id,
      updated_at = NOW()
  WHERE id = p_milk_id AND status = 'available';
  
  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, patient_mrn, details)
  VALUES (UUID(), p_user_id, 'reserve_milk', 'milk_inventory', p_milk_id, p_patient_mrn,
          CONCAT('Reserved for patient: ', p_patient_mrn));
END //

DELIMITER ;

-- =====================================================
-- TRIGGERS FOR AUDIT LOGGING
-- =====================================================

DELIMITER //

-- Trigger for milk inventory changes
CREATE TRIGGER IF NOT EXISTS trg_milk_inventory_audit
AFTER UPDATE ON milk_inventory
FOR EACH ROW
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO audit_logs (id, action, entity_type, entity_id, patient_mrn, details, created_at)
    VALUES (UUID(), CONCAT('status_change_', NEW.status), 'milk_inventory', NEW.id, 
            NEW.patient_mrn, CONCAT('Status changed from ', OLD.status, ' to ', NEW.status), NOW());
  END IF;
END //

DELIMITER ;
