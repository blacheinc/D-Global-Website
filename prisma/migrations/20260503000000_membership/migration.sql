-- Membership feature: paid subscription that grants a flat percent
-- discount on tickets and VIP tables. Single tier today; the schema is
-- shaped to accept multiple tiers later.

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "discountBps" INTEGER NOT NULL DEFAULT 2000,
    "perks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paystackPlanCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");
CREATE UNIQUE INDEX "MembershipPlan_paystackPlanCode_key" ON "MembershipPlan"("paystackPlanCode");

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "paystackSubscriptionCode" TEXT,
    "paystackEmailToken" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "paystackPayload" JSONB,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_paystackSubscriptionCode_key" ON "Membership"("paystackSubscriptionCode");
CREATE INDEX "Membership_status_idx" ON "Membership"("status");
CREATE INDEX "Membership_currentPeriodEnd_idx" ON "Membership"("currentPeriodEnd");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
