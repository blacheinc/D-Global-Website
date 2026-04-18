import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth';
import { uploadToR2, r2Configured } from '@/server/r2';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only image upload endpoint. Client POSTs multipart/form-data with
// fields: file (Blob), category (string). We relay to R2 and return the
// public URL. The endpoint is admin-gated via requireAdmin; rejected
// requests redirect to sign-in rather than 401, that's NextAuth's
// behavior and matches the rest of /admin.
//
// Size limit is 4MB to stay safely under Vercel's 4.5MB serverless body
// cap. If an operator needs larger files, switch to R2 presigned PUT
// uploads (client-to-R2 direct).

const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const ALLOWED_CATEGORIES = new Set(['events', 'artists', 'releases', 'packages', 'gallery']);

export async function POST(req: Request) {
  await requireAdmin();

  if (!r2Configured) {
    return NextResponse.json(
      { error: 'Uploads are not configured. Set R2_* env vars on your deployment.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  const category = form.get('category');

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)}MB.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, AVIF, or GIF images are accepted.' },
      { status: 415 },
    );
  }

  // Extension derived from content-type, not the original filename -
  // filenames are attacker-controlled; content-type still is, but at
  // least we map it to a closed set. Defense in depth: R2 serves files
  // with the stored Content-Type, not derived from path.
  const extFromType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  };
  const extension = extFromType[file.type] ?? 'bin';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2({
      body: buffer,
      contentType: file.type,
      category,
      extension,
    });
    return NextResponse.json({ url: result.url, key: result.key });
  } catch (err) {
    captureError('[api/admin/upload] R2 put failed', err, { category, size: file.size });
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 502 });
  }
}
