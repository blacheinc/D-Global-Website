'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

// VAPID public keys are url-safe base64. The PushManager expects a
// Uint8Array of the raw bytes — convert here.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'unsupported' | 'denied' | 'idle' | 'subscribed' | 'busy';

export function SubscribeButton({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === 'undefined') return;
      // Feature detection covers Safari ≤ 16 (no Push), private windows,
      // and embedded webviews. Showing nothing is friendlier than a
      // disabled button no one understands.
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? 'subscribed' : 'idle');
      } catch {
        if (!cancelled) setState('unsupported');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  if (state === 'unsupported' || !vapidPublicKey) return null;

  async function subscribe() {
    if (!vapidPublicKey) return;
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('subscribe failed');
      setState('subscribed');
    } catch {
      setState('idle');
    }
  }

  async function unsubscribe() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('idle');
    } catch {
      setState('subscribed');
    }
  }

  if (state === 'denied') {
    return (
      <p className="text-xs text-muted">
        Notifications are blocked. Re-enable them in your browser site settings.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant={state === 'subscribed' ? 'ghost' : 'primary'}
      size="sm"
      disabled={state === 'busy'}
      onClick={state === 'subscribed' ? unsubscribe : subscribe}
    >
      {state === 'subscribed' ? 'Disable notifications' : state === 'busy' ? '…' : 'Get drop alerts'}
    </Button>
  );
}
