import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../../db/transaction.js';
import { AppError } from '../../errors.js';
import type { Role } from '../auth/roles.js';
import { assertCanCancel, assertCanDecide, canViewRequest } from './access.js';
import { assertSufficientBalance, leaveTypeUsesBalance } from './balances.js';
import { describeLeaveSpan, formatIsoDate, parseIsoDate, rangesShareWeekday } from './dates.js';
import { nextStatus } from './transitions.js';
import type {
  AuditEvent,
  LeaveAction,
  LeaveRequestRecord,
  LeaveStatus,
  LeaveType,
} from './types.js';

type Actor = {
  id: string;
  role: Role;
  fullName: string;
  email: string;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  manager_id: string | null;
};

type RequestRow = {
  id: string;
  employee_id: string;
  manager_id: string | null;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: string | number;
  reason: string;
  status: LeaveStatus;
  version: number;
  decided_by: string | null;
  decision_reason: string | null;
  decided_at: Date | string | null;
  created_at: Date | string;
};

type BalanceResponse = {
  leaveType: LeaveType;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

const requestSelect = `
  SELECT lr.id,
         lr.employee_id,
         employee.manager_id,
         lr.leave_type,
         lr.start_date::text AS start_date,
         lr.end_date::text AS end_date,
         lr.days,
         lr.reason,
         lr.status,
         lr.version,
         lr.decided_by,
         lr.decision_reason,
         lr.decided_at,
         lr.created_at
  FROM leave_requests lr
  JOIN users employee ON employee.id = lr.employee_id
`;

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return new Date(value).toISOString();
}

function mapRequest(row: RequestRow): LeaveRequestRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    managerId: row.manager_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    days: toNumber(row.days),
    reason: row.reason,
    status: row.status,
    version: row.version,
    decidedBy: row.decided_by,
    decisionReason: row.decision_reason,
    decidedAt: toIsoTimestamp(row.decided_at),
    createdAt: toIsoTimestamp(row.created_at) ?? new Date(0).toISOString(),
  };
}

function publicRequest(record: LeaveRequestRecord): Omit<LeaveRequestRecord, 'managerId'> {
  return {
    id: record.id,
    employeeId: record.employeeId,
    leaveType: record.leaveType,
    startDate: record.startDate,
    endDate: record.endDate,
    days: record.days,
    reason: record.reason,
    status: record.status,
    version: record.version,
    decidedBy: record.decidedBy,
    decisionReason: record.decisionReason,
    decidedAt: record.decidedAt,
    createdAt: record.createdAt,
  };
}

