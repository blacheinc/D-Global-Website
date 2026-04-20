export const site = {
  name: 'D Global Entertainment',
  // Compact form for the persistent header chrome where the full brand
  // name would crowd the layout on small viewports. Used by the Logo
  // wordmark; the full name still drives metadata, footer, emails.
  shortName: 'D Global',
  tagline: 'The sound of the night.',
  description:
    'D Global Entertainment, digital nightlife ecosystem. Discover events, reserve VIP tables, and step inside the sound shaping the city after dark.',
  // Public nav. Artists + Releases entries are temporarily hidden while
  // the record-label side is paused; routes, pages, and admin CRUD all
  // stay — just drop them back into this array when the label relaunches.
  //   { href: '/artists', label: 'Artists' },
  //   { href: '/releases', label: 'Releases' },
  nav: [
    { href: '/events', label: 'Events' },
    { href: '/bookings', label: 'VIP Tables' },
    { href: '/gallery', label: 'Gallery' },
  ],
  socials: {
    instagram: 'https://instagram.com/d_globalentertainmentgh',
    twitter: 'https://twitter.com/d_globalentertainmentgh',
    tiktok: 'https://tiktok.com/@d_globalentertainmentgh',
    youtube: 'https://youtube.com/@d_globalentertainmentgh',
  },
  contactEmail: 'dglobalentertainment@gmail.com',
} as const;
