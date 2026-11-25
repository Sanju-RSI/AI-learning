import { AppError } from '../src/errors';
import { assertCanCancel, assertCanDecide } from '../src/modules/leave/access';

const employee = { id: 'employee', role: 'EMPLOYEE' as const };
const manager = { id: 'manager', role: 'MANAGER' as const };
const admin = { id: 'admin', role: 'ADMIN' as const };
const ownRequest = { employeeId: 'employee', managerId: 'manager' };
const outsideRequest = { employeeId: 'other', managerId: 'admin' };

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

describe('leave access', () => {
  it('stops an employee from approving their own request', () => {
    expect(errorCode(() => assertCanDecide(employee, ownRequest))).toBe('SELF_DECISION');
  });

  it('lets a manager decide a direct report and blocks other teams', () => {
    expect(() => assertCanDecide(manager, ownRequest)).not.toThrow();
    expect(errorCode(() => assertCanDecide(manager, outsideRequest))).toBe('FORBIDDEN');
  });

  it('lets an admin decide someone else and blocks a self decision', () => {
    expect(() => assertCanDecide(admin, ownRequest)).not.toThrow();
    expect(errorCode(() => assertCanDecide(admin, { employeeId: 'admin', managerId: null }))).toBe(
      'SELF_DECISION',
    );
  });

  it('lets the requester or an admin cancel, and blocks a manager canceling a report', () => {
    expect(() => assertCanCancel(employee, ownRequest)).not.toThrow();
    expect(() => assertCanCancel(admin, ownRequest)).not.toThrow();
    expect(errorCode(() => assertCanCancel(manager, ownRequest))).toBe('FORBIDDEN');
  });
});
