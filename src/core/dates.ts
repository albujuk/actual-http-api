// Parses a YYYY-MM-DD string to local midnight of that day. The library formats a cutoff Date
// in local time, and new Date("YYYY-MM-DD") is UTC midnight, which is the day before west of UTC.
export function parseDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const [, y, m, d] = match ?? [];
  const date = new Date(0);
  // setFullYear, unlike the Date constructor, doesn't map years 0-99 to 1900-1999.
  date.setFullYear(Number(y), Number(m) - 1, Number(d));
  date.setHours(0, 0, 0, 0);
  if (!match || date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    throw new RangeError(`invalid day: ${day}`);
  }
  return date;
}
