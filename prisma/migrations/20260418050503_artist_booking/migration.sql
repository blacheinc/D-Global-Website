-- CreateEnum
CREATE TYPE "ArtistBookingStatus" AS ENUM ('PENDING', 'REVIEWING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ArtistBooking" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT NOT NULL,
    "company" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "venueName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "budgetMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "notes" TEXT,
    "status" "ArtistBookingStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistBooking_code_key" ON "ArtistBooking"("code");

-- CreateIndex
CREATE INDEX "ArtistBooking_artistId_status_idx" ON "ArtistBooking"("artistId", "status");

-- CreateIndex
CREATE INDEX "ArtistBooking_status_requestedAt_idx" ON "ArtistBooking"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "ArtistBooking" ADD CONSTRAINT "ArtistBooking_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
