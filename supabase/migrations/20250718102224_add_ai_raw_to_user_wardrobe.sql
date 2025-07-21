-- Migration: Add ai_raw column to user_wardrobe
ALTER TABLE user_wardrobe
ADD COLUMN ai_raw jsonb; 