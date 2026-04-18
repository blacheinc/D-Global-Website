import { db } from '@/server/db';
import { env } from '@/lib/env';
import { BroadcastForm } from '@/features/admin/components/BroadcastForm';

export default async function AdminPushPage() {
  const subscriberCount = await db.pushSubscription.count();
  const configured = !!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Push notifications</h1>
        <p className="mt-2 text-sm text-muted">
          {subscriberCount} subscriber{subscriberCount === 1 ? '' : 's'}.
          {configured ? '' : ' VAPID keys are not configured — broadcasts will fail until you set them.'}
        </p>
      </header>
      <BroadcastForm />
    </div>
  );
}
