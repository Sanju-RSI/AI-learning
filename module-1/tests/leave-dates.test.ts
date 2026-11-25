import { AppError } from '../src/errors';
import {
  addCalendarDays,
  assertStartDateAllowed,
  countWeekdays,
  describeLeaveSpan,
  parseIsoDate,
  rangesShareWeekday,
} from '../src/modules/leave/dates';

const today = parseIsoDate('2026-11-25');

function errorCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) {
      return error.code;
    }
    throw error;
  }
  return 'NONE';
}

describe('leave dates', () => {
  it('counts a Monday to Wednesday request as 3 weekdays', () => {
    expect(countWeekdays(parseIsoDate('2026-12-14'), parseIsoDate('2026-12-16'))).toBe(3);
  });

  it('counts a single weekday as 1 day', () => {
    expect(countWeekdays(parseIsoDate('2026-12-14'), parseIsoDate('2026-12-14'))).toBe(1);
  });

  it('counts a Saturday to Sunday range as 0 days', () => {
    expect(countWeekdays(parseIsoDate('2026-12-12'), parseIsoDate('2026-12-13'))).toBe(0);
  });

  it('rejects an end date before the start date', () => {
    expect(errorCode(() => describeLeaveSpan('ANNUAL', '2026-12-16', '2026-12-14', today))).toBe(
      'DATE_ORDER',
    );
  });

  it('rejects a weekend-only request', () => {
    expect(errorCode(() => describeLeaveSpan('ANNUAL', '2026-12-12', '2026-12-13', today))).toBe(
      'ZERO_WORKING_DAYS',
    );
  });

  it('rejects an impossible calendar date', () => {
    expect(errorCode(() => parseIsoDate('2026-02-31'))).toBe('INVALID_DATE');
  });

  it('allows sick leave that starts 3 calendar days ago and rejects 4', () => {
    const threeDaysAgo = addCalendarDays(today, -3);
    const fourDaysAgo = addCalendarDays(today, -4);
    expect(() => assertStartDateAllowed('SICK', threeDaysAgo, today)).not.toThrow();
    expect(errorCode(() => assertStartDateAllowed('SICK', fourDaysAgo, today))).toBe(
      'START_DATE_TOO_EARLY',
    );
  });

  it('rejects annual and unpaid leave that starts in the past', () => {
    const yesterday = addCalendarDays(today, -1);
    expect(errorCode(() => assertStartDateAllowed('ANNUAL', yesterday, today))).toBe(
      'START_DATE_IN_PAST',
    );
    expect(errorCode(() => assertStartDateAllowed('UNPAID', yesterday, today))).toBe(
      'START_DATE_IN_PAST',
    );
  });

  it('detects shared weekdays and ignores a weekend-only overlap', () => {
    expect(
      rangesShareWeekday(
        parseIsoDate('2026-12-14'),
        parseIsoDate('2026-12-16'),
        parseIsoDate('2026-12-16'),
        parseIsoDate('2026-12-18'),
      ),
    ).toBe(true);

    expect(
      rangesShareWeekday(
        parseIsoDate('2026-12-14'),
        parseIsoDate('2026-12-14'),
        parseIsoDate('2026-12-15'),
        parseIsoDate('2026-12-16'),
      ),
    ).toBe(false);
  });
});
