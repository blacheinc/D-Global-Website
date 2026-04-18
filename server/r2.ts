import 'server-only';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

// Cloudflare R2 client. R2 is S3-compatible, so we use the AWS SDK v3
// pointed at R2's S3 endpoint. Credentials come from env (see
// .env.example). Uploads only succeed if all five R2_* vars are set;
// env.ts's refinement catches half-configured deploys at boot.
//
// Why a module-level client: the SDK creates a connection pool. Reusing
// it across requests keeps latency predictable; per-request instantiation
// burns ~50–100ms on cold TLS handshakes.

export const r2Configured = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET &&
  env.R2_PUBLIC_URL
);

const client =
  r2Configured && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

export type UploadArgs = {
  body: Buffer | Uint8Array;
  contentType: string;
  // One of 'events' | 'artists' | 'releases' | 'packages' | 'gallery'.
  // The prefix organizes the bucket so an operator can eyeball what's
  // where and apply lifecycle rules per category if they want to.
  category: string;
  // Preserved extension, lowercased, stripped of anything weird. The
  // random key means we never collide on repeated uploads of files with
  // the same name.
  extension: string;
};

export type UploadResult = { key: string; url: string };

function safeExtension(ext: string): string {
  const cleaned = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.slice(0, 8) || 'bin';
}

export async function uploadToR2(args: UploadArgs): Promise<UploadResult> {
  if (!client || !env.R2_BUCKET || !env.R2_PUBLIC_URL) {
    throw new Error('[r2] R2 is not configured, set R2_* env vars to enable uploads.');
  }
  // 16 random bytes → 32 hex chars. Collision-resistant and opaque -
  // object names don't leak the uploader or original filename.
  const key = `${args.category}/${Date.now().toString(36)}-${randomBytes(16).toString('hex')}.${safeExtension(args.extension)}`;
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: args.body,
      ContentType: args.contentType,
      // Year-long cache on the CDN. Object names are immutable (fresh
      // random each upload), so immutable cache is safe, any edit
      // produces a new key.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return {
    key,
    url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`,
  };
}

// Best-effort cleanup when an admin replaces an image. We don't block
// on this, if R2 is slow or the object doesn't exist, the form save
// still succeeds. Stale objects cost pennies per month; orphaned objects
// get pruned by a lifecycle rule if operators want.
export async function deleteFromR2(key: string): Promise<void> {
  if (!client || !env.R2_BUCKET) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch {
    // Swallow, see rationale above.
  }
}
