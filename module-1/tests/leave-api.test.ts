import type { Server } from 'node:http';
import type { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import { migrate } from '../src/db/migrate';
import { createPool } from '../src/db/pool';
import { SEED_PASSWORD, seed } from '../src/db/seed';
import { addCalendarDays, formatIsoDate, parseIsoDate, todayUtc } from '../src/modules/leave/dates';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/leave_management_test';
const config: AppConfig = {
  databaseUrl,
  jwtSecret: 'test-leave-secret',
  port: 0,
};

type Session = {
  token: string;
  id: string;
  role: string;
};

function nextMonday(): string {
  let cursor = addCalendarDays(todayUtc(), 7);
  while (cursor.getUTCDay() !== 1) {
    cursor = addCalendarDays(cursor, 1);
  }
  return formatIsoDate(cursor);
}

function shiftDate(isoDate: string, days: number): string {
  return formatIsoDate(addCalendarDays(parseIsoDate(isoDate), days));
}

describe('leave API', () => {
  let pool: Pool;
  let server: Server;
  let employee: Session;
  let manager: Session;
  let admin: Session;
  const monday = nextMonday();

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    await migrate(pool);
    await seed(pool);
    server = createApp(pool, config).listen(0);

    employee = await login('employee@example.com');
    manager = await login('manager@example.com');
    admin = await login('admin@example.com');
  }, 30000);

  beforeEach(async () => {
    await pool.query('DELETE FROM leave_audit_events');
    await pool.query('DELETE FROM leave_requests');
    await pool.query(
      `UPDATE leave_balances
       SET used_days = 0,
           allocated_days = CASE leave_type WHEN 'ANNUAL' THEN 20 WHEN 'SICK' THEN 10 ELSE allocated_days END`,
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  });

  async function login(email: string): Promise<Session> {
    const response = await request(server).post('/api/auth/login').send({
      email,
      password: SEED_PASSWORD,
    });
    expect(response.status).toBe(200);
    return {
      token: response.body.token as string,
      id: response.body.user.id as string,
      role: response.body.user.role as string,
    };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createRequest(token: string, startDate: string, endDate = startDate) {
    return request(server).post('/api/leave/requests').set(auth(token)).send({
      leaveType: 'ANNUAL',
      startDate,
      endDate,
      reason: 'Family travel',
    });
  }

  it('signs an employee in and rejects a bad password', async () => {
    const me = await request(server).get('/api/auth/me').set(auth(employee.token));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('EMPLOYEE');

    const denied = await request(server).post('/api/auth/login').send({
      email: 'employee@example.com',
      password: 'wrong-password',
    });
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('creates a valid request and returns a field error for a bad body', async () => {
    const created = await createRequest(employee.token, monday, shiftDate(monday, 2));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'PENDING', days: 3, version: 1 });

    const invalid = await request(server)
      .post('/api/leave/requests')
      .set(auth(employee.token))
      .send({
        leaveType: 'ANNUAL',
        startDate: monday,
        endDate: monday,
        reason: '',
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an end date before the start date', async () => {
    const response = await createRequest(employee.token, shiftDate(monday, 2), monday);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('DATE_ORDER');
  });

  it('rejects a request that overlaps pending or approved leave and allows a rejected one', async () => {
    const first = await createRequest(employee.token, monday, shiftDate(monday, 2));
    const overlap = await createRequest(employee.token, shiftDate(monday, 1), shiftDate(monday, 3));
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('OVERLAPPING_LEAVE');

    await request(server)
      .post(`/api/leave/requests/${first.body.id}/reject`)
      .set(auth(manager.token))
      .send({ version: 1, reason: 'Coverage missing' });

    const afterReject = await createRequest(employee.token, monday, shiftDate(monday, 2));
    expect(afterReject.status).toBe(201);
  });

  it('lets a manager approve a direct report and stores one decision in the audit log', async () => {
    const created = await createRequest(employee.token, monday, shiftDate(monday, 2));
    const approved = await request(server)
      .post(`/api/leave/requests/${created.body.id}/approve`)
      .set(auth(manager.token))
      .send({ version: 1 });

    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', version: 2 });

    const repeated = await request(server)
      .post(`/api/leave/requests/${created.body.id}/approve`)
      .set(auth(manager.token))
      .send({ version: 1 });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('VERSION_CONFLICT');

    const detail = await request(server)
      .get(`/api/leave/requests/${created.body.id}`)
      .set(auth(employee.token));
    const approvals = detail.body.audit.filter(
      (event: { toStatus: string }) => event.toStatus === 'APPROVED',
    );
    expect(approvals).toHaveLength(1);

    const balances = await request(server)
      .get(`/api/leave/balances?year=${monday.slice(0, 4)}`)
      .set(auth(employee.token));
    const annual = balances.body.balances.find(
      (balance: { leaveType: string }) => balance.leaveType === 'ANNUAL',
    );
    expect(annual.usedDays).toBe(3);
    expect(annual.pendingDays).toBe(0);
  });

  it('stops an employee approving their own request and a manager deciding another team', async () => {
    const own = await createRequest(employee.token, monday);
    const selfDecision = await request(server)
      .post(`/api/leave/requests/${own.body.id}/approve`)
      .set(auth(employee.token))
      .send({ version: 1 });
    expect(selfDecision.status).toBe(403);
    expect(selfDecision.body.error.code).toBe('SELF_DECISION');

    const otherLogin = await login('other@example.com');
    const outside = await createRequest(otherLogin.token, monday);
    const forbidden = await request(server)
      .post(`/api/leave/requests/${outside.body.id}/approve`)
      .set(auth(manager.token))
      .send({ version: 1 });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('requires a real rejection reason and does not consume balance when rejected', async () => {
    const created = await createRequest(employee.token, monday);
    const shortReason = await request(server)
      .post(`/api/leave/requests/${created.body.id}/reject`)
      .set(auth(manager.token))
      .send({ version: 1, reason: 'no' });
    expect(shortReason.status).toBe(422);
    expect(shortReason.body.error.code).toBe('DECISION_REASON_REQUIRED');

    const rejected = await request(server)
      .post(`/api/leave/requests/${created.body.id}/reject`)
      .set(auth(manager.token))
      .send({ version: 1, reason: 'Coverage missing' });
    expect(rejected.body.status).toBe('REJECTED');

    const balances = await request(server)
      .get(`/api/leave/balances?year=${monday.slice(0, 4)}`)
      .set(auth(employee.token));
    const annual = balances.body.balances.find(
      (balance: { leaveType: string }) => balance.leaveType === 'ANNUAL',
    );
    expect(annual.usedDays).toBe(0);
    expect(annual.pendingDays).toBe(0);
  });

  it('restores balance when approved leave is cancelled before it starts', async () => {
    const created = await createRequest(employee.token, monday, shiftDate(monday, 2));
    await request(server)
      .post(`/api/leave/requests/${created.body.id}/approve`)
      .set(auth(manager.token))
      .send({ version: 1 });

    const cancelled = await request(server)
      .post(`/api/leave/requests/${created.body.id}/cancel`)
      .set(auth(employee.token))
      .send({ version: 2 });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const balances = await request(server)
      .get(`/api/leave/balances?year=${monday.slice(0, 4)}`)
      .set(auth(employee.token));
    const annual = balances.body.balances.find(
      (balance: { leaveType: string }) => balance.leaveType === 'ANNUAL',
    );
    expect(annual.usedDays).toBe(0);
  });

  it('lets an admin list users and approve a request', async () => {
    const users = await request(server).get('/api/users').set(auth(admin.token));
    expect(users.status).toBe(200);
    expect(users.body.users.length).toBeGreaterThanOrEqual(4);

    const hidden = await request(server).get('/api/users').set(auth(employee.token));
    expect(hidden.status).toBe(403);

    const created = await createRequest(employee.token, shiftDate(monday, 7));
    const approved = await request(server)
      .post(`/api/leave/requests/${created.body.id}/approve`)
      .set(auth(admin.token))
      .send({ version: 1 });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('rejects a request larger than the remaining balance', async () => {
    await pool.query(
      `UPDATE leave_balances
       SET allocated_days = 1
       WHERE user_id = $1 AND leave_type = 'ANNUAL'`,
      [employee.id],
    );

    const response = await createRequest(employee.token, monday, shiftDate(monday, 2));
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });
});
