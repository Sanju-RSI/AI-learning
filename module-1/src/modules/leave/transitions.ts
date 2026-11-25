import { AppError } from '../../errors.js';
import type { LeaveAction, LeaveStatus } from './types.js';

export function nextStatus(
  from: LeaveStatus,
  action: LeaveAction,
  start: Date,
  today: Date,
): LeaveStatus {
  if (action === 'approve') {
    if (from !== 'PENDING') {
      throw new AppError(409, 'INVALID_TRANSITION', `Cannot approve a request that is ${from}.`);
    }
    return 'APPROVED';
  }

  if (action === 'reject') {
    if (from !== 'PENDING') {
      throw new AppError(409, 'INVALID_TRANSITION', `Cannot reject a request that is ${from}.`);
    }
    return 'REJECTED';
  }

  if (from === 'PENDING') {
    return 'CANCELLED';
  }

  if (from === 'APPROVED') {
    if (start.getTime() <= today.getTime()) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'Approved leave can be cancelled only before the start date.',
      );
    }
    return 'CANCELLED';
  }

  throw new AppError(409, 'INVALID_TRANSITION', `Cannot cancel a request that is ${from}.`);
}
