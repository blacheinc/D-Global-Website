import type { Metadata } from 'next';
import { MessageCircle, Instagram, Mail } from 'lucide-react';
import { buildWaLink } from '@/lib/whatsapp';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Reach D Global Entertainment for bookings, press and partnerships.',
};

export default function ContactPage() {
  return (
    <section className="container-px py-14 md:py-24">
      <div className="max-w-2xl">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-4 font-display text-display-xl text-balance">Let's talk.</h1>
        <p className="mt-4 text-muted md:text-lg">
          For bookings, VIP tables and general inquiries, the fastest way to reach us is WhatsApp.
          For press or partnerships, email the team directly.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
        <a
          href={buildWaLink('Hi D Global Entertainment 👋')}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl border border-white/10 bg-surface p-6 card-lift"
        >
          <MessageCircle className="h-6 w-6 text-accent" />
          <p className="mt-4 eyebrow">Fastest</p>
          <p className="mt-2 font-display text-xl group-hover:text-accent">WhatsApp</p>
          <p className="mt-1 text-xs text-muted">Replies within the hour</p>
        </a>
        <a
          href={`mailto:${site.contactEmail}`}
          className="group rounded-2xl border border-white/10 bg-surface p-6 card-lift"
        >
          <Mail className="h-6 w-6 text-accent" />
          <p className="mt-4 eyebrow">Press & partnerships</p>
          <p className="mt-2 font-display text-xl group-hover:text-accent">{site.contactEmail}</p>
        </a>
        <a
          href={site.socials.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl border border-white/10 bg-surface p-6 card-lift"
        >
          <Instagram className="h-6 w-6 text-accent" />
          <p className="mt-4 eyebrow">Socials</p>
          <p className="mt-2 font-display text-xl group-hover:text-accent">@dglobal</p>
        </a>
      </div>
    </section>
  );
}
