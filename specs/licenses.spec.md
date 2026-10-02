# Spec — Licenses

License assignment and revocation. The assignment table **is the history**: rows are never deleted; revocation sets `revokedAt`. Applies **RN01**, **RN02**, **RN03**, **RN06**, **RN08**, and **RN10**.

## Model

| Field | Type | Rules |
|---|---|---|
| id | uuid | Primary key |
| product | ManyToOne → Product | Required |
| employee | ManyToOne → Employee | Required |
| assignedAt | timestamptz | Automatic |
| revokedAt | timestamptz \| null | Set on revocation |
| revokeReason | `RevokeReason` \| null | `MANUAL` or `OFFBOARDING` |

An assignment is active when `revokedAt IS NULL`. RN03 is also enforced by the partial unique index `UNIQUE (product_id, employee_id) WHERE revoked_at IS NULL`. The service checks first for a clear message; a database violation is converted to the same 409 response.

## Endpoints

| Method | Route | Body/query | Success | Errors |
|---|---|---|---|---|
| POST | `/licenses` | `AssignLicenseDto` | 201 `LicenseResponse` | 400, 404, 409 |
| GET | `/licenses` | Optional combinable `productId`, `employeeId`, and `active` filters | 200 `LicenseResponse[]` | 400 |
| POST | `/licenses/:id/revoke` | — | 200 `LicenseResponse` | 400, 404, 409 |

## Assignment check order

All checks run in one transaction and stop at the first error:

1. Product exists; otherwise 404. Read with `FOR UPDATE`.
2. Employee exists; otherwise 404. Read with `FOR UPDATE`.
3. Employee is `ACTIVE`; otherwise 409.
4. No active assignment exists for this product/employee pair; otherwise 409.
5. The product has an available seat; otherwise 409.

## Acceptance criteria

### LIC-AC01 — assigns a license [unit]
- Given an ACTIVE employee without the product and a product at 4/5 usage
- When `POST /licenses` is requested
- Then the response is 201 with `assignedAt`, `revokedAt = null`, and `revokeReason = null`

### LIC-AC02 — missing product [unit] RN10
- A nonexistent `productId` returns 404 with `Product '<id>' not found`

### LIC-AC03 — missing employee [unit] RN10
- A nonexistent `employeeId` returns 404 with `Employee '<id>' not found`

### LIC-AC04 — employee is not active [unit] RN02 RN08
- An `ON_LEAVE` or `OFFBOARDED` employee receives 409 with `Employee '<name>' is <STATUS>; only ACTIVE employees can receive licenses`

### LIC-AC05 — duplicate active license [unit] RN03
- A repeated active product/employee pair receives 409 with `Employee 'Ana Souza' already has an active 'Slack Pro' license`

### LIC-AC13 — concurrent duplicate blocked by the index [unit] RN03
- If two simultaneous requests pass the service check, the partial unique index rejects the second write
- The API returns the LIC-AC05 409 message, not 500

### LIC-AC06 — reassignment after revocation [unit] RN03
- A previously revoked pair can be assigned again when a seat is available

### LIC-AC07 — no available seats [unit] RN01
- A product at 5/5 returns 409 with `Product 'Slack Pro' has no available seats (5/5 in use)` and creates nothing

### LIC-AC14 — concurrent contention for the final seat [unit] [manual] RN01
- Given one free seat and N different ACTIVE employees
- When all N assignments arrive together
- Then exactly one receives 201, the rest receive 409, and usage never exceeds capacity
- The transaction locks the product row and then the employee row before reading mutable state

### LIC-AC15 — concurrent revocation [unit] [manual] RN06
- Two concurrent revocations of one active assignment produce one 200 and one 409
- `revokedAt` is not overwritten because the assignment is read with `FOR UPDATE`

### LIC-AC08 — validates input [pipe]
- Missing IDs, non-UUID IDs, or extra fields return 400

### LIC-AC09 — lists with filters [unit]
- Filters may be combined; `active=true` returns active assignments and `active=false` returns revoked assignments
- No filters return all assignments; an invalid `active` value returns 400

### LIC-AC10 — revokes manually [unit]
- Revoking an active assignment returns 200 with `revokedAt` set and `revokeReason = MANUAL`; the seat becomes available

### LIC-AC11 — cannot revoke twice [unit] RN06
- A second revocation returns 409 with `License assignment '<id>' is already revoked` and preserves the original values

### LIC-AC12 — missing assignment [unit] RN10
- Revoking a nonexistent assignment returns 404 with `License assignment '<id>' not found`
