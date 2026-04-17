import 'server-only';
import { db } from '@/server/db';
import { EventStatus, type Prisma } from '@prisma/client';

const upcomingWhere = {
  status: EventStatus.PUBLISHED,
  startsAt: { gte: new Date() },
} satisfies Prisma.EventWhereInput;

export async function getUpcomingEvents({ take = 6 }: { take?: number } = {}) {
  return db.event.findMany({
    where: upcomingWhere,
    orderBy: { startsAt: 'asc' },
    take,
    include: {
      ticketTypes: { orderBy: { priceMinor: 'asc' } },
    },
  });
}

export async function getFeaturedEvent() {
  return db.event.findFirst({
    where: { ...upcomingWhere, featured: true },
    orderBy: { startsAt: 'asc' },
    include: {
      ticketTypes: { orderBy: { priceMinor: 'asc' } },
      lineup: { orderBy: { order: 'asc' }, include: { artist: true } },
    },
  });
}

export type EventFilters = {
  city?: string;
  genre?: string;
  when?: 'week' | 'month' | 'all';
};

export async function listEvents(filters: EventFilters = {}) {
  const where: Prisma.EventWhereInput = {
    status: EventStatus.PUBLISHED,
  };
  if (filters.city) where.venueCity = { equals: filters.city, mode: 'insensitive' };
  if (filters.genre) where.genre = { has: filters.genre.toLowerCase() };
  if (filters.when && filters.when !== 'all') {
    const now = new Date();
    const end = new Date(now);
    if (filters.when === 'week') end.setDate(end.getDate() + 7);
    if (filters.when === 'month') end.setMonth(end.getMonth() + 1);
    where.startsAt = { gte: now, lte: end };
  } else {
    where.startsAt = { gte: new Date() };
  }
  return db.event.findMany({
    where,
    orderBy: { startsAt: 'asc' },
    include: {
      ticketTypes: { orderBy: { priceMinor: 'asc' } },
    },
  });
}

export async function getEventBySlug(slug: string) {
  return db.event.findUnique({
    where: { slug },
    include: {
      ticketTypes: { orderBy: { priceMinor: 'asc' } },
      lineup: { orderBy: { order: 'asc' }, include: { artist: true } },
    },
  });
}

export async function getAllEventSlugs() {
  const events = await db.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    select: { slug: true },
  });
  return events.map((e) => e.slug);
}

export async function getAllCities() {
  const events = await db.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    select: { venueCity: true },
    distinct: ['venueCity'],
  });
  return events.map((e) => e.venueCity);
}

export async function getAllGenres() {
  const events = await db.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    select: { genre: true },
  });
  const set = new Set<string>();
  events.forEach((e) => e.genre.forEach((g) => set.add(g)));
  return [...set].sort();
}
