'use client';

import { useState, useTransition } from 'react';

// Generic status-update control used by bookings and orders. Renders a
// <select> + Save button. Calling code provides the action and the
// allowed options. We keep it minimal (no useActionState) because the
// action signature takes (id, formData) which doesn't fit the
// two-arg (prev, formData) shape useActionState expects.

export function StatusSelect<T extends string>({
  current,
  options,
  action,
}: {
  current: T;
  options: ReadonlyArray<T>;
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    const res = await action(formData);
    if (!res.ok) {
      setError(res.error ?? 'Update failed.');
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        action={(fd) => startTransition(() => onSubmit(fd))}
        className="flex items-center gap-3"
      >
        <select
          name="status"
          defaultValue={current}
          className="rounded-xl bg-elevated border border-white/10 px-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-4 py-2 text-xs uppercase tracking-[0.18em] text-white hover:bg-accent-hot transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-accent-hot">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-xs text-emerald-400">
          Saved.
        </p>
      )}
    </div>
  );
}
