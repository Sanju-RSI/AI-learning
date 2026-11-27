# Employee Leave Management System — Architecture

Milestone 1, step 2. API contracts and the database schema below are what the implementation will follow. The existing harness stays in place: TypeScript, Zod, Jest, ESLint, Prettier, Husky, Cursor rules, the review command, and the code-review skill.

## Stack

| Concern      | Choice                                                             | Why                                                                                                                        |
| ------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Node.js + TypeScript                                               | Already the harness language                                                                                               |
| HTTP         | Express                                                            | Small enough to sit next to the current scripts. NestJS would add a second framework without helping the assignment rules. |
| Validation   | Zod                                                                | Already a dependency, and the MCP server already uses it                                                                   |
| Database     | PostgreSQL                                                         | Required by the assignment. Schema is applied with SQL migrations.                                                         |
| Auth         | Email and password, bcrypt hashes, JWT access token                | Enough to demonstrate sign-in and RBAC                                                                                     |
| Tests        | Jest                                                               | Already configured. Unit tests cover pure rules. Integration tests hit the API with a test database.                       |
| Quality gate | `npm run quality` plus a later GitHub Actions workflow and Semgrep | Husky already runs tests before commit. CI and Semgrep are step 7.                                                         |

The sample `calculateDiscount` code stays until the leave API has its own tests. New leave code lives beside it and does not import it.

## Layout

```text
src/
  server.ts                 Express listen
  app.ts                    App factory used by the server and integration tests
  config.ts                 Environment
  db/
    pool.ts
    migrate.ts
    migrations/001_init.sql
  modules/
    auth/                   login, JWT, password hashing
    users/                  admin user management
    leave/
      dates.ts              weekday counting
      transitions.ts        allowed status changes
      balances.ts           remaining-day calculation
      service.ts            use cases
      routes.ts
  middleware/
    authenticate.ts
    authorize.ts
    error-handler.ts
docs/sdlc/                  this planning set
```

Business rules live in `dates.ts`, `transitions.ts`, and `balances.ts` with no database import, so unit tests can run without PostgreSQL. Routes parse input, call the service, and map errors to HTTP status codes.

## Request flow

```text
Client
  → authenticate (JWT)
  → authorize (role)
  → Zod parse
  → leave service
       → pure rule check
       → transaction: lock request row, compare version, write status, write audit, update balance
  → JSON response
```

The row lock plus the version check is the duplicate-action protection. Two overlapping decisions cannot both commit.

## Roles in the token

The access token carries `sub` (user id) and `role`. Routes still load the user inside the transaction when a decision needs `manager_id` or a fresh role. A token is not trusted for “this person still reports to me”.

| Capability                             | Employee                         | Manager                          | Admin                           |
| -------------------------------------- | -------------------------------- | -------------------------------- | ------------------------------- |
| `POST /api/auth/login`                 | yes                              | yes                              | yes                             |
| `GET /api/auth/me`                     | yes                              | yes                              | yes                             |
| `GET /api/leave/balances`              | own                              | own                              | any user via `userId`           |
| `POST /api/leave/requests`             | own                              | own                              | own                             |
| `GET /api/leave/requests`              | own                              | own + direct reports             | all                             |
| `POST /api/leave/requests/:id/approve` | no                               | direct reports                   | any except self                 |
| `POST /api/leave/requests/:id/reject`  | no                               | direct reports                   | any except self                 |
| `POST /api/leave/requests/:id/cancel`  | own, when the status rule allows | own, when the status rule allows | any except a self-approval path |
| `GET /api/users`                       | no                               | no                               | yes                             |
| `POST /api/users`                      | no                               | no                               | yes                             |

## API contracts

