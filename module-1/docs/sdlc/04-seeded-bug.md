# Feature and seeded bug

Step 8 checks that the harness notices a defect. The approval note is the new feature. The balance bug was introduced on purpose, caught by the existing integration test, and then removed. The source tree keeps the corrected behavior.

## Feature

`POST /api/leave/requests/:id/approve` accepts an optional `note` of 1 to 500 characters.

```json
{ "version": 1, "note": "Coverage confirmed" }
```

The note is saved on `decision_reason` and on the approval audit event. Omitting it leaves the reason empty. A blank note is a `400 VALIDATION_ERROR`.

Covered by `stores an optional approval note on the request and in the audit event` in `tests/leave-api.test.ts`.

## Seeded bug

The cancel path for approved leave updated the status and wrote the audit event, but it did not subtract the request length from `used_days`.

That breaks the balance rule: cancelling approved leave before the start date must restore the days the approval consumed.

The existing test caught it:

```text
FAIL tests/leave-api.test.ts
  ● leave API › restores balance when approved leave is cancelled before it starts

    expect(received).toBe(expected)

    Expected: 0
    Received: 3
```

`Expected: 0` is the restored balance. `Received: 3` is the three approved days that stayed in `used_days`. The assertion is `tests/leave-api.test.ts`, line 308.

## Fix

`src/modules/leave/service.ts`, at the approved-cancel branch, calls `changeUsedDays` with a negative day count inside the same transaction as the status change. Cancelling three approved days returns `used_days` to the value from before the approval.

The defect is not left in the code. Re-running the test after the fix passes.
