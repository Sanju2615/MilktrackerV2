-- Migration: Add auto-increment numeric ID for feeding_administrations
-- Date: 2026-04-22
-- Purpose: Replace UUID primary key with incremental integer ID for readability

-- 1. Add numeric auto-increment column
ALTER TABLE feeding_administrations
  ADD COLUMN IF NOT EXISTS numeric_id INT AUTO_INCREMENT UNIQUE AFTER id;

-- 2. Add administered_by_name column to store the nurse name directly
ALTER TABLE feeding_administrations
  ADD COLUMN IF NOT EXISTS administered_by_name VARCHAR(200) AFTER administered_by_user_id;

-- Note: The primary key remains VARCHAR(36) for backward compatibility,
-- but the new numeric_id provides a human-readable incremental identifier.
-- Frontend will display numeric_id instead of the UUID.
