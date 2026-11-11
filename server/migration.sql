-- ============================================================
-- FreelanceOS — Database Migration
-- Run this once against your `freelancer_scheduler` database
-- ============================================================

-- 1. Add google_event_id to availability
--    Stores the Google Calendar event ID so we can delete it
--    when a slot is removed from the app.
ALTER TABLE availability
    ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255) DEFAULT NULL;

-- 2. Add is_taking_bookings and profile fields to users
--    is_taking_bookings: Controls whether slots are visible.
--    title, bio: Used for the public booking page profile.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_taking_bookings TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS title VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL;

-- ============================================================
-- Verify
-- ============================================================
DESCRIBE availability;
DESCRIBE users;
