const GHS_FORMATTER = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 0,
});

const GHS_FORMATTER_WITH_CENTS = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPriceMinor(minor: number, currency = 'GHS'): string {
  const major = minor / 100;
  if (currency !== 'GHS') {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  }
  return major % 1 === 0
    ? GHS_FORMATTER.format(major)
    : GHS_FORMATTER_WITH_CENTS.format(major);
}
