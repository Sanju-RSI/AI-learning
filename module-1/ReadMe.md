# AI Engineering Harness

Module 1 is a reusable TypeScript engineering harness and the Employee Leave Management API built with it. The API covers sign-in, role-based access, leave requests, balances, status transitions, audit history, and duplicate-action protection.

## What the harness includes

- Cursor rules in `.cursor/rules`
- Cursor commands in `.cursor/commands` for code review and test generation
- A code-review skill in `skills/code-review/SKILL.md`
- ESLint, Prettier, Jest, and `npm run quality`
- A Husky pre-commit hook that runs `npm run quality`
- GitHub Actions workflow `.github/workflows/module-1-quality.yml` at the repository root
- Semgrep rules in `.semgrep.yml`
- A sample MCP server in `src/mcp/server.ts`

SDLC notes live in `docs/sdlc/`:

| Document             | Contents                                          |
| -------------------- | ------------------------------------------------- |
| `01-requirements.md` | Roles, business rules, and acceptance criteria    |
| `02-architecture.md` | API contracts and the PostgreSQL schema           |
| `03-code-review.md`  | Review findings and the fixes applied             |
| `04-seeded-bug.md`   | Approval-note feature and the bug the test caught |

## Prerequisites

- Node.js 20 or newer. Node.js 18 can run the app locally. GitHub Actions uses Node.js 22.
- PostgreSQL 14 or newer, with `createdb` and `psql` on your path

## Setup

From a clone of this repository:

```bash
git clone https://github.com/Sanju-RSI/AI-learning.git
cd AI-learning/module-1
npm install
createdb leave_management
createdb leave_management_test
cp .env.example .env
npm run seed
npm run dev:api
```

The API listens on port 3000. `npm run seed` applies the schema and inserts the development users.

### Environment

| Variable            | Purpose                            | Default                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | Application database               | `postgres://localhost:5432/leave_management`      |
| `TEST_DATABASE_URL` | Database used by integration tests | `postgres://localhost:5432/leave_management_test` |
| `JWT_SECRET`        | Secret used to sign access tokens  | `dev-only-leave-secret`                           |
| `PORT`              | HTTP port                          | `3000`                                            |

The development secret is for local use. Set `JWT_SECRET` before running with `NODE_ENV=production`. The process exits when production starts with the development secret.

### Development accounts

Every seeded account uses the password `Password123!`. This password is for local development.

| Email                | Role     | Reports to |
| -------------------- | -------- | ---------- |
| admin@example.com    | Admin    | —          |
| manager@example.com  | Manager  | Admin      |
| employee@example.com | Employee | Manager    |
| other@example.com    | Employee | Admin      |

`other@example.com` exists so a manager can be shown rejecting a request from outside their team.

