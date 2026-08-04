-- Normalize legacy retrying rows to failed (nextRetryAt still indicates auto-retry).
UPDATE "InventorySyncRun"
SET "status" = 'failed'
WHERE "status" = 'retrying';
