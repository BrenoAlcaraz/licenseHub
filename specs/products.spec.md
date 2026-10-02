# Spec — Products

Software product registration and calculation of purchased seats currently in use. Applies **RN07**, **RN09**, and **RN10**.

## Model

| Field | Type | Rules |
|---|---|---|
| id | uuid | Primary key |
| name | string | Required and unique |
| vendor | string | Required |
| monthlyCostCents | integer | Required and ≥ 0 |
| totalSeats | integer | Required and ≥ 1 |
| createdAt / updatedAt | timestamptz | Automatic |

Calculated fields are not stored: `seatsInUse` is the number of active assignments (`revokedAt IS NULL`), and `seatsAvailable = totalSeats − seatsInUse`.

## Endpoints

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/products` | `CreateProductDto` | 201 `ProductResponse` | 400, 409 |
| GET | `/products` | — | 200 `ProductResponse[]` | — |
| GET | `/products/:id` | — | 200 `ProductResponse` | 400, 404 |
| PATCH | `/products/:id` | `UpdateProductDto` | 200 `ProductResponse` | 400, 404, 409 |

`CreateProductDto` contains `name`, `vendor`, `monthlyCostCents`, and `totalSeats`. `UpdateProductDto` accepts the same fields as optional values. `ProductResponse` adds `id`, timestamps, `seatsInUse`, and `seatsAvailable`.

## Error messages

| Situation | Status | Message |
|---|---:|---|
| Duplicate name | 409 | `Product 'Microsoft 365 E3' already exists` |
| Missing product | 404 | `Product '<id>' not found` |
| Reduce below usage | 409 | `Cannot reduce totalSeats of 'Microsoft 365 E3' to 5: 7 seats in use` |

## Acceptance criteria

### PRD-AC01 — creates a product [unit]
- Given no product named "Microsoft 365 E3"
- When valid data is sent to `POST /products`
- Then the response is 201 with `seatsInUse = 0` and `seatsAvailable = totalSeats`

### PRD-AC02 — rejects a duplicate name [unit] RN09
- Given "Microsoft 365 E3" already exists
- When the same `name` is submitted
- Then the response is 409 with the documented message and nothing is persisted

### PRD-AC03 — validates input [pipe]
- When required fields are missing, costs are negative, seats are below 1, numbers are not integers, or unknown fields are supplied
- Then the response is 400 with validation errors

### PRD-AC04 — lists calculated seats [unit]
- Given 10 seats, 7 active assignments, and 2 revoked assignments
- When products are listed
- Then `seatsInUse = 7` and `seatsAvailable = 3`; revoked assignments do not count

### PRD-AC05 — returns product details [unit]
- Given an existing product
- When `GET /products/:id` is requested
- Then the response is 200 with the complete `ProductResponse`

### PRD-AC06 — handles a missing product [unit] RN10
- When a nonexistent ID is used with GET or PATCH
- Then the response is 404 with `Product '<id>' not found`

### PRD-AC07 — updates fields [unit]
- Given an existing product
- When `monthlyCostCents` is patched to 19900
- Then the response contains the new value and leaves other fields unchanged

### PRD-AC08 — rejects renaming to an existing name [unit] RN09
- Given "Slack Pro" and "Jira Software"
- When Jira is renamed to "Slack Pro"
- Then the response is 409; keeping the product's own current name is not a conflict

### PRD-AC09 — does not reduce seats below usage [unit] RN07
- Given 7 seats in use
- When `totalSeats` is patched to 5
- Then the response is 409 with the documented message and the product remains unchanged

### PRD-AC10 — can reduce seats to exactly current usage [unit] RN07
- Given 7 seats in use
- When `totalSeats` is patched to 7
- Then the response is 200 with `seatsAvailable = 0`

### PRD-AC11 — concurrent reduction and assignment [unit] [manual] RN07 RN01
- Given `totalSeats = 10` and 5 seats in use
- When a reduction to 5 races with new assignments
- Then `seatsInUse` never exceeds `totalSeats`: either the PATCH wins and assignments receive 409, or assignments win and the PATCH receives 409
- Product rows are read with `FOR UPDATE` inside both transactions

### PRD-AC12 — concurrent creation with the same name [unit] [manual] RN09
- When several requests create "Slack Pro" concurrently
- Then exactly one receives 201, the rest receive 409, and only one row exists
- The unique index is the final safeguard when requests pass the service check together

### PRD-AC13 — concurrent rename to the same name [unit] [manual] RN09
- Given two differently named products
- When both are renamed to "Slack Pro" concurrently
- Then exactly one receives 200, the other receives 409, and only one product has that name
