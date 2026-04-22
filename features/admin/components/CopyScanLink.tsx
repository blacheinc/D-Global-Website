'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Small copy-to-clipboard chip for the scanner URL column. Rendered
// on the admin scan-tokens page so an admin can copy a gate link
// straight into WhatsApp / email without dragging across the whole
// cell. Resets "Copied" state after 2s so repeat copies are obvious.

export function CopyScanLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older iOS / permission-blocked paths fall back to prompt() so
      // the admin can still grab it manually.
      prompt('Copy scanner link:', url);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Copied' : 'Copy scanner link'}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-foreground"
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
    </button>
  );
}
