import {
  PrismaClient,
  TicketTier,
  PackageTier,
  EventStatus,
  ReleaseKind,
  GalleryCategory,
} from '@prisma/client';

const db = new PrismaClient();

// Anchor all date math to a single "now" so date offsets are consistent
// across the run, even if script execution straddles midnight.
const scriptStart = new Date();

const daysFromNow = (d: number) => {
  const date = new Date(scriptStart);
  date.setDate(date.getDate() + d);
  date.setHours(22, 0, 0, 0);
  return date;
};

const img = (id: string, w = 1600, h = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

async function main() {
  console.log('Seeding D-Global database…');

  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.booking.deleteMany();
  await db.artistBooking.deleteMany();
  await db.track.deleteMany();
  await db.release.deleteMany();
  await db.lineupSlot.deleteMany();
  await db.ticketType.deleteMany();
  await db.galleryImage.deleteMany();
  await db.event.deleteMany();
  await db.package.deleteMany();
  await db.artist.deleteMany();

  const packages = await Promise.all([
    db.package.create({
      data: {
        tier: PackageTier.SILVER,
        name: 'Silver Lounge',
        tagline: 'Premium entry. Reserved seating.',
        description:
          'A dedicated lounge area with priority entry, reserved seating and a welcome round. Perfect for small groups stepping into the night in style.',
        priceMinor: 250000,
        maxGuests: 4,
        bottlesIncl: 1,
        heroImage: img('photo-1514525253161-7a46d19cd819'),
        perks: ['Priority entry', 'Reserved seating for 4', '1 welcome bottle', 'Dedicated host'],
      },
    }),
    db.package.create({
      data: {
        tier: PackageTier.GOLD,
        name: 'Gold Suite',
        tagline: 'Elevated. Unforgettable.',
        description:
          'Table-side service, premium bottles and the best sightlines in the room. The Gold Suite is the sweet spot between intimacy and spectacle.',
        priceMinor: 500000,
        maxGuests: 8,
        bottlesIncl: 2,
        heroImage: img('photo-1566737236500-c8ac43014a67'),
        perks: [
          'Table-side service',
          'Premium seating for 8',
          '2 premium bottles',
          'Mixers included',
          'Skip-the-line',
        ],
      },
    }),
    db.package.create({
      data: {
        tier: PackageTier.PLATINUM,
        name: 'Platinum Owner Suite',
        tagline: 'Own the night.',
        description:
          'The flagship experience. Top-floor positioning, champagne service, dedicated security and bespoke arrival. Reserved only for the most serious nights.',
        priceMinor: 1200000,
        maxGuests: 12,
        bottlesIncl: 4,
        heroImage: img('photo-1470229722913-7c0e2dbbafd3'),
        perks: [
          'Top-tier positioning',
          'Private section for 12',
          '4 champagne bottles',
          'Dedicated hostess',
          'Private security',
          'Bespoke arrival',
        ],
      },
    }),
  ]);

  const artistsData = [
    {
      slug: 'kwesi-nyame',
      stageName: 'Kwesi Nyame',
      bio: 'Accra-born producer and performer shaping the next wave of afro-electronic sound.',
      avatar: img('photo-1493225457124-a3eb161ffa5f', 600, 600),
      heroImage: img('photo-1493225457124-a3eb161ffa5f'),
      spotifyId: '4q3ewBCX7sLwd24euuV69X',
      audiomackId: 'kwesi-nyame',
      instagram: 'kwesi.nyame',
      featured: true,
    },
    {
      slug: 'ama-black',
      stageName: 'Ama Black',
      bio: 'Alté-leaning vocalist with a cult following across West Africa.',
      avatar: img('photo-1522327646852-4e28586a40dd', 600, 600),
      heroImage: img('photo-1522327646852-4e28586a40dd'),
      spotifyId: '3TVXtAsR1Inumwj472S9r4',
      instagram: 'ama.black',
      featured: true,
    },
    {
      slug: 'dj-mensah',
      stageName: 'DJ Mensah',
      bio: 'Resident selector for D-Global. Amapiano-to-afro-house without a seatbelt.',
      avatar: img('photo-1511367461989-f85a21fda167', 600, 600),
      heroImage: img('photo-1511367461989-f85a21fda167'),
      instagram: 'dj.mensah',
      featured: true,
    },
    {
      slug: 'kofi-wave',
      stageName: 'Kofi Wave',
      bio: 'Producer/engineer who built the sound of the scene. Rarely on stage — always at the board.',
      avatar: img('photo-1531297484001-80022131f5a1', 600, 600),
      heroImage: img('photo-1531297484001-80022131f5a1'),
      instagram: 'kofi.wave',
      featured: false,
    },
  ];

  const artists = await Promise.all(
    artistsData.map((data) => db.artist.create({ data })),
  );

  const kwesi = artists[0]!;
  const ama = artists[1]!;
  const mensah = artists[2]!;

  await db.release.create({
    data: {
      slug: 'night-capital',
      artistId: kwesi.id,
      title: 'Night Capital',
      kind: ReleaseKind.EP,
      coverImage: img('photo-1493225457124-a3eb161ffa5f', 800, 800),
      releasedAt: daysFromNow(-45),
      spotifyUrl: 'https://open.spotify.com/album/6kZ42qRrzov54LcAk4onW9',
      audiomackUrl: 'https://audiomack.com/kwesi-nyame/album/night-capital',
      tracks: {
        create: [
          { title: 'Accra After Hours', durationSec: 214, order: 1 },
          { title: 'Independence', durationSec: 198, order: 2 },
          { title: 'Harmattan', durationSec: 243, order: 3 },
          { title: 'Oxford Street', durationSec: 189, order: 4 },
        ],
      },
    },
  });

  await db.release.create({
    data: {
      slug: 'golden-hour',
      artistId: ama.id,
      title: 'Golden Hour',
      kind: ReleaseKind.SINGLE,
      coverImage: img('photo-1522327646852-4e28586a40dd', 800, 800),
      releasedAt: daysFromNow(-14),
      spotifyUrl: 'https://open.spotify.com/track/5RCf4dYbZfJ0bQgV8eLxTN',
      tracks: {
        create: [{ title: 'Golden Hour', durationSec: 207, order: 1 }],
      },
    },
  });

  await db.release.create({
    data: {
      slug: 'boulevard-mix-04',
      artistId: mensah.id,
      title: 'Boulevard Mix 04',
      kind: ReleaseKind.MIX,
      coverImage: img('photo-1511367461989-f85a21fda167', 800, 800),
      releasedAt: daysFromNow(-3),
      audiomackUrl: 'https://audiomack.com/dj-mensah/song/boulevard-mix-04',
      tracks: {
        create: [{ title: 'Boulevard Mix 04 (Full)', durationSec: 3624, order: 1 }],
      },
    },
  });

  const labsStart = daysFromNow(14);
  const accraLabs = await db.event.create({
    data: {
      slug: 'accra-labs-vol-07',
      title: 'Accra Labs Vol. 07',
      subtitle: 'Afrobeats × Amapiano × Future',
      description:
        'The seventh edition of the city\'s most anticipated underground series. A full-spectrum night of afrobeats, amapiano, and future-sound experiments from D-Global\'s resident roster and a special-guest headliner.',
      startsAt: labsStart,
      endsAt: daysFromNow(15),
      doorsAt: new Date(labsStart.getTime() - 2 * 60 * 60 * 1000),
      venueName: 'The Boulevard',
      venueCity: 'Accra',
      venueAddress: 'Airport Residential, Accra',
      venueMapUrl:
        'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3970.7!2d-0.1718!3d5.6037!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNcKwMzYnMTMuMyJOIDDCsDEwJzE4LjUiVw!5e0!3m2!1sen!2sgh!4v1700000000000',
      latitude: 5.6037,
      longitude: -0.1718,
      heroImage: img('photo-1514525253161-7a46d19cd819'),
      genre: ['afrobeats', 'amapiano', 'house'],
      status: EventStatus.PUBLISHED,
      featured: true,
      ticketTypes: {
        create: [
          {
            tier: TicketTier.EARLY_BIRD,
            name: 'Early Bird',
            description: 'Limited first-release pricing. Sells out fast.',
            priceMinor: 15000,
            quota: 150,
          },
          {
            tier: TicketTier.REGULAR,
            name: 'Regular Entry',
            description: 'General admission + welcome drink.',
            priceMinor: 25000,
            quota: 400,
          },
          {
            tier: TicketTier.VIP,
            name: 'VIP Access',
            description: 'Priority entry, VIP lounge access, express bar.',
            priceMinor: 60000,
            quota: 100,
          },
        ],
      },
      lineup: {
        create: [
          { displayName: 'Kwesi Nyame', artistId: kwesi.id, role: 'Headliner', order: 1 },
          { displayName: 'Ama Black', artistId: ama.id, role: 'Special Guest', order: 2 },
          { displayName: 'DJ Mensah', artistId: mensah.id, role: 'Resident', order: 3 },
          { displayName: 'TBA Surprise Act', role: 'Secret Set', order: 4 },
        ],
      },
    },
  });

  const blackRoomStart = daysFromNow(28);
  await db.event.create({
    data: {
      slug: 'black-room-sessions',
      title: 'Black Room Sessions',
      subtitle: 'Intimate listening. Full system.',
      description:
        'A stripped-back, listening-first evening in the Black Room. Seated capacity only, D-Global records on rotation, the best system in the country.',
      startsAt: blackRoomStart,
      doorsAt: new Date(blackRoomStart.getTime() - 1 * 60 * 60 * 1000),
      venueName: 'D-Global HQ',
      venueCity: 'Accra',
      venueAddress: 'East Legon, Accra',
      heroImage: img('photo-1470229722913-7c0e2dbbafd3'),
      genre: ['house', 'soul', 'electronic'],
      status: EventStatus.PUBLISHED,
      featured: true,
      ticketTypes: {
        create: [
          {
            tier: TicketTier.REGULAR,
            name: 'Seated Entry',
            description: 'Seated only. Limited capacity.',
            priceMinor: 35000,
            quota: 120,
          },
          {
            tier: TicketTier.VIP,
            name: 'Front Row',
            description: 'Reserved front-row seating.',
            priceMinor: 90000,
            quota: 20,
          },
        ],
      },
      lineup: {
        create: [
          { displayName: 'Ama Black', artistId: ama.id, role: 'Live Set', order: 1 },
          { displayName: 'Kofi Wave', role: 'DJ Set', order: 2 },
        ],
      },
    },
  });

  await db.event.create({
    data: {
      slug: 'independence-weekender',
      title: 'Independence Weekender',
      subtitle: 'Three nights. One city.',
      description:
        'The city-wide takeover. Three consecutive nights across D-Global\'s flagship venues with a rotating lineup of residents, headliners and international guests.',
      startsAt: daysFromNow(60),
      endsAt: daysFromNow(63),
      heroImage: img('photo-1566737236500-c8ac43014a67'),
      genre: ['afrobeats', 'amapiano', 'house', 'hiphop'],
      venueName: 'Multiple Venues',
      venueCity: 'Accra',
      status: EventStatus.PUBLISHED,
      featured: false,
      ticketTypes: {
        create: [
          {
            tier: TicketTier.EARLY_BIRD,
            name: '3-Night Pass (Early Bird)',
            description: 'Access to all three nights. Sells out first.',
            priceMinor: 80000,
            quota: 300,
          },
          {
            tier: TicketTier.REGULAR,
            name: '3-Night Pass',
            priceMinor: 120000,
            quota: 700,
          },
          {
            tier: TicketTier.VIP,
            name: 'VIP Weekender',
            description: 'VIP access across all three nights.',
            priceMinor: 300000,
            quota: 100,
          },
        ],
      },
      lineup: {
        create: [
          { displayName: 'Kwesi Nyame', artistId: kwesi.id, order: 1 },
          { displayName: 'Ama Black', artistId: ama.id, order: 2 },
          { displayName: 'DJ Mensah', artistId: mensah.id, order: 3 },
        ],
      },
    },
  });

  const galleryImages = [
    { url: img('photo-1514525253161-7a46d19cd819'), category: GalleryCategory.EVENTS, caption: 'Opening night — the Boulevard', eventId: accraLabs.id },
    { url: img('photo-1470229722913-7c0e2dbbafd3'), category: GalleryCategory.EVENTS, caption: 'Main floor, 1am', eventId: accraLabs.id },
    { url: img('photo-1566737236500-c8ac43014a67'), category: GalleryCategory.VENUE, caption: 'VIP suite' },
    { url: img('photo-1493225457124-a3eb161ffa5f'), category: GalleryCategory.ARTISTS, caption: 'Kwesi Nyame — live' },
    { url: img('photo-1522327646852-4e28586a40dd'), category: GalleryCategory.ARTISTS, caption: 'Ama Black — backstage' },
    { url: img('photo-1511367461989-f85a21fda167'), category: GalleryCategory.BACKSTAGE, caption: 'The booth, Vol. 05' },
    { url: img('photo-1531297484001-80022131f5a1'), category: GalleryCategory.ARTISTS, caption: 'Kofi Wave — studio' },
    { url: img('photo-1571266028243-d220c6a1f1e6'), category: GalleryCategory.VENUE, caption: 'The room, before doors' },
    { url: img('photo-1459749411175-04bf5292ceea'), category: GalleryCategory.EVENTS, caption: 'Crowd — Vol. 06' },
    { url: img('photo-1504509546545-e000b4a62425'), category: GalleryCategory.CAMPAIGN, caption: 'Campaign — 2025' },
    { url: img('photo-1415201364774-f6f0bb35f28f'), category: GalleryCategory.EVENTS, caption: 'Closing — 4am' },
    { url: img('photo-1492684223066-81342ee5ff30'), category: GalleryCategory.CAMPAIGN, caption: 'Brand film stills' },
  ];

  await Promise.all(
    galleryImages.map((image, idx) =>
      db.galleryImage.create({
        data: { ...image, order: idx, featured: idx < 6 },
      }),
    ),
  );

  console.log(`Seeded ${artists.length} artists, ${packages.length} packages, 3 events, ${galleryImages.length} gallery images.`);
  console.log('Event featured:', accraLabs.slug);
}

main()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error(err);
    db.$disconnect();
    process.exit(1);
  });
