'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, AlertTriangle, Camera, RefreshCw } from 'lucide-react';

// Camera-based QR scanner for gate crew.
//
// Detection backends (tried in order):
//   1. Native BarcodeDetector — Chrome, recent Edge, some Android.
//      Hardware-accelerated where supported, cheaper on battery.
//   2. jsqr fallback — pure JS, ~40KB gzipped, lazy-loaded the first
//      time a browser without BarcodeDetector hits the page. Works on
//      Safari / iOS Safari / Firefox / anything with getUserMedia.
//
// Permission flow: getUserMedia is always called on the user-gesture
// click of the Start button, BEFORE any capability decision — so the
// OS-level camera prompt appears even on browsers where the JS
// decoder story is weird. Detection backend is picked after the
// stream is running; if neither works we fall through to a clear
// "your browser can't decode QR" error rather than a silent dead end.

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
  | { stage: 'error'; kind: 'denied' | 'hardware' | 'no-decoder' | 'insecure'; message: string };

const SCAN_INTERVAL_MS = 150;
const DEBOUNCE_MS = 2500;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

type DecodeFn = () => Promise<string | null>;

export function Scanner({ token, eventTitle }: { token: string; eventTitle: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const decodeRef = useRef<DecodeFn | null>(null);
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
        if (json.ok) setShown({ kind: json.alreadyScanned ? 'already' : 'ok', result: json });
        else setShown({ kind: 'fail', message: json.message });
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

  // Decoder picker — runs AFTER getUserMedia so permission has already
  // been prompted. Prefers native BarcodeDetector; falls back to jsqr
  // (dynamic-imported so the ~40KB only ships to browsers that need it).
  const pickDecoder = useCallback(async (): Promise<DecodeFn | null> => {
    const video = videoRef.current;
    if (!video) return null;

    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async () => {
          if (video.readyState < 2) return null;
          try {
            const codes = await detector.detect(video);
            return codes[0]?.rawValue ?? null;
          } catch {
            return null;
          }
        };
      } catch {
        // Constructor can throw on partially-implemented builds — fall
        // through to jsqr.
      }
    }

    try {
      const { default: jsQR } = await import('jsqr');
      const canvas =
        canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      return async () => {
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQR(image.data, image.width, image.height, {
          // dontInvert speeds up scanning; QRs on tickets are always
          // dark-on-light, not inverted.
          inversionAttempts: 'dontInvert',
        });
        return res?.data ?? null;
      };
    } catch {
      return null;
    }
  }, []);

  const start = useCallback(async () => {
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
        kind: 'no-decoder',
        message:
          'This browser doesn’t expose a camera API. Use a recent Chrome, Edge, Safari, or Firefox.',
      });
      return;
    }

    setPhase({ stage: 'starting' });

    let stream: MediaStream;
    try {
      // Camera permission prompt fires here, always. Decoder choice is
      // deferred until after the stream is live so an unsupported
      // decoder can't silently block the prompt.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (err) {
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
      return;
    }

    streamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      await v.play().catch(() => undefined);
    }

    const decode = await pickDecoder();
    if (!decode) {
      stop();
      setPhase({
        stage: 'error',
        kind: 'no-decoder',
        message:
          'Couldn’t load the QR decoder on this browser. Try Chrome, Edge, or Safari (iOS 17+).',
      });
      return;
    }
    decodeRef.current = decode;
    setPhase({ stage: 'running' });

    intervalRef.current = setInterval(async () => {
      const fn = decodeRef.current;
      if (!fn) return;
      const value = await fn();
      if (!value) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.value === value && now - last.at < DEBOUNCE_MS) return;
      lastScanRef.current = { value, at: now };
      submit(value);
    }, SCAN_INTERVAL_MS);
  }, [pickDecoder, stop, submit]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  function clearResult() {
    setShown(null);
    lastScanRef.current = null;
  }

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
