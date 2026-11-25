import { AppError } from '../../errors.js';
import type { Role } from '../auth/roles.js';

type Actor = {
  id: string;
  role: Role;
};

type RequestAccess = {
  employeeId: string;
  managerId: string | null;
};

export function assertCanDecide(actor: Actor, request: RequestAccess): void {
  if (actor.id === request.employeeId) {
    throw new AppError(403, 'SELF_DECISION', 'You cannot decide your own leave request.');
  }

  if (actor.role === 'ADMIN') {
    return;
  }

  if (actor.role === 'MANAGER' && request.managerId === actor.id) {
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You can decide leave only for your direct reports.');
}

export function assertCanCancel(actor: Actor, request: RequestAccess): void {
  if (actor.id === request.employeeId) {
    return;
  }

  if (actor.role === 'ADMIN') {
    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You can cancel only your own leave request.');
}

export function canViewRequest(actor: Actor, request: RequestAccess): boolean {
  if (actor.role === 'ADMIN' || actor.id === request.employeeId) {
    return true;
  }

  return actor.role === 'MANAGER' && request.managerId === actor.id;
}
