export const site = {
  name: 'D Global Entertainment',
  // Compact form for the persistent header chrome where the full brand
  // name would crowd the layout on small viewports. Used by the Logo
  // wordmark; the full name still drives metadata, footer, emails.
  shortName: 'D Global',
  tagline: 'The sound of the night.',
  description:
    'D Global Entertainment, digital nightlife ecosystem. Discover events, reserve VIP tables, and step inside the sound shaping the city after dark.',
  nav: [
    { href: '/events', label: 'Events' },
    { href: '/bookings', label: 'VIP Tables' },
    { href: '/artists', label: 'Artists' },
    { href: '/releases', label: 'Releases' },
    { href: '/gallery', label: 'Gallery' },
  ],
  socials: {
    instagram: 'https://instagram.com/dglobal',
    twitter: 'https://twitter.com/dglobal',
    tiktok: 'https://tiktok.com/@dglobal',
    youtube: 'https://youtube.com/@dglobal',
  },
  contactEmail: 'hello@dglobal.gh',
} as const;
