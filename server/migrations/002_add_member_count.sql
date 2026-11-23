-- Migration 002: Add memberCount column to teams table
ALTER TABLE teams ADD COLUMN memberCount INTEGER DEFAULT 4;
