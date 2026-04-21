-- AlterTable: add optional per-slot profile picture URL. Null-safe
-- default so existing rows don't need backfilling; admins populate
-- it via the lineup edit form or the image survives as null and the
-- public list falls back to the linked artist's avatar.
ALTER TABLE "LineupSlot" ADD COLUMN "image" TEXT;