async function loadActor(client: PoolClient, userId: string): Promise<Actor> {
  const result = await client.query<UserRow>(
    `SELECT id, email, full_name, role, manager_id
     FROM users
     WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(401, 'UNAUTHORIZED', 'Account no longer exists.');
  }

  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
  };
}

async function lockRequest(client: PoolClient, requestId: string): Promise<LeaveRequestRecord> {
  const result = await client.query<RequestRow>(
    `${requestSelect}
     WHERE lr.id = $1
     FOR UPDATE OF lr`,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Leave request not found.');
  }
  return mapRequest(row);
}

function assertRejectionReason(reason: string | undefined): string {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < 3 || trimmed.length > 500) {
    throw new AppError(
      422,
      'DECISION_REASON_REQUIRED',
      'A rejection reason must be between 3 and 500 characters.',
    );
  }
  return trimmed;
}

function approvalNote(note: string | undefined): string | null {
  if (note === undefined) {
    return null;
  }

  const trimmed = note.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw new AppError(
      422,
      'NOTE_INVALID',
      'An approval note must be between 1 and 500 characters.',
    );
  }
  return trimmed;
}

function decisionReasonFor(action: LeaveAction, reason: string | undefined): string | null {
  if (action === 'reject') {
    return assertRejectionReason(reason);
  }
  if (action === 'approve') {
    return approvalNote(reason);
  }
  return null;
}

export class LeaveService {
  constructor(private readonly pool: Pool) {}

  async listRequests(actorId: string): Promise<Array<Omit<LeaveRequestRecord, 'managerId'>>> {
    return withTransaction(this.pool, async (client) => {
      const actor = await loadActor(client, actorId);
      const result = await client.query<RequestRow>(
        `${requestSelect}
         WHERE CASE
           WHEN $2 = 'ADMIN' THEN true
           WHEN $2 = 'MANAGER' THEN lr.employee_id = $1 OR employee.manager_id = $1
           ELSE lr.employee_id = $1
         END
         ORDER BY lr.created_at DESC`,
        [actor.id, actor.role],
      );
      return result.rows.map((row) => publicRequest(mapRequest(row)));
    });
  }

  async getRequest(
    actorId: string,
    requestId: string,
  ): Promise<{ request: Omit<LeaveRequestRecord, 'managerId'>; audit: AuditEvent[] }> {
    return withTransaction(this.pool, async (client) => {
      const actor = await loadActor(client, actorId);
      const result = await client.query<RequestRow>(`${requestSelect} WHERE lr.id = $1`, [
        requestId,
      ]);
      const row = result.rows[0];
      if (!row) {
        throw new AppError(404, 'NOT_FOUND', 'Leave request not found.');
      }

      const request = mapRequest(row);
      if (!canViewRequest(actor, request)) {
        throw new AppError(404, 'NOT_FOUND', 'Leave request not found.');
      }

      const audit = await client.query<{
        id: string;
        actor_id: string;
        from_status: LeaveStatus | null;
        to_status: LeaveStatus;
        reason: string | null;
        created_at: Date | string;
      }>(
        `SELECT id, actor_id, from_status, to_status, reason, created_at
         FROM leave_audit_events
         WHERE leave_request_id = $1
         ORDER BY created_at DESC, id DESC`,
        [requestId],
      );

      return {
        request: publicRequest(request),
        audit: audit.rows.map((event) => ({
          id: event.id,
          actorId: event.actor_id,
          fromStatus: event.from_status,
          toStatus: event.to_status,
          reason: event.reason,
          createdAt: toIsoTimestamp(event.created_at) ?? new Date(0).toISOString(),
        })),
      };
    });
  }

  async createRequest(
    actorId: string,
    input: { leaveType: LeaveType; startDate: string; endDate: string; reason: string },
    today: Date,
  ): Promise<Omit<LeaveRequestRecord, 'managerId'>> {
    const span = describeLeaveSpan(input.leaveType, input.startDate, input.endDate, today);

    return withTransaction(this.pool, async (client) => {
      const actor = await loadActor(client, actorId);
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [actor.id]);

      if (leaveTypeUsesBalance(input.leaveType)) {
        await this.assertBalanceCovers(client, actor.id, input.leaveType, span.start, span.days);
      }

      const existing = await client.query<{ start_date: string; end_date: string }>(
        `SELECT start_date::text AS start_date, end_date::text AS end_date
         FROM leave_requests
         WHERE employee_id = $1
           AND status IN ('PENDING', 'APPROVED')`,
        [actor.id],
      );

      const overlaps = existing.rows.some((row) =>
        rangesShareWeekday(
          span.start,
          span.end,
          parseIsoDate(row.start_date),
          parseIsoDate(row.end_date),
        ),
      );
      if (overlaps) {
        throw new AppError(
          409,
          'OVERLAPPING_LEAVE',
          'These dates overlap an existing pending or approved request.',
        );
      }

      const inserted = await client.query<RequestRow>(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, employee_id, NULL::uuid AS manager_id, leave_type,
                   start_date::text AS start_date, end_date::text AS end_date,
                   days, reason, status, version, decided_by, decision_reason, decided_at, created_at`,
        [
          actor.id,
          input.leaveType,
          formatIsoDate(span.start),
          formatIsoDate(span.end),
          span.days,
          input.reason.trim(),
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Leave request could not be saved.');
      }

      await client.query(
        `INSERT INTO leave_audit_events (leave_request_id, actor_id, from_status, to_status, reason)
         VALUES ($1, $2, NULL, 'PENDING', $3)`,
        [row.id, actor.id, input.reason.trim()],
      );

      return publicRequest(mapRequest(row));
    });
  }

  async decide(
    actorId: string,
    requestId: string,
    action: LeaveAction,
    version: number,
    today: Date,
    reason?: string,
  ): Promise<Omit<LeaveRequestRecord, 'managerId'>> {
    const decisionReason = decisionReasonFor(action, reason);

    return withTransaction(this.pool, async (client) => {
      const actor = await loadActor(client, actorId);
      const current = await lockRequest(client, requestId);

      if (action === 'cancel') {
        assertCanCancel(actor, current);
      } else {
        assertCanDecide(actor, current);
      }

      if (current.version !== version) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'The request was updated. Reload it and try again.',
          {
            version: current.version,
          },
        );
      }

      const status = nextStatus(current.status, action, parseIsoDate(current.startDate), today);
      if (leaveTypeUsesBalance(current.leaveType)) {
        const year = parseIsoDate(current.startDate).getUTCFullYear();
        if (action === 'approve') {
          await this.changeUsedDays(
            client,
            current.employeeId,
            current.leaveType,
            year,
            current.days,
          );
        }
        if (action === 'cancel' && current.status === 'APPROVED') {
          await this.changeUsedDays(
            client,
            current.employeeId,
            current.leaveType,
            year,
            -current.days,
          );
        }
      }

      const updated = await client.query<RequestRow>(
        `UPDATE leave_requests
         SET status = $1,
             version = version + 1,
             decided_by = $2,
             decision_reason = $3,
             decided_at = now()
         WHERE id = $4 AND version = $5
         RETURNING id, employee_id, NULL::uuid AS manager_id, leave_type,
                   start_date::text AS start_date, end_date::text AS end_date,
                   days, reason, status, version, decided_by, decision_reason, decided_at, created_at`,
        [status, actor.id, decisionReason, current.id, version],
      );
      const row = updated.rows[0];
      if (!row) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'The request was updated. Reload it and try again.',
        );
      }

      await client.query(
        `INSERT INTO leave_audit_events (leave_request_id, actor_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [current.id, actor.id, current.status, status, decisionReason],
      );

      return publicRequest(mapRequest(row));
    });
  }

  async getBalances(
    actorId: string,
    requestedUserId: string | undefined,
    year: number,
  ): Promise<BalanceResponse[]> {
    return withTransaction(this.pool, async (client) => {
      const actor = await loadActor(client, actorId);
      const userId = requestedUserId ?? actor.id;

      if (userId !== actor.id && actor.role !== 'ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'You can view only your own leave balance.');
      }

      const owner = await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [
        userId,
      ]);
      if (!owner.rows[0]) {
        throw new AppError(404, 'NOT_FOUND', 'User not found.');
      }

      const balances = await client.query<{
        leave_type: LeaveType;
        year: number;
        allocated_days: string | number;
        used_days: string | number;
      }>(
        `SELECT leave_type, year, allocated_days, used_days
         FROM leave_balances
         WHERE user_id = $1 AND year = $2
         ORDER BY leave_type`,
        [userId, year],
      );

      const pending = await client.query<{ leave_type: LeaveType; pending_days: string | number }>(
        `SELECT leave_type, COALESCE(SUM(days), 0) AS pending_days
         FROM leave_requests
         WHERE employee_id = $1
           AND status = 'PENDING'
           AND EXTRACT(YEAR FROM start_date) = $2
         GROUP BY leave_type`,
        [userId, year],
      );
      const pendingByType = new Map(
        pending.rows.map((row) => [row.leave_type, toNumber(row.pending_days)]),
      );

      return balances.rows.map((row) => {
        const allocatedDays = toNumber(row.allocated_days);
        const usedDays = toNumber(row.used_days);
        const pendingDays = pendingByType.get(row.leave_type) ?? 0;
        return {
          leaveType: row.leave_type,
          year: row.year,
          allocatedDays,
          usedDays,
          pendingDays,
          remainingDays: allocatedDays - usedDays - pendingDays,
        };
      });
    });
  }

  private async assertBalanceCovers(
    client: PoolClient,
    userId: string,
    leaveType: LeaveType,
    start: Date,
    requested: number,
  ): Promise<void> {
    const year = start.getUTCFullYear();
    const balance = await client.query<{
      allocated_days: string | number;
      used_days: string | number;
    }>(
      `SELECT allocated_days, used_days
       FROM leave_balances
       WHERE user_id = $1 AND leave_type = $2 AND year = $3
       FOR UPDATE`,
      [userId, leaveType, year],
    );
    const row = balance.rows[0];
    if (!row) {
      throw new AppError(
        422,
        'BALANCE_NOT_FOUND',
        `No ${leaveType.toLowerCase()} balance exists for ${year}.`,
      );
    }

    const pending = await client.query<{ pending_days: string | number }>(
      `SELECT COALESCE(SUM(days), 0) AS pending_days
       FROM leave_requests
       WHERE employee_id = $1
         AND leave_type = $2
         AND status = 'PENDING'
         AND EXTRACT(YEAR FROM start_date) = $3`,
      [userId, leaveType, year],
    );

    assertSufficientBalance({
      leaveType,
      allocated: toNumber(row.allocated_days),
      used: toNumber(row.used_days),
      pending: toNumber(pending.rows[0]?.pending_days ?? 0),
      requested,
    });
  }

  private async changeUsedDays(
    client: PoolClient,
    userId: string,
    leaveType: LeaveType,
    year: number,
    delta: number,
  ): Promise<void> {
    const result = await client.query<{
      used_days: string | number;
      allocated_days: string | number;
    }>(
      `UPDATE leave_balances
       SET used_days = used_days + $4
       WHERE user_id = $1 AND leave_type = $2 AND year = $3
       RETURNING used_days, allocated_days`,
      [userId, leaveType, year, delta],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError(
        422,
        'BALANCE_NOT_FOUND',
        `No ${leaveType.toLowerCase()} balance exists for ${year}.`,
      );
    }

    const usedDays = toNumber(row.used_days);
    const allocatedDays = toNumber(row.allocated_days);
    if (delta > 0 && usedDays > allocatedDays) {
      const shortfall = usedDays - allocatedDays;
      const label = leaveType === 'ANNUAL' ? 'Annual' : 'Sick';
      const unit = shortfall === 1 ? 'day' : 'days';
      throw new AppError(
        422,
        'INSUFFICIENT_BALANCE',
        `${label} leave balance is short by ${shortfall} ${unit}.`,
      );
    }
  }
}
