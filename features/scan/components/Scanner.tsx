'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, AlertTriangle, Camera, RefreshCw, Download, Wifi, WifiOff, RefreshCcw } from 'lucide-react';

// Camera-based QR scanner for gate crew.
//
// Detection backends (tried in order):
//   1. Native BarcodeDetector, Chrome, recent Edge, some Android.
//      Hardware-accelerated where supported, cheaper on battery.
//   2. jsqr fallback, pure JS, ~40KB gzipped, lazy-loaded the first
//      time a browser without BarcodeDetector hits the page. Works on
//      Safari / iOS Safari / Firefox / anything with getUserMedia.
//
// Permission flow: getUserMedia is always called on the user-gesture
// click of the Start button, BEFORE any capability decision, so the
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
  // Group-purchase progress: how many physical units the OrderItem
  // represents and how many have been admitted so far (including this
  // scan if it consumed one). Both are present as of the scanCount
  // migration; older deployed clients tolerated null because they
  // were never set.
  scanCount?: number;
  quantity?: number;
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
  | {
      stage: 'error';
      kind: 'denied' | 'hardware' | 'no-decoder' | 'insecure' | 'in-app-browser';
      message: string;
    };

const SCAN_INTERVAL_MS = 150;
const DEBOUNCE_MS = 2500;

// ----- Offline pack -----
//
// The scanner page can pre-download a JSON pack of every valid qrToken
// for the event so it keeps working when the gate-crew device drops off
// network (basement venues, busy networks, captive-portal Wi-Fi). When
// offline mode is on, we look the scanned QR up against the pack
// instead of POSTing to /verify, track scans in a local delta map, and
// queue a pending sync entry per admit so the canonical scanCount on
// the server can be reconciled later via /api/scan/[token]/sync.

type OfflineTicket = {
  qrToken: string;
  orderItemId: string;
  attendee: string;
  tier: string;
  ticketName: string;
  quantity: number;
  scanCount: number;
};

type OfflinePack = {
  version: 1;
  eventId: string;
  eventTitle: string;
  generatedAt: string;
  tokenSession: string;
  tickets: OfflineTicket[];
};

type PendingScan = {
  orderItemId: string;
  scannedAt: string;
  nonce: string;
};

const packKey = (token: string) => `dg-scan-pack-${token}`;
const deltasKey = (token: string) => `dg-scan-deltas-${token}`;
const pendingKey = (token: string) => `dg-scan-pending-${token}`;

function loadJson<T>(key: string): T | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full / disabled. Silent: the user-visible flow
    // continues; offline mode just won't persist across reloads.
  }
}

