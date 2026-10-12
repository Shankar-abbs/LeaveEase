/**
 * LeaveEase — Date utilities
 * Timezone: Asia/Kolkata (IST, UTC+5:30)
 * Leave days stored as Postgres `date` (no time component).
 * Half-days: 0.5 deducted for start/end day when flagged.
 * Weekly off: HR setting (default Sat=6, Sun=0).
 */
import { differenceInCalendarDays, format, parseISO, isWeekend, getDay } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export const IST_TIMEZONE = 'Asia/Kolkata';

/** Format a date to YYYY-MM-DD in IST */
export function toISTDateString(date: Date): string {
  return formatInTimeZone(date, IST_TIMEZONE, 'yyyy-MM-dd');
}

/** Today's date in IST as YYYY-MM-DD */
export function todayIST(): string {
  return toISTDateString(new Date());
}

/** Parse a YYYY-MM-DD string to a local Date (midnight IST) */
export function parseDate(dateStr: string): Date {
  return fromZonedTime(parseISO(dateStr), IST_TIMEZONE);
}

/**
 * Count leave days between start and end (inclusive) excluding weekly-off days.
 * Applies half-day deduction for start and end day if flagged.
 *
 * @param startDate YYYY-MM-DD
 * @param endDate   YYYY-MM-DD
 * @param startHalf subtract 0.5 from first day
 * @param endHalf   subtract 0.5 from last day
 * @param weeklyOffDays  0=Sun, 1=Mon, ..., 6=Sat — default [0, 6]
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  startHalf: boolean,
  endHalf: boolean,
  weeklyOffDays: number[] = [0, 6]
): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (end < start) return 0;

  let days = 0;
  const current = new Date(start);

  while (current <= end) {
    const dow = getDay(current);
    if (!weeklyOffDays.includes(dow)) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }

  let deductions = 0;
  if (startHalf) {
    const startDow = getDay(start);
    if (!weeklyOffDays.includes(startDow)) deductions += 0.5;
  }
  if (endHalf && endDate !== startDate) {
    const endDow = getDay(end);
    if (!weeklyOffDays.includes(endDow)) deductions += 0.5;
  }
  // If start === end and both halves flagged, only 0.5 total
  if (startHalf && endHalf && endDate === startDate) {
    const dow = getDay(start);
    if (!weeklyOffDays.includes(dow)) return 0.5;
  }

  return Math.max(0, days - deductions);
}

/**
 * Prorate annual leave for a new joiner.
 * CL/SL: round to nearest 0.5, proportional to remaining months (incl. joining month).
 */
export function prorateAnnualLeave(quota: number, joiningDate: string): number {
  const join = parseISO(joiningDate);
  const monthsRemaining = 12 - join.getMonth(); // join.getMonth() is 0-indexed
  const raw = (quota / 12) * monthsRemaining;
  // Round to nearest 0.5
  return Math.round(raw * 2) / 2;
}

/**
 * EL monthly accrual: 1.25 days per month.
 * Prorate for joining month: if joined on day D, accrue (1.25 * (daysInMonth - D + 1) / daysInMonth).
 */
export function monthlyELAccrual(joiningDate?: string, periodYear?: number, periodMonth?: number): number {
  if (!joiningDate || !periodYear || !periodMonth) return 1.25;

  const join = parseISO(joiningDate);
  const joinYear = join.getFullYear();
  const joinMonth = join.getMonth() + 1; // 1-indexed

  if (periodYear === joinYear && periodMonth === joinMonth) {
    // Prorate
    const daysInMonth = new Date(periodYear, periodMonth, 0).getDate();
    const joinDay = join.getDate();
    const remaining = daysInMonth - joinDay + 1;
    const raw = 1.25 * (remaining / daysInMonth);
    return Math.round(raw * 2) / 2;
  }

  return 1.25;
}

/** Format date for display: "12 Oct 2026" */
export function displayDate(dateStr: string): string {
  return format(parseISO(dateStr), 'd MMM yyyy');
}

/** Format date range: "12–14 Oct 2026" or "12 Oct – 3 Nov 2026" */
export function displayDateRange(startStr: string, endStr: string): string {
  const start = parseISO(startStr);
  const end = parseISO(endStr);
  if (format(start, 'MMM yyyy') === format(end, 'MMM yyyy')) {
    return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}
