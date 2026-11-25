import { AppError } from '../src/errors';
import { assertSufficientBalance, remainingDays } from '../src/modules/leave/balances';

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

describe('leave balances', () => {
  it('subtracts used and pending days from the allocation', () => {
    expect(remainingDays(20, 4, 3)).toBe(13);
  });

  it('allows a request that uses the exact remaining balance', () => {
    expect(() =>
      assertSufficientBalance({
        leaveType: 'SICK',
        allocated: 10,
        used: 4,
        pending: 3,
        requested: 3,
      }),
    ).not.toThrow();
  });

  it('rejects annual or sick leave beyond the remaining balance', () => {
    expect(
      errorCode(() =>
        assertSufficientBalance({
          leaveType: 'ANNUAL',
          allocated: 20,
          used: 0,
          pending: 15,
          requested: 6,
        }),
      ),
    ).toBe('INSUFFICIENT_BALANCE');
  });

  it('does not apply a balance check to unpaid leave', () => {
    expect(() =>
      assertSufficientBalance({
        leaveType: 'UNPAID',
        allocated: 0,
        used: 0,
        pending: 0,
        requested: 40,
      }),
    ).not.toThrow();
  });
});
