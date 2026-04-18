'use server';

import { z } from 'zod';
import { requireAdmin } from '@/server/auth';
import { broadcast, type BroadcastResult } from '@/server/push/sender';

const broadcastSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(500),
  url: z.string().url().optional().or(z.literal('')),
});

export type BroadcastFormState = {
  ok: boolean;
  error?: string;
  result?: BroadcastResult;
  fieldErrors?: Record<string, string[]>;
};

export async function broadcastPush(
  _prev: BroadcastFormState,
  formData: FormData,
): Promise<BroadcastFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Check the form fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const result = await broadcast({
      title: parsed.data.title,
      body: parsed.data.body,
      url: parsed.data.url || undefined,
      // Tag dedupes notifications: if we send a "doors open" alert
      // twice for the same event by mistake, the second replaces the
      // first instead of stacking.
      tag: `broadcast-${Date.now()}`,
    });
    return { ok: true, result };
  } catch (err) {
    console.error('[admin:broadcastPush]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Broadcast failed.' };
  }
}