## Scripts

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev:api`   | Start the leave API with reload          |
| `npm run dev`       | Run the small discount sample            |
| `npm run migrate`   | Apply `src/db/migrations/001_init.sql`   |
| `npm run seed`      | Migrate and upsert the development users |
| `npm run build`     | Compile TypeScript to `dist`             |
| `npm run typecheck` | Typecheck without emitting files         |
| `npm run lint`      | Run ESLint                               |
| `npm run format`    | Format with Prettier                     |
| `npm test`          | Run unit and integration tests           |
| `npm run quality`   | Typecheck, lint, format check, and tests |
| `npm run semgrep`   | Scan `src` with `.semgrep.yml`           |
| `npm run mcp`       | Start the sample MCP server              |

Integration tests need `leave_management_test`. Create it with `createdb` before `npm test`.

Install the Semgrep CLI before `npm run semgrep`:

```bash
python3 -m pip install semgrep
```

GitHub Actions installs Semgrep itself and runs the same scan.

## Roles

| Action                                                 | Employee | Manager | Admin                         |
| ------------------------------------------------------ | -------- | ------- | ----------------------------- |
| Sign in and read `/api/auth/me`                        | Yes      | Yes     | Yes                           |
| Create and list own leave                              | Yes      | Yes     | Yes                           |
| View a direct report's leave                           | No       | Yes     | Yes                           |
| Approve or reject a direct report                      | No       | Yes     | Yes, except their own request |
| Cancel own pending leave, or own future approved leave | Yes      | Yes     | Yes                           |
| Cancel someone else's request                          | No       | No      | Yes                           |
| List and create users                                  | No       | No      | Yes                           |
| Read another person's balance                          | No       | No      | Yes, with `userId`            |

A manager is also an employee. Nobody can approve or reject their own request. The API reads the role from the database on each request, so a role change applies immediately.

## Leave rules

Leave types are `ANNUAL`, `SICK`, and `UNPAID`. Annual and sick leave use a yearly balance. Unpaid leave does not.

A request counts weekdays from the start date through the end date. Annual and unpaid leave cannot start in the past. Sick leave can start up to 3 calendar days in the past.

Statuses move from `PENDING` to `APPROVED`, `REJECTED`, or `CANCELLED`. Approved leave can be cancelled only before the start date, and that cancellation restores the balance. Rejected and cancelled requests are final.

Approve, reject, and cancel must send the `version` from the latest read. A mismatch returns `409 VERSION_CONFLICT` and does not write another decision.

## API

Send `Content-Type: application/json`. After login, send `Authorization: Bearer <token>` on every other route.

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

| Status | When                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| 400    | The body or query failed schema validation                                               |
| 401    | The token is missing, invalid, or the account is gone                                    |
| 403    | The signed-in user cannot perform the action                                             |
| 404    | The request or user does not exist for this caller                                       |
| 409    | The version changed, the transition is illegal, the dates overlap, or the email is taken |
| 422    | A business rule failed, such as balance, dates, or a short rejection reason              |

### POST /api/auth/login

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

### GET /api/auth/me

Returns the signed-in user: `id`, `email`, `fullName`, and `role`.

### GET /api/users

Admin only. Returns `{ "users": [ ... ] }` without password hashes.

### POST /api/users

Admin only.

```json
{
  "email": "new.employee@example.com",
  "password": "Password123!",
  "fullName": "New Employee",
  "role": "EMPLOYEE",
  "managerId": "<manager-uuid>"
}
```

Employees and managers require `managerId`. The response is `201` and includes the created user. Annual and sick balances are created for the current year and the next year.

### GET /api/leave/balances

Returns the signed-in user's balances for the current UTC year.

`GET /api/leave/balances?year=2026` selects a year. An admin may add `userId=<uuid>` to read another person. Each balance includes `allocatedDays`, `usedDays`, `pendingDays`, and `remainingDays`.

### GET /api/leave/requests

Returns `{ "requests": [ ... ] }`. Employees see their own requests. Managers also see direct reports. Admins see every request.

### POST /api/leave/requests

Creates leave for the signed-in user. Response status is `201`.

```json
{
  "leaveType": "ANNUAL",
  "startDate": "2026-12-14",
  "endDate": "2026-12-16",
  "reason": "Family travel"
}
```

`2026-12-14` through `2026-12-16` is three weekdays, so `days` is `3`, `status` is `PENDING`, and `version` is `1`.

### GET /api/leave/requests/:id

Returns `{ "request": { ... }, "audit": [ ... ] }`. Audit events are newest first. A request the caller cannot see returns `404`.

### POST /api/leave/requests/:id/approve

```json
{ "version": 1, "note": "Coverage confirmed" }
```

`note` is optional. When present, it is stored as `decisionReason` and on the audit event. A successful decision increments `version`.

### POST /api/leave/requests/:id/reject

```json
{ "version": 1, "reason": "Coverage missing that week" }
```

`reason` must be 3 to 500 characters.

### POST /api/leave/requests/:id/cancel

```json
{ "version": 1 }
```

The requester can cancel a pending request, or an approved request whose start date is still in the future. An admin can cancel another person's request under the same status rules.

### GET /health

Returns `{ "status": "ok" }`.

## Checks

Local:

```bash
npm run quality
npm run semgrep
```

On push and pull request, GitHub Actions runs both against PostgreSQL 16. The workflow file is `.github/workflows/module-1-quality.yml` in the repository root, and it uses `module-1` as its working directory.

## MCP sample

`npm run mcp` starts a separate sample server. It is not the leave API.

### get-user

Fetch a sample user by ID.

### create-user

Create a sample user with a name and email.

## Cursor

Open `module-1` in Cursor. The rules in `.cursor/rules` apply while editing. The commands in `.cursor/commands` review code and generate Jest tests. The skill in `skills/code-review` is the checklist used for `docs/sdlc/03-code-review.md`.
