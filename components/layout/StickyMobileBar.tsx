'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ticket, Wine } from 'lucide-react';

export function StickyMobileBar() {
  const pathname = usePathname();
  const isHidden = pathname?.startsWith('/tickets/') || pathname?.startsWith('/bookings/confirmation');

  if (isHidden) return null;

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background/95 to-background/0">
      <div className="flex gap-3">
        <Link
          href="/events"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full bg-accent text-white text-sm font-medium glow-red hover:bg-accent-hot"
        >
          <Ticket className="h-4 w-4" />
          Get Tickets
        </Link>
        {/* Route to /bookings (the table-picker form) instead of
            firing a wa.me link directly. The form's own CTA continues
            to WhatsApp once the admin has picked a package + filled
            their details, so the chat that lands has real context. */}
        <Link
          href="/bookings"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full border border-white/15 bg-white/10 backdrop-blur text-foreground text-sm font-medium hover:bg-white/15"
        >
          <Wine className="h-4 w-4" />
          Book Table
        </Link>
      </div>
    </div>
  );
}
