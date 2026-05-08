-- Add a scan counter to OrderItem so multi-unit tickets (quantity > 1)
-- can be scanned the right number of times. Previously the single
-- scannedAt flag was set on first scan, blocking the remaining units
-- in a group purchase from being admitted.
--
-- Backfill policy for existing rows: any OrderItem that already has a
-- scannedAt set was scanned at least once under the old logic. Conserve
-- "first scan happened" by setting scanCount = 1 (NOT quantity) so any
-- groups still queuing at the door can use their remaining units. The
-- alternative (scanCount = quantity) would lock them out completely;
-- since the only way to consume more than 1 with the old code was
-- impossible, scanCount = 1 is accurate.

ALTER TABLE "OrderItem" ADD COLUMN "scanCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "OrderItem" SET "scanCount" = 1 WHERE "scannedAt" IS NOT NULL;
