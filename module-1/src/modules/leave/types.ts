export const leaveTypes = ['ANNUAL', 'SICK', 'UNPAID'] as const;
export const leaveStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export type LeaveType = (typeof leaveTypes)[number];
export type LeaveStatus = (typeof leaveStatuses)[number];
export type LeaveAction = 'approve' | 'reject' | 'cancel';

export type LeaveRequestRecord = {
  id: string;
  employeeId: string;
  managerId: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  version: number;
  decidedBy: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actorId: string;
  fromStatus: LeaveStatus | null;
  toStatus: LeaveStatus;
  reason: string | null;
  createdAt: string;
};
