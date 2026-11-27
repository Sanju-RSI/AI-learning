# Leave API code review

Reviewed against `docs/sdlc/01-requirements.md` and `skills/code-review/SKILL.md`. The review covered authentication, user administration, and the leave service. Findings below were fixed in the same change, except the one accepted limitation.

## Acceptance criteria

| Criterion                                                                                               | Result                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| An employee can sign in and create a valid request. An invalid body returns a field error.              | Met. `POST /api/auth/login` and `POST /api/leave/requests`. Empty reason returns `400 VALIDATION_ERROR`.                                        |
| A manager can approve or reject a direct report and cannot decide anyone else’s request.                | Met. Another team returns `403 FORBIDDEN`.                                                                                                      |
| An admin can list users and decide a request.                                                           | Met. Employee calls to `GET /api/users` return `403`.                                                                                           |
| Every status change is stored in the audit history.                                                     | Met. Create writes `PENDING`. Approve, reject, and cancel write the next status.                                                                |
| Repeating a decision returns a conflict and does not write a second decision.                           | Met. A stale `version` returns `409 VERSION_CONFLICT`.                                                                                          |
| Balances change only on the allowed transitions.                                                        | Met. Approve increases `used`. Reject and cancel of a pending request leave `used` unchanged. Cancel of future approved leave decreases `used`. |
| Unit tests cover the date, transition, balance, and access rules. Integration tests cover the API path. | Met. 51 tests pass.                                                                                                                             |

## Issues

### 1. Admin routes trusted the role inside the token

- Severity: High
- File: `src/middleware/authenticate.ts`, lines 33–45
- Problem: `authorize('ADMIN')` used the role embedded in the JWT. Leave decisions already reloaded the user, but user administration did not. A person demoted from admin kept admin access until the token expired.
- Why it matters: Role changes must take effect on the next request. A stale token would still allow user creation and the full user list.
- Fix: Authentication loads `id` and `role` from `users` after the token signature is checked. The integration test `uses the current database role instead of a stale admin token` covers this.

### 2. Unknown emails skipped the password hash

- Severity: Medium
- File: `src/modules/auth/service.ts`, lines 8 and 36
- Problem: When the email did not exist, login returned before running a password comparison.
- Why it matters: The faster response lets a caller distinguish a missing account from a wrong password.
- Fix: Login always compares the password. A missing account is compared with a stored dummy hash, then rejected with the same `401 INVALID_CREDENTIALS` error.

### 3. Production could boot with the development signing secret

- Severity: Medium
- File: `src/config.ts`, lines 42–45
- Problem: An empty `JWT_SECRET` fell back to `dev-only-leave-secret` in every environment.
- Why it matters: Anyone who knows that fallback can mint tokens if a production process starts without its own secret.
- Fix: `NODE_ENV=production` now refuses to start when the secret is still the development fallback. Local development keeps the fallback so `npm run dev:api` works without extra setup.

### 4. Approval did not check the allocation again

- Severity: Medium
- File: `src/modules/leave/service.ts`, line 556
- Problem: Create checked `allocated - used - pending`. Approve then added the days to `used` without checking that `used` still fit the allocation. Lowering `allocated_days` after the request was created could approve more days than the employee had.
- Why it matters: The balance rule is that annual and sick leave cannot be approved beyond the allocation.
- Fix: After increasing `used`, the same transaction rejects the approval with `422 INSUFFICIENT_BALANCE` when `used` is greater than `allocated`, and rolls the update back.

### 5. Two acceptance cases had no API test

- Severity: Low
- File: `tests/leave-api.test.ts`
- Problem: Overlap with an approved request, and two pending requests that together exceed the balance, were covered by the service rules but not by an HTTP test.
- Why it matters: A later change could keep the pure functions correct and still break the query that loads existing requests.
- Fix: Added integration tests for both cases.

## Accepted limitation

- Severity: Low
- File: `src/modules/leave/service.ts`, balance year taken from the start date
- Problem: A request that starts in one calendar year and ends in the next charges every weekday to the start year.
- Why it matters: December-to-January leave can consume the earlier year's balance.
- Resolution: Left as documented behavior. Public holidays and split-year balances are out of scope for this build.
