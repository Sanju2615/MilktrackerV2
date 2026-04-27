-- Migration: Add verification_method column to feeding_administrations
-- Date: 2026-04-21
-- Purpose: HIMSS 6 Closed-Loop Enforcement — track whether administration 
--          was done via barcode scan or manual override.

-- 1. Add verification_method column
ALTER TABLE feeding_administrations 
  ADD COLUMN IF NOT EXISTS verification_method 
  ENUM('barcode', 'manual_override') NOT NULL DEFAULT 'barcode'
  AFTER notes;

-- 2. Add index for audit queries on override vs barcode
ALTER TABLE feeding_administrations 
  ADD INDEX IF NOT EXISTS idx_verification_method (verification_method);

-- 3. Widen feeding_type from ENUM to VARCHAR to accept TrakCare values
ALTER TABLE feeding_administrations 
  MODIFY COLUMN feeding_type VARCHAR(50) NOT NULL;

-- 4. Widen route from ENUM to VARCHAR to accept TrakCare values
ALTER TABLE feeding_administrations 
  MODIFY COLUMN route VARCHAR(50) DEFAULT 'oral';

-- 5. Widen tolerance to include clinical values
ALTER TABLE feeding_administrations 
  MODIFY COLUMN tolerance 
  ENUM('good', 'fair', 'poor', 'well-tolerated', 'minimal-residue', 'moderate-residue', 'poorly-tolerated') 
  DEFAULT 'good';