function makeNonce(): string {
  // crypto.randomUUID exists everywhere we run; fallback to Math.random
  // is just defensive for ancient WebViews. Nonces are advisory, not a
  // security boundary.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `n_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

// Detect user agents that are known-problematic for getUserMedia on
// Android. These in-app WebViews either don't declare the CAMERA
// permission in their host app's manifest or disable the API at the
// WebView level. The list is deliberately Android-focused, iOS
// "in-app" browsers use SFSafariViewController or standard WKWebView
// which inherit the OS camera grant and work fine.
function isProblemInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Only fire the guard on Android, iOS paths go to Safari.
  if (!/Android/i.test(ua)) return false;
  // WhatsApp, Facebook (FBAN/FBAV), Instagram, TikTok, Line, WeChat,
  // Messenger. LinkedIn / Twitter also ship their own; catch the common
  // tokens.
  return /WhatsApp|FBAN|FBAV|Instagram|TikTok|Line|MicroMessenger|Messenger|LinkedInApp|Twitter/i.test(
    ua,
  );
}

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
  // Mirror of `shown` that the interval callback can read without
  // retriggering useEffect. While a result modal is up we gate the
  // submit path so a stray second QR in frame can't overwrite it.
  const shownRef = useRef<ShownResult | null>(null);

  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });
  const [shown, setShown] = useState<ShownResult | null>(null);

  // ----- Offline state -----
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  // Local-only scan deltas keyed by orderItemId. Effective scanCount
  // = pack.scanCount + (deltas[orderItemId] ?? 0).
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<PendingScan[]>([]);
  // Track navigator.onLine in state so the toolbar pill reflects
  // reality. Initialised to a generous default so SSR doesn't render
  // a misleading "Offline" before hydration.
  const [online, setOnline] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);

  // Load pack + deltas + pending queue from localStorage on mount.
  useEffect(() => {
    const p = loadJson<OfflinePack>(packKey(token));
    if (p && p.version === 1 && p.tokenSession === token) setPack(p);
    setDeltas(loadJson<Record<string, number>>(deltasKey(token)) ?? {});
    setPending(loadJson<PendingScan[]>(pendingKey(token)) ?? []);
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      setOnline(navigator.onLine);
    }
  }, [token]);

  // Track navigator.onLine in state so the toolbar pill reflects
  // network state without requiring a manual toggle.
  // Already declared above; this comment kept for context.

  // Refs that mirror the latest pending / syncing / sync-fn values so
  // the background interval can read fresh state without being
  // re-created on every render. setInterval inside a useEffect that
  // depends on those values would reset its 30s timer on every scan.
  const pendingRef = useRef<PendingScan[]>(pending);
  const syncingRef = useRef<boolean>(syncing);
  const onlineRef = useRef<boolean>(online);
  // syncPendingRef is declared after the function below; we initialize
  // with a noop so calling it before mount has no effect.
  const syncPendingRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  // Wire navigator online / offline events. The 'online' branch ALSO
  // tries an immediate sync when there's anything pending, so a gate
  // crew device that drops network mid-event flushes its queue the
  // instant signal returns, no manual button press required.
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (pendingRef.current.length > 0 && !syncingRef.current) {
        void syncPendingRef.current();
      }
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic background sync. 30s is tight enough that the server's
  // canonical scanCount stays close to the door's reality without
  // hammering the endpoint when the gate is quiet. Skips when:
  //   - we're offline (network lookup would fail anyway),
  //   - the queue is empty (nothing to push),
  //   - a sync is already in flight (avoid stacking).
  // Stable across re-renders via refs above, so a busy gate that
  // scans every few seconds still gets a tick every 30s rather than
  // resetting the timer on each state change.
  useEffect(() => {
    const id = setInterval(() => {
      if (
        onlineRef.current &&
        pendingRef.current.length > 0 &&
        !syncingRef.current
      ) {
        void syncPendingRef.current();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Index pack by qrToken for O(1) lookup at scan time. Recomputed
  // when the pack changes (rare, only on download).
  const packByQr = useMemo(() => {
    const m = new Map<string, OfflineTicket>();
    if (pack) for (const t of pack.tickets) m.set(t.qrToken, t);
    return m;
  }, [pack]);

  // Persist deltas / pending whenever they change. Cheap, JSON-stringified
  // size for a busy event is tens of KB at most.
  useEffect(() => {
    saveJson(deltasKey(token), deltas);
  }, [token, deltas]);
  useEffect(() => {
    saveJson(pendingKey(token), pending);
  }, [token, pending]);

  // Shared post-result side effects (haptics + state set). Same shape
  // for both online and offline branches so the UI behaves identically.
  const surfaceResult = useCallback((next: ShownResult) => {
    shownRef.current = next;
    setShown(next);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (next.kind === 'ok') navigator.vibrate(80);
      else if (next.kind === 'already') navigator.vibrate([60, 40, 60]);
      else navigator.vibrate([120, 60, 120]);
    }
  }, []);

  const submit = useCallback(
    async (qr: string) => {
      // Offline branch: look the QR up in the local pack, increment
      // the local delta, and queue a pending sync entry. No network
      // call, so the door keeps moving even when Wi-Fi drops mid-event.
      if (offlineMode) {
        if (!pack) {
          surfaceResult({
            kind: 'fail',
            message: 'No offline pack downloaded yet. Tap "Download pack" while online.',
          });
          return;
        }
        const ticket = packByQr.get(qr);
        if (!ticket) {
          // Not in the pack: either an event mismatch, a forged QR,
          // or the pack is stale (ticket issued after pack download).
          // We can't tell offline; surface a generic invalid.
          surfaceResult({ kind: 'fail', message: 'QR not in offline pack. Refresh while online.' });
          return;
        }
        const localDelta = deltas[ticket.orderItemId] ?? 0;
        const effectiveCount = ticket.scanCount + localDelta;
        if (effectiveCount >= ticket.quantity) {
          surfaceResult({
            kind: 'already',
            result: {
              ok: true,
              alreadyScanned: true,
              scannedAt: new Date().toISOString(),
              attendee: ticket.attendee,
              tier: ticket.tier,
              ticketName: ticket.ticketName,
              scanCount: effectiveCount,
              quantity: ticket.quantity,
            },
          });
          return;
        }
        // Admit one. Bump local delta + queue for sync. We use
        // functional setState so back-to-back rapid scans of different
        // QRs don't lose updates from stale closures.
        const now = new Date().toISOString();
        const nonce = makeNonce();
        setDeltas((d) => ({
          ...d,
          [ticket.orderItemId]: (d[ticket.orderItemId] ?? 0) + 1,
        }));
        setPending((q) => [...q, { orderItemId: ticket.orderItemId, scannedAt: now, nonce }]);
        surfaceResult({
          kind: 'ok',
          result: {
            ok: true,
            alreadyScanned: false,
            scannedAt: now,
            attendee: ticket.attendee,
            tier: ticket.tier,
            ticketName: ticket.ticketName,
            scanCount: effectiveCount + 1,
            quantity: ticket.quantity,
          },
        });
        return;
      }

      // Online branch: same path as before.
      try {
        const res = await fetch(`/api/scan/${token}/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ qr }),
          cache: 'no-store',
        });
        const json = (await res.json()) as ServerResult;
        const next: ShownResult = json.ok
          ? { kind: json.alreadyScanned ? 'already' : 'ok', result: json }
          : { kind: 'fail', message: json.message };
        surfaceResult(next);
      } catch {
        surfaceResult({ kind: 'fail', message: 'Network error, try again.' });
      }
    },
    [token, offlineMode, pack, packByQr, deltas, surfaceResult],
  );

  // Download a fresh pack from the server. Stored in localStorage so
  // the device can lose connectivity and still scan. If there's already
  // a pack with un-synced deltas, the new pack's scanCount snapshot
  // includes the synced ones; we carry over the LOCAL delta only for
  // orderItemIds whose snapshot hasn't caught up yet, otherwise we
  // reset (preventing a delta from being applied twice if a sync
  // succeeded between scans).
  const downloadPack = useCallback(async () => {
    setDownloading(true);
    setToolbarMessage(null);
    try {
      const res = await fetch(`/api/scan/${token}/export`, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const fresh = (await res.json()) as OfflinePack;
      if (fresh.version !== 1) throw new Error('Unsupported pack version');
      // Reconcile deltas against the new snapshot. Any orderItemId
      // whose new snapshot scanCount has caught up to (or passed)
      // the old snapshot + delta means the sync landed; drop the
      // delta for that id. Otherwise carry it forward.
      setDeltas((old) => {
        const next: Record<string, number> = {};
        const oldByItem: Record<string, OfflineTicket> = pack
          ? Object.fromEntries(pack.tickets.map((t) => [t.orderItemId, t]))
          : {};
        for (const t of fresh.tickets) {
          const oldDelta = old[t.orderItemId] ?? 0;
          if (oldDelta <= 0) continue;
          const oldSnap = oldByItem[t.orderItemId]?.scanCount ?? 0;
          const expected = oldSnap + oldDelta;
          // If server's new snapshot already reflects our delta (or
          // exceeds it from another scanner), we can drop it.
          if (t.scanCount >= expected) continue;
          next[t.orderItemId] = expected - t.scanCount;
        }
        return next;
      });
      setPack(fresh);
      saveJson(packKey(token), fresh);
      setToolbarMessage(`Pack updated, ${fresh.tickets.length} tickets cached.`);
    } catch (err) {
      setToolbarMessage(
        err instanceof Error ? `Pack download failed: ${err.message}` : 'Pack download failed.',
      );
    } finally {
      setDownloading(false);
    }
  }, [token, pack]);

  // Push the pending queue to the server. Each entry is applied
  // independently; entries the server rejected as not-found get
  // dropped (stale pack), the rest get cleared on success. Best-
  // effort, we stay quiet on transient errors so the gate crew can
  // retry from the toolbar.
  //
  // Optimistic clear with rollback: we snapshot the queue, clear it
  // immediately, then restore on rejection. If we cleared only after
  // a successful response, a fetch that succeeded server-side but
  // failed to deliver the response would leave the queue intact and
  // the next sync would re-apply every entry, double-counting
  // scanCount. The remaining "request applied + response lost"
  // window is much smaller than "any network error".
  const syncPending = useCallback(async () => {
    if (pending.length === 0) return;
    const snapshot = pending;
    setSyncing(true);
    setToolbarMessage(null);
    setPending([]);
    setDeltas({});
    try {
      const res = await fetch(`/api/scan/${token}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scans: snapshot }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setToolbarMessage(`Synced ${snapshot.length} scan${snapshot.length === 1 ? '' : 's'}.`);
    } catch (err) {
      // Rollback: prepend the snapshot to whatever the user has
      // queued in the meantime so no offline scans are dropped.
      // Deltas can't be reconstructed cleanly here, but the next
      // pack download's reconciliation logic will rebuild them
      // from the server snapshot.
      setPending((current) => [...snapshot, ...current]);
      setToolbarMessage(
        err instanceof Error ? `Sync failed: ${err.message}` : 'Sync failed, try again.',
      );
    } finally {
      setSyncing(false);
    }
  }, [token, pending]);

  // Keep the ref pointing at the latest syncPending so the background
  // interval + online-event handler can call it without bringing the
  // closure into their dependency arrays (which would tear down and
  // recreate the listeners + interval on every state change).
  useEffect(() => {
    syncPendingRef.current = syncPending;
  }, [syncPending]);

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

  // Decoder picker, runs AFTER getUserMedia so permission has already
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
        // Constructor can throw on partially-implemented builds, fall
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
    // In-app browsers on Android (WhatsApp / Facebook / Instagram /
    // TikTok web views) frequently block getUserMedia: either the host
    // app didn't declare CAMERA permission, or its WebView has the
    // feature disabled. The prompt never fires and everything looks
    // broken. Catch this before trying so we can route the user to
    // their system browser. iOS doesn't have the same issue, in-app
    // browsers there run through SFSafariViewController / real WKWebView
    // which inherit the OS camera grant.
    if (isProblemInAppBrowser()) {
      setPhase({
        stage: 'error',
        kind: 'in-app-browser',
        message:
          'Scanners don’t work inside in-app browsers. Open this page in Chrome (tap the ⋮ menu → Open in browser).',
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
      //
      // Try environment-facing camera first; some Android devices
      // (front-camera-only tablets, devices without back cam) reject
      // even the `ideal` hint with OverconstrainedError, so fall back
      // to any camera before giving up.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (innerErr) {
        if (
          innerErr instanceof DOMException &&
          (innerErr.name === 'OverconstrainedError' || innerErr.name === 'NotFoundError')
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw innerErr;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPhase({
          stage: 'error',
          kind: 'denied',
          message:
            'Camera access was blocked for this site. Allow camera in your browser settings, then tap Retry.',
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
      // Freeze scanning while a result modal is up. Gate crew should
      // finish reviewing (and tap Next) before a new QR in frame can
      // steal the panel.
      if (shownRef.current) return;
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
    shownRef.current = null;
    setShown(null);
    lastScanRef.current = null;
  }

  const running = phase.stage === 'running';
  const starting = phase.stage === 'starting';
  const idle = phase.stage === 'idle';
  const errored = phase.stage === 'error';

  return (
    <div className="space-y-4">
      {/* Offline toolbar. Renders even when no pack has been
          downloaded, the buttons themselves are the discovery surface
          for "you can work offline" so a venue with patchy wifi knows
          to download before the doors open. */}
      <div className="rounded-2xl border border-white/10 bg-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              online
                ? 'bg-accent/15 text-accent'
                : 'bg-accent-hot/15 text-accent-hot'
            }`}
          >
            {online ? (
              <Wifi aria-hidden className="h-3 w-3" />
            ) : (
              <WifiOff aria-hidden className="h-3 w-3" />
            )}
            {online ? 'Online' : 'Offline'}
          </span>
          {pack && (
            <span className="text-xs text-muted">
              Pack, {pack.tickets.length} tickets · saved{' '}
              {new Date(pack.generatedAt).toLocaleTimeString()}
            </span>
          )}
          {pending.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs text-muted">
              {pending.length} pending sync
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadPack}
            disabled={downloading || !online}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
          >
            <Download aria-hidden className="h-3.5 w-3.5" />
            {downloading ? 'Downloading...' : pack ? 'Refresh pack' : 'Download pack'}
          </button>
          <label
            className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs ${
              pack ? 'cursor-pointer hover:bg-white/10' : 'cursor-not-allowed opacity-50'
            }`}
            title={pack ? 'Use the local pack instead of the network' : 'Download a pack first'}
          >
            <input
              type="checkbox"
              className="h-3 w-3 accent-accent"
              checked={offlineMode}
              disabled={!pack}
              onChange={(e) => setOfflineMode(e.target.checked)}
            />
            Offline mode
          </label>
          {pending.length > 0 && (
            <button
              type="button"
              onClick={syncPending}
              disabled={syncing || !online}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hot disabled:opacity-50"
            >
              <RefreshCcw
                aria-hidden
                className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
              />
              {syncing ? 'Syncing...' : `Sync ${pending.length}`}
            </button>
          )}
        </div>
        {toolbarMessage && (
          <p className="text-xs text-muted" role="status">
            {toolbarMessage}
          </p>
        )}
      </div>

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
                  On Android Chrome: long-press the URL bar → Site settings → Camera → Allow, then
                  reload. On iPhone: Settings → Safari → Camera → Allow.
                </p>
              )}
              {phase.kind === 'in-app-browser' && <OpenInBrowserHelper />}
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

// Rendered inside the in-app-browser error state. Offers (a) a direct
// Android intent:// link that forces Chrome to handle it, and (b) a
// copy-URL button for fallback cases where the intent handler doesn't
// fire (Android 14+ sometimes blocks unverified intents). On tap of
// either, the user moves to a real browser where getUserMedia works.
function OpenInBrowserHelper() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copy this link and paste it into Chrome:', url);
    }
  }

  const chromeIntent =
    typeof window !== 'undefined'
      ? `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`
      : '#';

  return (
    <div className="space-y-3">
      <a
        href={chromeIntent}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hot"
      >
        Open in Chrome
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-foreground hover:bg-white/10"
      >
        {copied ? 'Link copied, paste into Chrome' : 'Copy link'}
      </button>
      <p className="text-[11px] text-muted leading-relaxed">
        The tap may ask you to pick a browser, choose Chrome, Samsung Internet, Firefox, or
        another browser that supports camera access.
      </p>
    </div>
  );
}

function ResultPanel({ shown, onDismiss }: { shown: ShownResult; onDismiss: () => void }) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the Next button so Enter dismisses from a keyboard,
  // and Esc dismisses via the keydown handler below. Door staff on
  // phones tap Next; keyboard support is for desk testing + a11y.
  useEffect(() => {
    dismissRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener('keydown', onKey);
    // Prevent the body scrolling behind the modal on iOS.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onDismiss]);

  // Group-purchase progress label: "(2 of 4)" when the QR represents
  // multiple units. Hidden for solo tickets (quantity 1) since the
  // count is implied. Falls back to no label if the server didn't send
  // the fields (older deploys, unlikely once this is shipped).
  const groupLabel = (() => {
    const q = shown.kind !== 'fail' ? shown.result.quantity : undefined;
    const c = shown.kind !== 'fail' ? shown.result.scanCount : undefined;
    if (typeof q !== 'number' || typeof c !== 'number' || q <= 1) return null;
    return `Admitted ${c} of ${q}`;
  })();

  const { tone, Icon, headline, body } = (() => {
    if (shown.kind === 'ok') {
      return {
        tone: 'ok',
        Icon: Check,
        headline: 'Valid, let them in',
        body: (
          <>
            <p className="text-lg font-medium text-foreground">{shown.result.attendee}</p>
            <p className="text-sm text-muted">
              {shown.result.ticketName} · {shown.result.tier}
            </p>
            {groupLabel && (
              <p className="mt-2 text-sm font-medium text-accent">{groupLabel}</p>
            )}
          </>
        ),
      } as const;
    }
    if (shown.kind === 'already') {
      // For multi-unit groups, "already scanned" only fires once every
      // unit has been admitted. Surface the full count so gate crew
      // sees this is a true repeat, not "you missed one".
      return {
        tone: 'warn',
        Icon: AlertTriangle,
        headline: 'Already scanned',
        body: (
          <>
            <p className="text-lg font-medium text-foreground">{shown.result.attendee}</p>
            <p className="text-sm text-muted">
              {groupLabel
                ? `${groupLabel}. Last admit ${new Date(shown.result.scannedAt).toLocaleTimeString()}.`
                : `First entry ${new Date(shown.result.scannedAt).toLocaleTimeString()}.`}{' '}
              Verify before letting them through.
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

  const toneBackdrop =
    tone === 'ok'
      ? 'bg-emerald-500/15'
      : tone === 'warn'
        ? 'bg-amber-500/15'
        : 'bg-accent-hot/15';
  const toneBorder =
    tone === 'ok'
      ? 'border-emerald-500/50'
      : tone === 'warn'
        ? 'border-amber-500/50'
        : 'border-accent-hot/50';
  const iconBg =
    tone === 'ok'
      ? 'bg-emerald-500/20 text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-500/20 text-amber-300'
        : 'bg-accent-hot/20 text-accent-hot';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-result-headline"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Backdrop. Clicking it dismisses, staff can tap anywhere
          outside the card to return to scanning. Tinted to the result
          tone so the colour reads at a glance from across the door. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={`absolute inset-0 backdrop-blur-md ${toneBackdrop}`}
      />
      <div
        className={`relative mx-3 mb-3 sm:mx-0 sm:mb-0 w-full sm:max-w-md rounded-3xl border-2 ${toneBorder} bg-bg p-6 md:p-8 shadow-2xl`}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${iconBg}`}
          >
            <Icon aria-hidden className="h-8 w-8" />
          </div>
          <div>
            <p
              id="scan-result-headline"
              className="font-display text-2xl md:text-3xl leading-tight"
            >
              {headline}
            </p>
            <div className="mt-3 space-y-1">{body}</div>
          </div>
          <button
            ref={dismissRef}
            type="button"
            onClick={onDismiss}
            className="mt-2 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Next ticket
          </button>
        </div>
      </div>
    </div>
  );
}
