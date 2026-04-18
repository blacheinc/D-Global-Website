import { EventForm } from '@/features/admin/components/EventForm';

export default function AdminEventNewPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New event</h1>
        <p className="mt-2 text-sm text-muted">Drafts stay hidden from /events until you publish.</p>
      </header>
      <EventForm />
    </div>
  );
}
