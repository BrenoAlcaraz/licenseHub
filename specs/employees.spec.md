# Spec — Employees

Employee registration, leave status changes, and offboarding with automatic license release. Applies **RN02** indirectly and **RN04**, **RN05**, **RN08**, **RN09**, and **RN10**.

## Model

| Field | Type | Rules |
|---|---|---|
| id | uuid | Primary key |
| name | string | Required |
| email | string | Required, unique, valid email |
| department | string | Required |
| status | `EmployeeStatus` | `ACTIVE`, `ON_LEAVE`, or `OFFBOARDED`; defaults to `ACTIVE` |
| offboardedAt | timestamptz \| null | Set during offboarding |
| createdAt / updatedAt | timestamptz | Automatic |

## Status transitions

```text
ACTIVE  ⇄  ON_LEAVE        through PATCH /employees/:id/status
ACTIVE   → OFFBOARDED      through POST  /employees/:id/offboard
ON_LEAVE → OFFBOARDED      through POST  /employees/:id/offboard
OFFBOARDED → no transition; terminal state
```

## Endpoints

| Method | Route | Body/query | Success | Errors |
|---|---|---|---|---|
| POST | `/employees` | `CreateEmployeeDto` | 201 `EmployeeResponse` | 400, 409 |
| GET | `/employees` | Optional `status` and `department` filters | 200 `EmployeeResponse[]` | 400 |
| GET | `/employees/:id` | — | 200 `EmployeeDetailResponse` | 400, 404 |
| PATCH | `/employees/:id/status` | `UpdateEmployeeStatusDto` | 200 `EmployeeResponse` | 400, 404, 409 |
| POST | `/employees/:id/offboard` | — | 200 `OffboardResponse` | 400, 404, 409 |

`UpdateEmployeeStatusDto` accepts only `ACTIVE` or `ON_LEAVE`. Employee details add active licenses to the base response. `OffboardResponse` includes the employee ID, final status, revoked-license count, and monthly savings. Savings are the sum of `monthlyCostCents` for revoked assignments.

## Error messages

| Situation | Status | Message |
|---|---:|---|
| Duplicate email | 409 | `Employee with email 'ana.souza@empresa.com' already exists` |
| Missing employee | 404 | `Employee '<id>' not found` |
| Already offboarded | 409 | `Employee 'Ana Souza' is already offboarded` |
| Status change after offboarding | 409 | `Employee 'Ana Souza' is offboarded and cannot change status` |

## Acceptance criteria

### EMP-AC01 — creates an active employee [unit]
- Valid creation returns 201 with `status = ACTIVE` and `offboardedAt = null`

### EMP-AC02 — rejects duplicate email [unit] RN09
- Creating an existing email returns 409 with the documented message

### EMP-AC03 — validates input [pipe]
- Invalid email, missing or unknown fields, and a submitted `status` return 400

### EMP-AC04 — lists with filters [unit]
- `status` and `department` filters can be combined; no filters return all employees
- A status outside the enum returns 400

### EMP-AC05 — details include active licenses [unit]
- Given two active and one revoked assignment
- Then details include only the two active assignments and their `productName`

### EMP-AC06 — missing employee [unit] RN10
- GET details, PATCH status, and POST offboard return 404 for a nonexistent ID

### EMP-AC07 — places an employee on leave without losing licenses [unit] RN08
- Changing ACTIVE to `ON_LEAVE` returns 200 and revokes no assignment

### EMP-AC08 — returns from leave [unit]
- Changing `ON_LEAVE` to `ACTIVE` returns 200

### EMP-AC09 — status PATCH rejects OFFBOARDED [pipe]
- Sending `OFFBOARDED` to the status endpoint returns 400; offboarding has its own endpoint

### EMP-AC10 — offboarded employees cannot change status [unit]
- Any status change returns 409 with the documented message

### EMP-AC11 — offboarding revokes every license [unit] RN04
- Given Ana has active M365, Slack, and Jira licenses costing 27400 cents in total
- When Ana is offboarded
- Then the response reports `OFFBOARDED`, 3 revoked licenses, and 27400 cents in monthly savings
- `offboardedAt` and every assignment's `revokedAt` are set, with `revokeReason = OFFBOARDING`
- All changes occur in one `em.transactional` transaction; a failure rolls back both status and assignments

### EMP-AC12 — offboarding without licenses [unit] RN04
- An employee without active licenses returns 200 with zero revoked licenses and zero savings

### EMP-AC13 — offboarding while on leave [unit] RN04
- An `ON_LEAVE` employee is offboarded normally and all active licenses are revoked

### EMP-AC15 — concurrent offboarding and assignment [unit] [manual] RN02 RN04
- If offboarding races with assignment, status change, or another offboarding request, the employee never ends OFFBOARDED with an active license and never returns from OFFBOARDED
- Exactly one offboarding succeeds; the other receives RN05's 409
- Every operation locks the employee row with `FOR UPDATE` before reading mutable status

### EMP-AC14 — cannot offboard twice [unit] RN05
- Offboarding an `OFFBOARDED` employee returns 409 and changes nothing

### EMP-AC16 — concurrent creation with the same email [unit] [manual] RN09
- Concurrent requests for the same new email produce exactly one 201 and 409 for the rest
- Only one employee exists; the unique index is the final safeguard
