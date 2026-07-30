/**
 * Formats a yyyy-mm-dd string as e.g. "24 Jul 2026".
 *
 * Parsed as UTC on purpose: `new Date('2026-07-24')` is UTC midnight, so
 * formatting in a negative-offset local timezone would render the day before.
 */
export function formatLeadDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
