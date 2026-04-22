'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Admin CRUD for EventScanToken — tokenised "/scan/[token]" URLs that
// let the gate crew validate tickets on their phones without needing
// a full admin session. Each row's `token` is an unguessable cuid;
// the public scan page validates existence + !revokedAt + (optional)
// !expired before rendering the camera UI.

const createSchema = z.object({
  label: z.string().max(80).optional().or(z.literal('')),
  // datetime-local -> JS Date via zod coerce. Optional: a null expiry
  // means the token is valid until manually revoked.
  expiresAt: z.coerce.date().optional().or(z.literal('')),
});

export type ScanTokenFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createScanToken(
  eventId: string,
  _prev: ScanTokenFormState,
  formData: FormData,
): Promise<ScanTokenFormState> {
  await requireAdmin();
  const raw = {
    label: formData.get('label') || '',
    expiresAt: formData.get('expiresAt') || '',
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await db.eventScanToken.create({
      data: {
        eventId,
        label: parsed.data.label ? String(parsed.data.label) : null,
        expiresAt: parsed.data.expiresAt instanceof Date ? parsed.data.expiresAt : null,
      },
    });
  } catch (err) {
    captureError('[admin:createScanToken]', err, { eventId });
    return { ok: false, error: 'Could not create the scanner link. Try again.' };
  }
  revalidatePath(`/admin/events/${eventId}/scan`);
  return { ok: true };
}

export type RevokeScanTokenResult = { ok: true } | { ok: false; error: string };

export async function revokeScanToken(
  eventId: string,
  id: string,
): Promise<RevokeScanTokenResult> {
  await requireAdmin();
  try {
    // Flip revokedAt rather than deleting — lets us still show the link
    // row with a "revoked" badge so admins know it existed, and lets
    // the scanner page return a clear "this link was revoked" error
    // instead of a generic 404.
    await db.eventScanToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  } catch (err) {
    captureError('[admin:revokeScanToken]', err, { id });
    return { ok: false, error: 'Could not revoke the link. Try again.' };
  }
  revalidatePath(`/admin/events/${eventId}/scan`);
  return { ok: true };
}
