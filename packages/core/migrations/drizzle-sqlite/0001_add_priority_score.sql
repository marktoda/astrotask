-- Add priority_score field to tasks table
ALTER TABLE `tasks` ADD COLUMN `priority_score` real DEFAULT 50.0 NOT NULL;

-- Add constraint to ensure priority_score is between 0 and 100
-- Note: SQLite doesn't support adding CHECK constraints to existing tables directly
-- The constraint will be enforced at the application level and in new table definitions 