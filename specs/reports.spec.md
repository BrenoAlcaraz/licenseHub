# Spec — Reports

Monthly cost and waste report for paid but unused licenses. This module is read-only and does not change business data.

## Endpoint

| Method | Route | Success |
|---|---|---|
| GET | `/reports/costs` | 200 `CostReport` |

```json
{
  "totalMonthlyCostCents": 326000,
  "byDepartment": [{ "department": "IT", "activeLicenses": 11, "monthlyCostCents": 105100 }],
  "idleSeats": [{ "productId": "…", "productName": "Microsoft 365 E3", "idleSeats": 3, "wastedMonthlyCostCents": 56700 }],
  "potentialMonthlySavingsCents": 127700
}
```

## Formulas

| Field | Calculation |
|---|---|
| `totalMonthlyCostCents` | Sum of `totalSeats × monthlyCostCents` for every product; what the company pays |
| `byDepartment[]` | Per department, the number of **active** assignments and the sum of their `monthlyCostCents` |
| `idleSeats[]` | Products where `totalSeats − seatsInUse > 0`; `wastedMonthlyCostCents = idleSeats × monthlyCostCents` |
| `potentialMonthlySavingsCents` | Sum of every `wastedMonthlyCostCents` |

`byDepartment` is sorted by descending `monthlyCostCents`. `idleSeats` is sorted by descending `wastedMonthlyCostCents`, with product name as the tie-breaker. Departments without active licenses are omitted.

## Calculation design

- The **database aggregates** with `COUNT`, `SUM`, and `GROUP BY` in two queries: usage per product and active-assignment cost per department.
- The **service derives** totals, idle seats, waste, savings, and ordering in TypeScript.
- Both queries run in a `REPEATABLE READ` transaction against one database snapshot, so `totalMonthlyCostCents − Σ byDepartment = potentialMonthlySavingsCents` always balances.

## Seed data

| Product | Vendor | Monthly cost | Seats | In use | Idle |
|---|---|---:|---:|---:|---:|
| Microsoft 365 E3 | Microsoft | 18900 | 10 | 7 | 3 |
| Slack Pro | Slack | 4500 | 5 | 5 | 0 |
| Adobe Creative Cloud | Adobe | 27500 | 3 | 1 | 2 |
| Jira Software | Atlassian | 4000 | 8 | 4 | 4 |

The seed contains 10 employees in three departments: IT, HR, and Finance. There are 17 active assignments. Fábio is `ON_LEAVE` and retains an M365 license under RN08; João Pereira has no license and can receive a new assignment.

## Acceptance criteria

### REP-AC01 — total cost [unit] [manual]
- Given the seed products
- When `GET /reports/costs` is requested
- Then `totalMonthlyCostCents = 326000`

### REP-AC02 — cost by department [unit] [manual]
- Given the active seed assignments
- Then `byDepartment` contains IT: 11 licenses/105100 cents; HR: 4/69800; Finance: 2/23400

### REP-AC03 — idle seats [unit] [manual]
- Then `idleSeats` contains Microsoft 365 E3: 3/56700; Adobe Creative Cloud: 2/55000; Jira Software: 4/16000
- And full Slack Pro is omitted

### REP-AC04 — potential savings [unit] [manual]
- Then `potentialMonthlySavingsCents = 127700`
- And it balances as `326000 − 198300 = 127700`

### REP-AC05 — revoked assignments do not count [manual]
- Given a revoked assignment
- Then it is excluded from `byDepartment`, and its seat counts as idle
- This is manual because `revoked_at IS NULL` is inside the aggregation SQL and cannot be proven with a mocked database; it is checked against PostgreSQL in stage 9

### REP-AC06 — empty database [unit]
- Given no products
- Then the response is `{ "totalMonthlyCostCents": 0, "byDepartment": [], "idleSeats": [], "potentialMonthlySavingsCents": 0 }`

### REP-AC07 — reflects offboarding [manual]
- Given the seed data
- When Ana Souza is offboarded and `monthlySavingsCents = 27400`
- Then `potentialMonthlySavingsCents` becomes **155100**, while IT drops to 8 licenses and 77700 cents
