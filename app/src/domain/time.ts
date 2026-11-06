/**
 * Time helpers for handling eatenAt timestamps and local dates.
 */

/**
 * Get the local date (YYYY-MM-DD) from an ISO 8601 local time with offset.
 * Extracts the date part directly from the ISO string to preserve the local date.
 */
export function getEatenLocalDate(eatenAt: string): string {
  // Extract YYYY-MM-DD from the ISO string (e.g., "2026-11-03T12:30:00+01:00")
  return eatenAt.substring(0, 10);
}

/**
 * Get current UTC timestamp as ISO 8601 string.
 */
export function getNowUtc(): string {
  return new Date().toISOString();
}

/**
 * Get current local time as ISO 8601 string with offset.
 */
export function getNowLocal(): string {
  const now = new Date();
  return formatLocalDateTime(now);
}

/**
 * Format a Date object as ISO 8601 local time with offset.
 * Example: 2026-11-03T12:30:00+01:00
 */
export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  // Get timezone offset in minutes
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

/**
 * Change only the date of an eatenAt timestamp, keeping the time of day.
 * Recomputes the UTC offset for the new date (DST-safe).
 */
export function changeEatenDate(eatenAt: string, newLocalDate: string): string {
  // Extract the time of day from the ISO string to preserve local wall-clock time
  const timeMatch = eatenAt.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!timeMatch) {
    throw new Error('Invalid eatenAt format');
  }
  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseInt(timeMatch[3], 10);

  // Parse new date (YYYY-MM-DD)
  const [year, month, day] = newLocalDate.split('-').map(Number);

  // Create new Date with same time of day
  const newDate = new Date(year, month - 1, day, hours, minutes, seconds);

  return formatLocalDateTime(newDate);
}

/**
 * Parse local date string (YYYY-MM-DD) to Date at start of day.
 */
export function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Change only the time of day of an eatenAt timestamp, keeping the local date.
 * Seconds are reset to 0. Recomputes the UTC offset for the new time (DST-safe).
 */
export function changeEatenTime(eatenAt: string, hours: number, minutes: number): string {
  const date = parseLocalDate(getEatenLocalDate(eatenAt));
  date.setHours(hours, minutes, 0, 0);
  return formatLocalDateTime(date);
}

/**
 * Get the local time of day (hours and minutes) of an eatenAt timestamp.
 */
export function getEatenTime(eatenAt: string): { hours: number; minutes: number } {
  const timeMatch = eatenAt.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) {
    throw new Error('Invalid eatenAt format');
  }
  return { hours: parseInt(timeMatch[1], 10), minutes: parseInt(timeMatch[2], 10) };
}

/**
 * Format a time of day as HH:mm.
 */
export function formatTimeOfDay(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Format the local date of a Date object as YYYY-MM-DD.
 */
export function formatLocalDate(date: Date): string {
  return formatLocalDateTime(date).substring(0, 10);
}

/**
 * Get today's local date (YYYY-MM-DD).
 */
export function getTodayLocalDate(): string {
  return formatLocalDate(new Date());
}

/**
 * Check whether a string is a valid local date (YYYY-MM-DD).
 */
export function isLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && formatLocalDate(parseLocalDate(value)) === value;
}

/**
 * Add a number of days to a local date (YYYY-MM-DD).
 */
export function addDays(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

/**
 * Title of a day: "Today", "Yesterday", "Tomorrow", or the weekday and date,
 * e.g. "Monday, 2 November" (with the year if it is not the year of today).
 */
export function formatDayTitle(localDate: string, today: string): string {
  if (localDate === today) return 'Today';
  if (localDate === addDays(today, -1)) return 'Yesterday';
  if (localDate === addDays(today, 1)) return 'Tomorrow';

  const date = parseLocalDate(localDate);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-GB', { month: 'long' });
  const year = localDate.substring(0, 4) === today.substring(0, 4) ? '' : ` ${date.getFullYear()}`;
  return `${weekday}, ${date.getDate()} ${month}${year}`;
}

/**
 * Format a UTC timestamp in local time for display, e.g. "3 Nov 2026, 12:30".
 */
export function formatTimestamp(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const time = formatTimeOfDay(date.getHours(), date.getMinutes());
  return `${date.getDate()} ${month} ${date.getFullYear()}, ${time}`;
}

/**
 * The updatedAt of a local write: now (UTC), but always later than the previous value.
 * Two edits within the same millisecond would otherwise look like a retry to the server (6.3).
 */
export function nextUpdatedAt(previous: string | null, now: Date = new Date()): string {
  const previousMs = previous === null ? Number.NEGATIVE_INFINITY : Date.parse(previous);
  return new Date(Math.max(now.getTime(), previousMs + 1)).toISOString();
}