Dates are `YYYY-MM-DD`. Errors use one shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Annual leave balance is short by 2 days.",
    "details": {}
  }
}
```

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| 400    | Body fails schema validation                                      |
| 401    | Missing or invalid token                                          |
| 403    | Signed in, but the role or relationship does not allow the action |
| 404    | Request or user does not exist, or is hidden from this caller     |
| 409    | Version mismatch, illegal status transition, or overlapping dates |
| 422    | Dates, balance, or reason fail a business rule                    |

### `POST /api/auth/login`

```json
{ "email": "employee@example.com", "password": "Password123!" }
```

```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "employee@example.com",
    "fullName": "Asha Rao",
    "role": "EMPLOYEE"
  }
}
```

### `POST /api/leave/requests`

```json
{
  "leaveType": "ANNUAL",
  "startDate": "2026-12-14",
  "endDate": "2026-12-16",
  "reason": "Family travel"
}
```

```json
{
  "id": "uuid",
  "status": "PENDING",
  "days": 3,
  "version": 1
}
```

### `POST /api/leave/requests/:id/approve`

```json
{ "version": 1, "note": "Coverage confirmed" }
```

`note` is optional. When it is sent, it is stored as the decision reason and on the audit event. A missing note leaves the reason empty.

### `POST /api/leave/requests/:id/reject`

```json
{ "version": 1, "reason": "Coverage missing that week" }
```

### `POST /api/leave/requests/:id/cancel`

```json
{ "version": 1 }
```

A successful decision returns the request with `version` incremented by 1. `GET /api/leave/requests/:id` includes `audit` newest first.

## Database schema

```sql
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');
CREATE TYPE leave_type_code AS ENUM ('ANNUAL', 'SICK', 'UNPAID');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  role          user_role NOT NULL,
  manager_id    uuid REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_not_own_manager CHECK (manager_id IS DISTINCT FROM id)
);

CREATE TABLE leave_balances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id),
  leave_type     leave_type_code NOT NULL,
  year           integer NOT NULL,
  allocated_days numeric(5,1) NOT NULL CHECK (allocated_days >= 0),
  used_days      numeric(5,1) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  UNIQUE (user_id, leave_type, year)
);

CREATE TABLE leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES users (id),
  leave_type      leave_type_code NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days            numeric(5,1) NOT NULL CHECK (days > 0),
  reason          text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status          leave_status NOT NULL DEFAULT 'PENDING',
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  decided_by      uuid REFERENCES users (id),
  decision_reason text,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_date_order CHECK (end_date >= start_date)
);

CREATE TABLE leave_audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests (id),
  actor_id         uuid NOT NULL REFERENCES users (id),
  from_status      leave_status,
  to_status        leave_status NOT NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

Pending days are not a stored column. The service sums `days` of PENDING requests for that user, type, and year. That keeps one source of truth and avoids a balance update on create drifting from the request rows.

`leave_requests.version` starts at 1. Every successful transition increments it in the same transaction as the audit insert and the balance update.

## Seed data

| Email                | Role     | Reports to | Annual | Sick |
| -------------------- | -------- | ---------- | ------ | ---- |
| admin@example.com    | ADMIN    | —          | 20     | 10   |
| manager@example.com  | MANAGER  | admin      | 20     | 10   |
| employee@example.com | EMPLOYEE | manager    | 20     | 10   |
| other@example.com    | EMPLOYEE | admin      | 20     | 10   |

`other@example.com` exists so tests can prove a manager cannot decide a request outside their team. Passwords are set in the seed script and documented in the setup section of the README when the app is built. They are development-only values.

## What is deliberately later

| Step | Work                                                                           | When                            |
| ---- | ------------------------------------------------------------------------------ | ------------------------------- |
| 3    | Project conventions for the API: error codes, module boundaries, test database | Before the first route          |
| 4    | Auth, RBAC, create and list                                                    | After this document is accepted |
| 5    | Transitions, audit, version conflicts, balance updates                         | With the leave service          |
| 6    | Unit and integration tests, then a review pass with the code-review skill      | After the service works         |
| 7    | GitHub Actions, Semgrep, API documentation                                     | After tests pass                |
| 8    | One new feature and one seeded bug, then show the harness catching the bug     | Last SDLC step                  |

The seeded bug is not written in the first implementation. It is added on purpose in step 8, after the correct behaviour and tests exist, so the review can show the harness finding it.

## Configuration

```text
DATABASE_URL=postgres://localhost:5432/leave_management
JWT_SECRET=<development secret>
PORT=3000
```

Integration tests use `leave_management_test` and migrate it from the same SQL file.
