/**
 * Date utilities
 */

/**
 * Get today's date
 */
export function getTodaysDate(): Date {
  return new Date();
}

/**
 * Get a date N days ago from today
 */
export function getDaysAgo(days: number): Date {
  const today = getTodaysDate();
  const past = new Date(today);
  past.setDate(past.getDate() - days);
  return past;
}
