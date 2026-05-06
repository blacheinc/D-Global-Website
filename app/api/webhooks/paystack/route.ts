import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/server/db';
import { verifyPaystackSignature } from '@/server/paystack/verifyWebhook';
import { signTicket } from '@/server/qr/signPayload';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';
import { captureError } from '@/server/observability';
import { MembershipStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paystack's webhook payload is a tagged union by `event`. We only type
// the fields we read; anything else stays `unknown` and gets persisted
// as paystackPayload for ops debugging.
type PaystackEvent = {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    status?: string;
    customer?: { email?: string; customer_code?: string };
    // Set when the transaction was initialised against a plan, i.e.
    // it created or renewed a subscription.
    plan?: string | { plan_code?: string; id?: number };
    // Subscription-event payloads include subscription_code + token
    // + next_payment_date directly on data.
    subscription_code?: string;
    email_token?: string;
    next_payment_date?: string;
    // Our membership transactions tag themselves with metadata so the
    // initial subscription-creating charge.success knows which user to
    // link to. Renewal charges don't have this metadata, but they do
    // include data.customer.customer_code which we can resolve against
    // an existing Membership row.
    metadata?: Record<string, unknown> | string;
  };
};

function metadataKind(payload: PaystackEvent): { kind?: string; userId?: string; planId?: string } {
  // Paystack sometimes serialises metadata as a JSON string, sometimes
  // as an object. Coerce both shapes; ignore parse failures since the
  // metadata is a hint, not a security boundary.
  const raw = payload.data.metadata;
  if (!raw) return {};
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else {
    obj = raw;
  }
  const kind = typeof obj.kind === 'string' ? obj.kind : undefined;
  const userId = typeof obj.userId === 'string' ? obj.userId : undefined;
  const planId = typeof obj.planId === 'string' ? obj.planId : undefined;
  return { kind, userId, planId };
}

function extractPlanCode(payload: PaystackEvent): string | null {
  const p = payload.data.plan;
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.plan_code ?? null;
}

