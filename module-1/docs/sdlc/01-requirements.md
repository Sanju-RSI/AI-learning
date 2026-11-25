# Employee Leave Management System — Requirements

Milestone 1, step 1. This document is the source of truth for roles, business rules, and edge cases. Later implementation, tests, and the seeded-bug review must follow it.

## Problem

Employees need a single place to request leave, see their balance, and track a decision. Managers need to approve or reject only their own team’s requests. Admins need to manage people and see every decision. The system must record who changed a request and must reject a second decision on a request that is already decided.

## Users and roles

| Role | Who they are | What they can do |
| --- | --- | --- |
| Employee | Any staff member who takes leave | Sign in, view own balance, create a request, view own requests, cancel a pending request |
| Manager | An employee who has direct reports | Everything an employee can do, plus view direct reports’ requests and approve or reject those requests |
| Admin | An HR operator | Manage users, view every request and balance, approve, reject, or cancel any request that is not their own |

A manager is also an employee. Their own leave is approved by their manager, or by an admin when they have no manager. Nobody can approve, reject, or cancel-as-a-decision their own request.

## Leave types

| Code | Name | Uses a balance |
| --- | --- | --- |
| ANNUAL | Annual leave | Yes |
| SICK | Sick leave | Yes |
| UNPAID | Unpaid leave | No |

Public holidays and half days are out of scope. A request covers whole working days, Monday to Friday, inclusive of the start and end dates.

## Request lifecycle

```text
PENDING ──approve──▶ APPROVED ──cancel──▶ CANCELLED
   │                     │
   ├──reject──▶ REJECTED │
   │                     │
   └──cancel──▶ CANCELLED
```

| From | To | Who | Extra rule |
| --- | --- | --- | --- |
| PENDING | APPROVED | Direct manager, or any admin | Actor is not the requester. Balance is reserved only after approval. |
| PENDING | REJECTED | Direct manager, or any admin | Actor is not the requester. A decision reason of at least 3 characters is required. |
| PENDING | CANCELLED | Requester or any admin | No decision reason required. |
| APPROVED | CANCELLED | Requester or any admin | Allowed only when the start date is still in the future. Restores the balance that approval consumed. |
| REJECTED | — | — | Terminal. Further actions return a conflict. |
| CANCELLED | — | — | Terminal. Further actions return a conflict. |

## Business rules

1. A request has a leave type, a start date, an end date, and a reason of 1 to 500 characters.
2. The end date is on or after the start date.
3. The requested length is the number of weekdays in that range. A range that contains only Saturday and Sunday is rejected.
4. Annual leave cannot start in the past. Sick leave can start up to 3 calendar days in the past. Unpaid leave cannot start in the past.
5. A new request is rejected when its working days overlap a PENDING or APPROVED request for the same employee. REJECTED and CANCELLED requests do not block new dates.
6. For ANNUAL and SICK, the employee must have enough remaining days. Remaining days are `allocated - used - pending`. Pending requests of the same type count against the balance so two open requests cannot oversubscribe it. UNPAID skips this check.
7. Approval of ANNUAL or SICK increases `used` by the request length and releases the pending hold. Rejection or cancellation of a PENDING request releases the pending hold and does not change `used`. Cancellation of an APPROVED request decreases `used` by the request length.
8. A manager may decide only requests from their direct reports. An admin may decide any request except their own.
9. Each decision writes an audit event with the actor, the previous status, the next status, the reason when one was supplied, and the time.
10. Duplicate-action protection: a decide or cancel call includes the request version the caller last read. If the stored version does not match, or the request is already in a terminal state, the call returns a conflict and does not write a second decision.

## Edge cases the implementation must handle

- End date before start date.
- Same-day request on a weekday, which counts as 1 day.
- Same-day request on a weekend, which counts as 0 days and is rejected.
- Overlap with a pending request, and overlap with an approved request.
- Overlap with a rejected or cancelled request, which is allowed.
- Annual or sick request larger than the remaining balance.
- Two pending requests that together exceed the balance.
- Sick leave dated 3 days ago, which is allowed, and sick leave dated 4 days ago, which is rejected.
- Employee approving their own request.
- Manager approving someone who does not report to them.
- Second approve, reject, or cancel after the first decision.
- Cancel of approved leave on or after the start date.
- Reject with a missing or too-short reason.

## Out of scope for the first build

- A web UI. The first build is an HTTP API plus seed data.
- Email notifications, file attachments, and public-holiday calendars.
- Multi-level approval chains. One direct manager, or an admin, is enough.
- Editing a request after it is submitted. The employee cancels and creates a new one.
- Password reset and refresh tokens. Sign-in returns one access token.

## Acceptance criteria for the first build

- An employee can sign in and create a valid request, and an invalid request is rejected with a field error.
- A manager can approve or reject a direct report and cannot decide anyone else’s request.
- An admin can list users and decide a request the manager could decide.
- Every status change is stored in the audit history.
- Repeating a decision returns a conflict and leaves the audit history with a single decision event.
- Balances move only on the transitions listed above.
- Unit tests cover the rules in this document. Integration tests cover sign-in, create, approve, reject, cancel, and the conflict on a repeated decision.
