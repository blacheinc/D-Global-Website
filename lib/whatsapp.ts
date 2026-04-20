// The business line. Hardcoded rather than read from env so a stale
// NEXT_PUBLIC_WHATSAPP_NUMBER left over in a deploy's dashboard can't
// silently override it. Every wa.me link on the platform funnels
// through buildWaLink(), so this one constant guarantees consistency.
// If the business number ever changes, update it here (and remove the
// NEXT_PUBLIC_WHATSAPP_NUMBER env variable wherever it was set).
export const BUSINESS_WHATSAPP_NUMBER = '233244963777';

export function buildWaLink(
  text: string,
  number: string = BUSINESS_WHATSAPP_NUMBER,
): string {
  const cleanNumber = number.replace(/\D/g, '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
}

type BookingContext = {
  packageName: string;
  partySize: number;
  eventTitle?: string | null;
  eventDate?: string | null;
  bookingCode?: string;
  guestName: string;
};

export function buildBookingMessage(ctx: BookingContext): string {
  const parts = [
    `Hi D Global Entertainment 👋`,
    `I'd like to book a ${ctx.packageName} table for ${ctx.partySize} ${
      ctx.partySize === 1 ? 'guest' : 'guests'
    }.`,
  ];
  if (ctx.eventTitle) {
    parts.push(`Event: ${ctx.eventTitle}${ctx.eventDate ? `, ${ctx.eventDate}` : ''}`);
  }
  parts.push(`Name: ${ctx.guestName}`);
  if (ctx.bookingCode) {
    parts.push(`Booking reference: ${ctx.bookingCode}`);
  }
  return parts.join('\n');
}

export function buildEventInquiryMessage(eventTitle: string): string {
  return `Hi D Global Entertainment, I'd like more info about "${eventTitle}", tickets and table availability.`;
}
