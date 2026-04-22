'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, AlertTriangle, Camera, RefreshCw } from 'lucide-react';

// Camera-based QR scanner for gate crew. Uses the native
// BarcodeDetector API — supported on Chrome / Edge / Safari (iOS 17+).
// No dep on a third-party QR lib; on unsupported browsers we fall
// back to a message asking the admin to open a manual-entry form.
//
// Start-on-gesture: mobile Safari flakes out when getUserMedia() is
// called without a user gesture (and once a user picks "Don't Allow"
// on auto-prompt, there's no way to re-prompt without them going
// into Settings). We render a "Start scanner" button first and only
// call getUserMedia() after a click, which is both more reliable and
// gives us a clean "Retry" affordance when permission was denied.

type ServerOk = {
  ok: true;
  alreadyScanned: boolean;
  scannedAt: string;
  attendee: string;
  tier: string;
  ticketName: string;
};
type ServerFail = { ok: false; reason: string; message: string };
type ServerResult = ServerOk | ServerFail;

type ShownResult =
  | { kind: 'ok'; result: ServerOk }
  | { kind: 'already'; result: ServerOk }
  | { kind: 'fail'; message: string };

type Phase =
  | { stage: 'idle' }
  | { stage: 'starting' }
  | { stage: 'running' }
  | { stage: 'error'; kind: 'denied' | 'hardware' | 'unsupported' | 'insecure'; message: string };

const SCAN_INTERVAL_MS = 125;
const DEBOUNCE_MS = 2500;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function Scanner({ token, eventTitle }: { token: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });
  const [shown, setShown] = useState<ShownResult | null>(null);

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

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    // Up-front capability checks so the error we show is accurate
    // instead of a generic "camera denied" that masks the real cause.
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) {
      setPhase({
        stage: 'error',
        kind: 'insecure',
        message: 'Camera access requires HTTPS. Open the scanner over https:// and try again.',
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase({
        stage: 'error',
        kind: 'unsupported',
        message: 'This browser doesn’t expose a camera API. Use Chrome, Edge, or Safari (iOS 17+).',
      });
      return;
    }
    if (!window.BarcodeDetector) {
      setPhase({
        stage: 'error',
        kind: 'unsupported',
        message: 'This browser doesn’t support the QR scanner API. Use Chrome, Edge, or Safari (iOS 17+).',
      });
      return;
    }

    setPhase({ stage: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      if (!detectorRef.current) {
        detectorRef.current = new window.BarcodeDetector!({ formats: ['qr_code'] });
      }
      setPhase({ stage: 'running' });

      intervalRef.current = setInterval(async () => {
        const v = videoRef.current;
        const d = detectorRef.current;
        if (!v || !d || v.readyState < 2) return;
        try {
          const codes = await d.detect(v);
          if (codes.length === 0) return;
          const value = codes[0]!.rawValue;
          const now = Date.now();
          const last = lastScanRef.current;
          if (last && last.value === value && now - last.at < DEBOUNCE_MS) return;
          lastScanRef.current = { value, at: now };
          submit(value);
        } catch {
          // Transient decode failure — next tick will retry.
        }
      }, SCAN_INTERVAL_MS);
    } catch (err) {
      // Distinguish "user denied" from "no camera / busy / unknown"
      // so the UI can guide the person to the right recovery path.
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPhase({
          stage: 'error',
          kind: 'denied',
          message:
            'Camera access was blocked. Open the address bar’s camera icon (or Site Settings) and allow camera for this page, then tap Retry.',
        });
      } else {
        setPhase({
          stage: 'error',
          kind: 'hardware',
          message:
            'Couldn’t start the camera. Close other apps that may be using it and try again.',
        });
      }
    }
  }, [submit]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  function clearResult() {
    setShown(null);
    lastScanRef.current = null;
  }

  // ---- render ----

  const running = phase.stage === 'running';
  const starting = phase.stage === 'starting';
  const idle = phase.stage === 'idle';
  const errored = phase.stage === 'error';

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-bg aspect-[3/4] md:aspect-video">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${running ? '' : 'opacity-0'}`}
        />

        {idle && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-4">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Camera aria-hidden className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted max-w-xs mx-auto">
                Tap below to open the camera. The browser will ask you to allow camera access.
              </p>
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hot"
              >
                <Camera aria-hidden className="h-4 w-4" /> Start scanner
              </button>
              <p className="text-[11px] text-muted/80 max-w-xs mx-auto leading-relaxed">
                Not seeing a permission prompt after tapping? Camera access is blocked for this
                page. Open Site settings (lock icon next to the URL) → Camera → Allow, then tap
                Start again.
              </p>
            </div>
          </div>
        )}

        {starting && (
          <div className="absolute inset-0 grid place-items-center text-muted text-sm">
            <div className="flex items-center gap-3">
              <Camera aria-hidden className="h-5 w-5" />
              Starting camera…
            </div>
          </div>
        )}

        {errored && (
          <div className="absolute inset-0 grid place-items-center bg-bg/95 p-6 text-center">
            <div className="space-y-4 max-w-sm">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-hot/15 text-accent-hot">
                <X aria-hidden className="h-5 w-5" />
              </div>
              <p className="text-sm text-foreground">{phase.message}</p>
              {phase.kind === 'denied' && (
                <p className="text-[11px] text-muted leading-relaxed">
                  On iPhone: Settings → Safari → Camera → Allow. On Chrome: tap the lock icon next
                  to the URL → Site settings → Camera → Allow, then reload.
                </p>
              )}
              {(phase.kind === 'denied' || phase.kind === 'hardware') && (
                <button
                  type="button"
                  onClick={start}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hot"
                >
                  <RefreshCw aria-hidden className="h-4 w-4" /> Retry
                </button>
              )}
            </div>
          </div>
        )}

        {running && (
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

      {shown && <ResultPanel shown={shown} onDismiss={clearResult} />}
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
