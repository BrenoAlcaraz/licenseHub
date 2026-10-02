# Spec — End-to-end tests

End-to-end tests run against the real PostgreSQL database through HTTP, the global `ValidationPipe`, controllers, services, transactions, and locks. They automate the `[pipe]` and `[manual]` criteria from the other specs.

## Environment

- A **separate database**, `licensehub_e2e` or `DB_NAME_E2E`, keeps development seed data untouched.
- MikroORM creates the database when needed; migrations create the schema through the same path used in production.
- Tables are cleared before every test, so scenarios are independent.
- The test application uses the same `configureApp` configuration and `ValidationPipe` as the real application.
- Run `docker compose up -d db`, then `npm run test:e2e`.

## Scenarios

| ID | Scenario | Covers |
|---|---|---|
| E2E-01 | **Complete flow:** create product → create employee → assign → offboard → verify the seat is released, the assignment is revoked with `OFFBOARDING`, and employee details contain no active licenses | RN01, RN04, LIC-AC01, EMP-AC05, EMP-AC11 |
| E2E-02 | **Input validation:** 400 for an invalid body, unknown field, `OFFBOARDED` in the status PATCH, invalid `?active=`, and non-UUID `:id` | PRD-AC03, EMP-AC03, EMP-AC09, LIC-AC08, LIC-AC09 |
| E2E-03 | **Offboarding atomicity:** if the employee `UPDATE` fails through a temporary trigger, no license is revoked | RN04, EMP-AC11 |
| E2E-04 | **Reports ignore revoked assignments:** after revocation, the assignment leaves `byDepartment` and its seat becomes idle | REP-AC05 |
| E2E-05 | **Contention for the final seat:** 20 different employees compete for one seat → 1×201, 19×409, final usage `1/1` | RN01, LIC-AC14 |
| E2E-06 | **Same assignment in parallel:** 10 requests for the same pair → 1×201 and 9×409 | RN03, LIC-AC13 |
| E2E-07 | **Revocation in parallel:** 10 revocations of one assignment → 1×200 and 9×409 | RN06, LIC-AC15 |
| E2E-08 | **Offboarding in parallel:** 10 requests → 1×200 and 9×409; offboarding raced with assignments leaves no active license | RN04, RN05, EMP-AC15 |
| E2E-09 | **Seat reduction vs. assignments:** concurrent `PATCH totalSeats` and assignments always preserve `seatsInUse ≤ totalSeats` | RN07, PRD-AC11 |
| E2E-10 | **Real-time alert:** a connected WebSocket client receives `seats.threshold` when an assignment brings a product to 9/10 | RT-AC07 |
| E2E-11 | **RN09 in parallel:** simultaneous creation with the same product name/email and simultaneous renames to the same name produce one success and 409 for the rest | RN09, PRD-AC12, PRD-AC13, EMP-AC16 |

For concurrency scenarios, the main assertion is the **invariant**—for example, `seatsInUse ≤ totalSeats` or at most one success—regardless of the order in which the database processes requests.
