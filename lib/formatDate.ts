import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Africa/Accra';

export function formatEventDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TZ, 'EEE, d MMM yyyy');
}

export function formatEventDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TZ, "EEE, d MMM · HH:mm 'GMT'");
}

export function formatEventTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TZ, 'HH:mm');
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
};

export function diffCountdown(to: Date | string | number): CountdownParts {
  const target = typeof to === 'number' ? to : new Date(to).getTime();
  const total = Math.max(0, target - Date.now());
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}
