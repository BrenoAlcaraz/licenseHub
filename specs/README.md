# LicenseHub specs

This directory is the **source of truth** for API behavior. The project follows spec-driven development: nothing is implemented before it is documented here.

## Workflow

1. **Spec** — behavior is documented in this directory and reviewed.
2. **Red** — each acceptance criterion marked `[unit]` becomes an `it()` in the module's `*.service.spec.ts`. The test is written first and fails.
3. **Green** — the entity, migration, DTOs, service, and controller are implemented until the tests pass.
4. **Refactor** — clean up while tests remain green (`npm run test` and `npm run lint`).

## ID convention

Each acceptance criterion has an ID in the form `<MODULE>-AC<NN>`:

| Prefix | Module | File |
|---|---|---|
| `PRD` | Products | [products.spec.md](products.spec.md) |
| `EMP` | Employees | [employees.spec.md](employees.spec.md) |
| `LIC` | Licenses | [licenses.spec.md](licenses.spec.md) |
| `REP` | Reports | [reports.spec.md](reports.spec.md) |
| `RT` | Real-time WebSocket alerts | [realtime.spec.md](realtime.spec.md) |
| `UI` | Web dashboard | [dashboard.spec.md](dashboard.spec.md) |
| `E2E` | End-to-end tests | [e2e.spec.md](e2e.spec.md) |

Test names reference the criterion ID and business rule, for example:

```ts
it('LIC-AC05 (RN03) rejects a second active assignment of the same product', ...)
```

Searching for the ID therefore finds both the specification and the test that guarantees it.

## Verification methods

| Marker | Verification |
|---|---|
| `[unit]` | Service unit test with Jest and a mocked `EntityManager`; required |
| `[pipe]` | Global `ValidationPipe` and DTO decorators; automated in E2E-02 |
| `[e2e]` | Automated test using the real application and PostgreSQL |
| `[manual]` | Checked against the real database; concurrency and atomicity cases are automated in E2E-03 through E2E-11 |

## Criterion format

```text
### XXX-AC01 — short title            [unit] RN0x
- Given <initial state>
- When  <action>
- Then  <observable result: HTTP status, body, database effect>
```

## Cross-cutting rules

- IDs are UUIDs; a non-UUID `:id` returns **400** through `ParseUUIDPipe`.
- Money is always represented as **integer cents**; dates use UTC and ISO 8601.
- Error messages are in English and use Nest's standard body: `{ "statusCode": 409, "message": "...", "error": "Conflict" }`.
