import { AppError } from '../../errors.js';
import type { LeaveType } from './types.js';

const sickBackdateDays = 3;

export function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new AppError(422, 'INVALID_DATE', 'Date must be YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

  if (!isRealDate) {
    throw new AppError(422, 'INVALID_DATE', 'Date must be a real calendar date.');
  }

  return date;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function countWeekdays(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) {
    return 0;
  }

  let count = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addCalendarDays(cursor, 1)) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
}

export function rangesShareWeekday(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean {
  const start = firstStart.getTime() > secondStart.getTime() ? firstStart : secondStart;
  const end = firstEnd.getTime() < secondEnd.getTime() ? firstEnd : secondEnd;
  if (end.getTime() < start.getTime()) {
    return false;
  }

  return countWeekdays(start, end) > 0;
}

export function assertStartDateAllowed(leaveType: LeaveType, start: Date, today: Date): void {
  if (leaveType === 'SICK') {
    const earliest = addCalendarDays(today, -sickBackdateDays);
    if (start.getTime() < earliest.getTime()) {
      throw new AppError(
        422,
        'START_DATE_TOO_EARLY',
        'Sick leave can start at most 3 calendar days in the past.',
      );
    }
    return;
  }

  if (start.getTime() < today.getTime()) {
    const label = leaveType === 'ANNUAL' ? 'Annual' : 'Unpaid';
    throw new AppError(422, 'START_DATE_IN_PAST', `${label} leave cannot start in the past.`);
  }
}

export function describeLeaveSpan(
  leaveType: LeaveType,
  startInput: string,
  endInput: string,
  today: Date,
): { start: Date; end: Date; days: number } {
  const start = parseIsoDate(startInput);
  const end = parseIsoDate(endInput);

  if (end.getTime() < start.getTime()) {
    throw new AppError(422, 'DATE_ORDER', 'End date must be on or after the start date.');
  }

  assertStartDateAllowed(leaveType, start, today);
  const days = countWeekdays(start, end);
  if (days === 0) {
    throw new AppError(422, 'ZERO_WORKING_DAYS', 'The request must include at least one weekday.');
  }

  return { start, end, days };
}
