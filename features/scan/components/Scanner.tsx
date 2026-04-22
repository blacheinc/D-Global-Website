'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, AlertTriangle, Camera } from 'lucide-react';

// Camera-based QR scanner for gate crew. Uses the native
// BarcodeDetector API — supported on Chrome / Edge / Safari (iOS 17+).
// No dep on a third-party QR lib; on unsupported browsers we fall
// back to a message asking the admin to open a manual-entry form.
//
// The scanning loop grabs a frame from the <video> ~8× per second and
// asks BarcodeDetector for QR codes in it. On a hit we debounce (so a
// ticket held in frame doesn't re-POST 40 times) and send the decoded
// string to /api/scan/[token]/verify. The server returns a structured
// result which we paint as a big Green/Yellow/Red result card so
// staff can act at a glance in low light.

type ServerOk = {
  ok: true;
  alreadyScanned: boolean;
  scannedAt: string;
  attendee: string;
  tier: string;
  ticketName: string;
};
type ServerFail = {
  ok: false;
  reason: string;
  message: string;
};
type ServerResult = ServerOk | ServerFail;

// Display result shape — "already scanned" gets its own tone so the
// yellow vs green vs red triage is obvious at a glance.
type ShownResult =
  | { kind: 'ok'; result: ServerOk }
  | { kind: 'already'; result: ServerOk }
  | { kind: 'fail'; message: string };

const SCAN_INTERVAL_MS = 125; // ~8 fps
const DEBOUNCE_MS = 2500;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

// BarcodeDetector isn't in stock DOM types. Declaring a structural
// interface lets us probe for it without a d.ts dep.
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function Scanner({ token, eventTitle }: { token: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [shown, setShown] = useState<ShownResult | null>(null);

  // Last decoded value + timestamp — same QR within DEBOUNCE_MS is
  // ignored so a ticket held up for a second doesn't fire the verify
  // endpoint repeatedly.
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const submit = useCallback(
    async (qr: string) => {
      try {
        const res = await fetch(`/api/scan/${token}/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ qr }),
          cache: 'no-store',
        });
        const json = (await res.json()) as ServerResult;
        if (json.ok) {
          setShown({ kind: json.alreadyScanned ? 'already' : 'ok', result: json });
        } else {
          setShown({ kind: 'fail', message: json.message });
        }
      } catch {
        setShown({ kind: 'fail', message: 'Network error — try again.' });
      }
    },
    [token],
  );

  useEffect(() => {
    const DetectorCtor = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
    if (!DetectorCtor) {
      setUnsupported(true);
      setStarting(false);
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const detector = new DetectorCtor({ formats: ['qr_code'] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStarting(false);

        interval = setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          try {
            const codes = await detector.detect(v);
            if (codes.length === 0) return;
            const value = codes[0]!.rawValue;
            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.value === value && now - last.at < DEBOUNCE_MS) return;
            lastScanRef.current = { value, at: now };
            submit(value);
          } catch {
            // detect() throws transient errors when the frame isn't
            // ready yet; silently skip, next tick will retry.
          }
        }, SCAN_INTERVAL_MS);
      } catch (err) {
        setStarting(false);
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access to scan tickets.'
            : 'Could not start the camera.',
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [submit]);

  function clearResult() {
    setShown(null);
    // Allow the last QR to be re-scanned immediately after dismissing.
    lastScanRef.current = null;
  }

  if (unsupported) {
    return (
      <div className="rounded-2xl border border-accent-hot/40 bg-accent-hot/10 p-6 text-sm">
        Your browser doesn't support the camera scanner. Use a recent version of Chrome, Edge, or
        Safari (iOS 17+) on this page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-bg aspect-[3/4] md:aspect-video">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {starting && (
          <div className="absolute inset-0 grid place-items-center text-muted text-sm">
            <div className="flex items-center gap-3">
              <Camera aria-hidden className="h-5 w-5" />
              Starting camera…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-bg/90 p-6 text-center text-sm">
            {error}
          </div>
        )}
        {/* Reticle to hint at aiming. Decorative; the detector scans the
            full frame regardless of where the QR is positioned. */}
        {!starting && !error && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div className="h-48 w-48 rounded-3xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
      </div>

      <p className="text-xs text-muted text-center">
        Point the camera at a ticket QR to check in {eventTitle}.
      </p>

      {shown && (
        <ResultPanel shown={shown} onDismiss={clearResult} />
      )}
    </div>
  );
}

function ResultPanel({ shown, onDismiss }: { shown: ShownResult; onDismiss: () => void }) {
  const { tone, Icon, headline, body } = (() => {
    if (shown.kind === 'ok') {
      return {
        tone: 'ok',
        Icon: Check,
        headline: 'Valid — let them in',
        body: (
          <>
            <p className="text-base font-medium text-foreground">{shown.result.attendee}</p>
            <p className="text-sm text-muted">
              {shown.result.ticketName} · {shown.result.tier}
            </p>
          </>
        ),
      } as const;
    }
    if (shown.kind === 'already') {
      return {
        tone: 'warn',
        Icon: AlertTriangle,
        headline: 'Already scanned',
        body: (
          <>
            <p className="text-base font-medium text-foreground">{shown.result.attendee}</p>
            <p className="text-sm text-muted">
              First entry {new Date(shown.result.scannedAt).toLocaleTimeString()}. Verify before
              letting them through.
            </p>
          </>
        ),
      } as const;
    }
    return {
      tone: 'bad',
      Icon: X,
      headline: 'Not valid',
      body: <p className="text-sm text-muted">{shown.message}</p>,
    } as const;
  })();

  const toneClass =
    tone === 'ok'
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-accent-hot/40 bg-accent-hot/10';
  const iconClass =
    tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-accent-hot';

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`} role="status" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="mt-0.5">
          <Icon aria-hidden className={`h-6 w-6 ${iconClass}`} />
        </div>
        <div className="flex-1">
          <p className="font-display text-xl leading-tight">{headline}</p>
          <div className="mt-2 space-y-1">{body}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted hover:bg-white/10 hover:text-foreground"
        >
          Next
        </button>
      </div>
    </div>
  );
}