function parsePeriodEnd(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request) {
  // try/finally wraps the handler so any Sentry captures inside (the
  // amount-mismatch fraud signal, the email-fail capture, or any future
  // capture) flush before the response returns. On serverless (Vercel)
  // the function may freeze the instant we return, dropping in-flight
  // Sentry sends. Sentry.flush is a no-op when the queue is empty, so
  // success-path requests pay no latency.
  try {
    const raw = await req.text();
    const sig = req.headers.get('x-paystack-signature');
    if (!verifyPaystackSignature(raw, sig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: PaystackEvent;
    try {
      payload = JSON.parse(raw) as PaystackEvent;
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // ---- Subscription lifecycle events ----
    //
    // subscription.create fires once when Paystack provisions a new
    // subscription (after the first successful charge against a plan).
    // The payload carries subscription_code + email_token (we need
    // both to disable later) and next_payment_date (our
    // currentPeriodEnd). We upsert by userId so re-subscribing after a
    // cancel reuses the row.
    //
    // subscription.disable / subscription.not_renew fire when auto-
    // renew stops, either because the user cancelled or Paystack gave
    // up after retries. We flip status to CANCELLED and stamp
    // cancelledAt; the discount keeps applying through
    // currentPeriodEnd (lazy expire takes over after).
    if (
      payload.event === 'subscription.create' ||
      payload.event === 'subscription.disable' ||
      payload.event === 'subscription.not_renew'
    ) {
      const subCode = payload.data.subscription_code;
      const meta = metadataKind(payload);
      // Paystack sometimes only includes the customer email on
      // subscription events; fall back to that to locate the user.
      const email = payload.data.customer?.email?.toLowerCase().trim() ?? null;
      const periodEnd = parsePeriodEnd(payload.data.next_payment_date);

      // Resolve target user. Prefer metadata.userId set by our init
      // call; fall back to the customer email; lastly fall back to the
      // subscription_code we may already have linked.
      let userId: string | null = meta.userId ?? null;
      if (!userId && email) {
        const u = await db.user.findUnique({ where: { email }, select: { id: true } });
        userId = u?.id ?? null;
      }
      if (!userId && subCode) {
        const m = await db.membership
          .findUnique({ where: { paystackSubscriptionCode: subCode }, select: { userId: true } })
          .catch(() => null);
        userId = m?.userId ?? null;
      }
      if (!userId) {
        // Nothing to attach to. ACK so Paystack doesn't retry; capture
        // for ops to investigate (probably a stale subscription pre-
        // dating this codebase, or a customer whose User row was
        // deleted).
        Sentry.captureMessage('[paystack webhook] subscription event with no user match', {
          level: 'warning',
          tags: { kind: 'subscription-no-user', event: payload.event },
          extra: { subscriptionCode: subCode, email },
        });
        return NextResponse.json({ ok: true, ignored: 'no user match' });
      }

      // Resolve plan: prefer metadata.planId, fall back to plan_code
      // from data.plan, fall back to whatever plan the existing
      // membership row points at, fall back to the lone active plan.
      let planId: string | null = meta.planId ?? null;
      if (!planId) {
        const pc = extractPlanCode(payload);
        if (pc) {
          const p = await db.membershipPlan
            .findUnique({ where: { paystackPlanCode: pc }, select: { id: true } })
            .catch(() => null);
          planId = p?.id ?? null;
        }
      }
      if (!planId) {
        const existing = await db.membership.findUnique({
          where: { userId },
          select: { planId: true },
        });
        planId = existing?.planId ?? null;
      }
      if (!planId) {
        const fallback = await db.membershipPlan.findFirst({
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        planId = fallback?.id ?? null;
      }
      if (!planId) {
        Sentry.captureMessage('[paystack webhook] subscription event with no plan match', {
          level: 'warning',
          tags: { kind: 'subscription-no-plan', event: payload.event },
          extra: { subscriptionCode: subCode, userId },
        });
        return NextResponse.json({ ok: true, ignored: 'no plan match' });
      }

      try {
        if (payload.event === 'subscription.create') {
          await db.membership.upsert({
            where: { userId },
            create: {
              userId,
              planId,
              status: MembershipStatus.ACTIVE,
              paystackSubscriptionCode: subCode ?? null,
              paystackEmailToken: payload.data.email_token ?? null,
              currentPeriodEnd: periodEnd,
              paystackPayload: payload as unknown as object,
            },
            update: {
              planId,
              status: MembershipStatus.ACTIVE,
              paystackSubscriptionCode: subCode ?? null,
              paystackEmailToken: payload.data.email_token ?? null,
              // Only push period end forward; never shorten it on a
              // late-arriving event.
              ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
              cancelledAt: null,
              paystackPayload: payload as unknown as object,
            },
          });
        } else {
          // subscription.disable / not_renew
          await db.membership
            .update({
              where: { userId },
              data: {
                status: MembershipStatus.CANCELLED,
                cancelledAt: new Date(),
                paystackPayload: payload as unknown as object,
              },
            })
            .catch(() => null);
        }
      } catch (err) {
        captureError('[paystack webhook] subscription upsert failed', err, {
          event: payload.event,
          userId,
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ---- charge.success ----
    if (payload.event !== 'charge.success') {
      // Acknowledge other event types so Paystack doesn't retry. We
      // explicitly handle the events we care about above.
      return NextResponse.json({ ok: true, ignored: payload.event });
    }

    if (!payload.data.reference) {
      return NextResponse.json({ ok: true, ignored: 'no reference' });
    }

    // Subscription renewal: charge.success against an existing plan.
    // We discriminate by reference prefix (`dgsub_` for the initial
    // signup we initialised; renewals get auto-generated references
    // from Paystack but always carry data.plan). Either signal alone
    // is sufficient; we check both.
    const isMembershipCharge =
      payload.data.reference.startsWith('dgsub_') ||
      Boolean(extractPlanCode(payload)) ||
      metadataKind(payload).kind === 'membership';

    if (isMembershipCharge) {
      // The initial signup will be followed by subscription.create,
      // which is where we materialise the Membership row. For the
      // initial charge we just persist the payload for audit and let
      // subscription.create do the work.
      //
      // Renewal charges arrive WITHOUT a subscription.create follow-up,
      // so we push currentPeriodEnd forward here. We resolve the
      // membership by subscription_code if present; otherwise by the
      // customer email.
      const subCode = payload.data.subscription_code ?? null;
      const email = payload.data.customer?.email?.toLowerCase().trim() ?? null;

      let target = subCode
        ? await db.membership
            .findUnique({ where: { paystackSubscriptionCode: subCode } })
            .catch(() => null)
        : null;
      if (!target && email) {
        const u = await db.user.findUnique({ where: { email }, select: { id: true } });
        if (u) target = await db.membership.findUnique({ where: { userId: u.id } });
      }

      if (target) {
        const periodEnd = parsePeriodEnd(payload.data.next_payment_date);
        try {
          await db.membership.update({
            where: { id: target.id },
            data: {
              status: MembershipStatus.ACTIVE,
              ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
              paystackPayload: payload as unknown as object,
            },
          });
        } catch (err) {
          captureError('[paystack webhook] renewal update failed', err, {
            membershipId: target.id,
          });
        }
      } else {
        // Initial signup charge without a membership row yet, that's
        // fine. The follow-up subscription.create will materialise it.
        // Capture lightly so we have a trail in case something gets
        // stuck (e.g. subscription.create never fires).
        Sentry.captureMessage('[paystack webhook] membership charge ahead of subscription.create', {
          level: 'info',
          tags: { kind: 'subscription-charge-pre-create' },
          extra: { reference: payload.data.reference, email },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ---- Ticket-order charge.success (existing path) ----
    const order = await db.order.findUnique({
      where: { reference: payload.data.reference },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ ok: true, ignored: 'unknown reference' });
    }
    if (order.status === 'PAID') {
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (payload.data.amount !== order.totalMinor) {
      // Mark the order failed for ops review, but ACK the webhook with 200.
      // Returning a non-2xx here would trigger Paystack's exponential-backoff
      // retry loop, and every retry would re-detect the same mismatch, a
      // retry storm. The mismatch is captured in paystackPayload for ops.
      await db.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', paystackPayload: payload as unknown as object },
      });
      Sentry.captureMessage('[paystack webhook] amount mismatch', {
        level: 'error',
        tags: { kind: 'paystack-amount-mismatch' },
        extra: {
          reference: payload.data.reference,
          expected: order.totalMinor,
          received: payload.data.amount,
        },
      });
      return NextResponse.json({ ok: true, ignored: 'amount mismatch' });
    }

    await db.$transaction([
      db.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paystackPayload: payload as unknown as object,
        },
      }),
      ...order.items.map((item) =>
        db.orderItem.update({
          where: { id: item.id },
          data: {
            qrToken: signTicket({
              orderItemId: item.id,
              orderId: order.id,
              eventId: order.eventId,
              issuedAt: Date.now(),
            }),
          },
        }),
      ),
      ...order.items.map((item) =>
        db.ticketType.update({
          where: { id: item.ticketTypeId },
          data: { sold: { increment: item.quantity } },
        }),
      ),
    ]);

    // Confirmation email is best-effort, the order is already PAID and
    // the user can always reach their tickets via /tickets/[orderId]. A
    // mail-provider outage shouldn't bounce the webhook into a retry
    // (Paystack would re-fire and we'd attempt to mail twice).
    //
    // PDF attachment: regenerate inside try/catch and pass as
    // attachment so the buyer lands with a scannable QR in their
    // inbox. If PDF rendering fails (hero fetch, pdfkit) we still
    // send the HTML email, the "View your QR tickets" CTA resolves
    // the same thing, we just prefer the attachment because it's
    // cache-friendly and works offline at the door.
    try {
      const fresh = await db.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { event: true, items: { include: { ticketType: true } } },
      });
      const pdf = await buildTicketPdf(fresh.id).catch((err) => {
        captureError('[paystack webhook] ticket PDF build failed', err, {
          orderId: fresh.id,
          reference: payload.data.reference,
        });
        return null;
      });
      await sendOrderConfirmation({
        to: fresh.buyerEmail,
        buyerName: fresh.buyerName,
        orderId: fresh.id,
        reference: fresh.reference,
        totalMinor: fresh.totalMinor,
        currency: fresh.currency,
        eventTitle: fresh.event.title,
        eventStartsAt: fresh.event.startsAt,
        venueName: fresh.event.venueName,
        items: fresh.items.map((i) => ({
          name: i.ticketType.name,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
        })),
        attachments: pdf
          ? [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }]
          : undefined,
      });
    } catch (err) {
      captureError('[paystack webhook] order confirmation email failed', err, {
        orderId: order.id,
        reference: payload.data.reference,
      });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await Sentry.flush(2000);
  }
}
