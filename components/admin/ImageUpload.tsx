'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Form field that combines a URL text input with an upload button. The
// URL is the source of truth (stored on the model); the uploader is a
// shortcut to populate it. Direct paste is always allowed — we don't
// want to break the flow when an operator has a Cloudinary URL in
// hand, or when R2 is unconfigured in the current environment.
//
// The component renders a hidden real input (so the parent <form>
// submits the URL via FormData) plus a visible labeled text input that
// the admin can edit directly. Uploading sets the text input's value
// via uncontrolled state — mirrors how EventForm handles all its other
// fields (defaultValue + DOM-backed state).

// Mirror the server's MAX_BYTES so we can short-circuit oversize files
// client-side instead of burning upload bandwidth only to be rejected
// with 413. Server is still the source of truth — this is just a UX
// optimization.
const MAX_BYTES = 4 * 1024 * 1024;

export type ImageUploadProps = {
  name: string;
  defaultValue?: string | null;
  category: 'events' | 'artists' | 'releases' | 'packages' | 'gallery';
  required?: boolean;
  label?: string;
  ariaInvalid?: boolean;
};

export function ImageUpload({
  name,
  defaultValue,
  category,
  required,
  label,
  ariaInvalid,
}: ImageUploadProps) {
  const [url, setUrl] = useState(defaultValue ?? '');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`File too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
      setStatus('error');
      return;
    }
    setStatus('uploading');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error || 'Upload failed.');
        setStatus('error');
        return;
      }
      setUrl(body.url);
      setStatus('idle');
    } catch {
      setError('Network error — try again.');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="url"
          name={name}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required={required}
          aria-invalid={ariaInvalid}
          placeholder="https://..."
          className={cn(
            'flex-1 rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground placeholder:text-muted/60',
            'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 transition-colors',
            'aria-[invalid=true]:border-accent-hot aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-accent-hot/40',
          )}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={status === 'uploading'}
          className="shrink-0 rounded-full bg-white/5 border border-white/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
        >
          {status === 'uploading' ? 'Uploading…' : label ?? 'Upload'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Clear so re-selecting the same file re-triggers change.
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent-hot">
          {error}
        </p>
      )}
      {url && (
        // Plain <img> on purpose — this is admin-only and we want to show
        // arbitrary external URLs (Cloudinary, Spotify CDN, R2) without
        // adding every possible host to next/image's remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          decoding="async"
          loading="lazy"
          className="max-h-32 rounded-lg border border-white/10 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
    </div>
  );
}
