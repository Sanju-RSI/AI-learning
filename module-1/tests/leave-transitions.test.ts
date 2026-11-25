import { AppError } from '../src/errors';
import { parseIsoDate } from '../src/modules/leave/dates';
import { nextStatus } from '../src/modules/leave/transitions';

const today = parseIsoDate('2026-11-25');
const futureStart = parseIsoDate('2026-12-14');
const started = parseIsoDate('2026-11-25');

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

describe('leave transitions', () => {
  it('approves and rejects only pending requests', () => {
    expect(nextStatus('PENDING', 'approve', futureStart, today)).toBe('APPROVED');
    expect(nextStatus('PENDING', 'reject', futureStart, today)).toBe('REJECTED');
    expect(errorCode(() => nextStatus('APPROVED', 'approve', futureStart, today))).toBe(
      'INVALID_TRANSITION',
    );
    expect(errorCode(() => nextStatus('REJECTED', 'reject', futureStart, today))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('cancels pending leave and future approved leave', () => {
    expect(nextStatus('PENDING', 'cancel', futureStart, today)).toBe('CANCELLED');
    expect(nextStatus('APPROVED', 'cancel', futureStart, today)).toBe('CANCELLED');
  });

  it('rejects cancellation once approved leave has started', () => {
    expect(errorCode(() => nextStatus('APPROVED', 'cancel', started, today))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('rejects further action on terminal requests', () => {
    expect(errorCode(() => nextStatus('REJECTED', 'cancel', futureStart, today))).toBe(
      'INVALID_TRANSITION',
    );
    expect(errorCode(() => nextStatus('CANCELLED', 'approve', futureStart, today))).toBe(
      'INVALID_TRANSITION',
    );
  });
});
