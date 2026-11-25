import { AppError } from '../../errors.js';
import type { LeaveType } from './types.js';

export function leaveTypeUsesBalance(leaveType: LeaveType): boolean {
  return leaveType === 'ANNUAL' || leaveType === 'SICK';
}

export function remainingDays(allocated: number, used: number, pending: number): number {
  return allocated - used - pending;
}

export function assertSufficientBalance(input: {
  leaveType: LeaveType;
  allocated: number;
  used: number;
  pending: number;
  requested: number;
}): void {
  if (!leaveTypeUsesBalance(input.leaveType)) {
    return;
  }

  const remaining = remainingDays(input.allocated, input.used, input.pending);
  if (input.requested > remaining) {
    const shortfall = input.requested - remaining;
    const label = input.leaveType === 'ANNUAL' ? 'Annual' : 'Sick';
    const unit = shortfall === 1 ? 'day' : 'days';
    throw new AppError(
      422,
      'INSUFFICIENT_BALANCE',
      `${label} leave balance is short by ${shortfall} ${unit}.`,
      { remaining, requested: input.requested },
    );
  }
}
