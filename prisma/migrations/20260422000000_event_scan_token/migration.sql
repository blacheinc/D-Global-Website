-- CreateTable: per-event tokenised scanner links. Admins generate a
-- cuid token per gate/session; staff scan against it. onDelete Cascade
-- so deleting an event cleans its orphaned scan links.
CREATE TABLE "EventScanToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EventScanToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventScanToken_token_key" ON "EventScanToken"("token");

-- CreateIndex
CREATE INDEX "EventScanToken_eventId_idx" ON "EventScanToken"("eventId");

-- AddForeignKey
ALTER TABLE "EventScanToken" ADD CONSTRAINT "EventScanToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
