# Spec — Web dashboard

A minimal browser interface that demonstrates LicenseHub flows and makes usage, costs, HTTP calls, and WebSocket events visible. This is an approved exception to the original front-end exclusion and covers only the behavior in this specification.

## Goal

The dashboard allows a reviewer to view costs and idle seats; create and edit products; create and filter employees; assign and revoke licenses; place employees on leave, reactivate them, or offboard them; and see real-time seat-threshold alerts.

## Boundaries

- One page served at `GET /` by the same NestJS process, port, and container.
- Swagger remains available at `/docs`.
- The UI uses only existing REST endpoints and WebSocket events. It adds no UI-specific API.
- Relative paths keep the UI on the same origin without CORS or backend URL configuration.
- Plain HTML, CSS, and TypeScript with no framework, chart library, state manager, new dependency, or CDN asset.
- No authentication, authorization, pagination, cache, import/export, or new business rule.
- The interface and code-facing text are in English. Backend messages are displayed unchanged.

## Architecture

The dashboard is a browser adapter over the existing HTTP/WebSocket seam:

```text
Browser UI → REST controllers → services → PostgreSQL
Browser UI ← seats.threshold ← Socket.IO gateway
```

Services remain authoritative for RN01–RN10. The browser may disable obviously invalid actions for usability, but it never duplicates business rules and always handles backend 400/404/409 responses.

## Navigation and views

The single page has Overview, Products, Employees, and Assignments sections. The header shows real-time connection status and links to Swagger.

- **Overview:** total monthly cost, potential savings, active-license count, idle-seat count, cost by department, and waste by product from `GET /reports/costs`.
- **Products:** name, vendor, monthly cost, total seats, used seats, available seats, and an explicit usage bar. Products at 90% or more receive an additional visual cue.
- **Employees:** status/department filters, employee details, active licenses, status changes, and offboarding.
- **Assignments:** product/employee/active filters, complete assignment history, assignment, and manual revocation.

Money remains integer cents over HTTP and is formatted as Brazilian reais only for display. Dates remain UTC over HTTP and are displayed in the browser's local time.

## Mutations and refresh behavior

- Product forms send only `name`, `vendor`, `monthlyCostCents`, and `totalSeats`. Currency text is converted exactly to integer cents.
- Employee creation sends `name`, `email`, and `department`; status defaults on the backend.
- Status changes use `PATCH /employees/:id/status`; `ON_LEAVE` retains existing licenses.
- Offboarding requires confirmation and uses `POST /employees/:id/offboard`. The UI displays the count and savings returned by the backend instead of calculating them.
- Assignment selectors are populated from product and employee endpoints. Availability is informative; the backend still enforces RN01–RN03.
- Revocation is available only for active assignments and requires confirmation.
- After every successful mutation, reports, products, employees, and assignments are fetched again. The active action button is disabled while the request runs.

## Feedback, accessibility, and WebSocket behavior

- Successful mutations show a short confirmation.
- Backend status and message bodies are shown unchanged, including each item in a `ValidationPipe` message array.
- Network and invalid-JSON failures have dedicated English messages; existing screen data is preserved.
- Initial loading and each empty list have explicit states.
- Every field has a label, actions are keyboard accessible, feedback uses `aria-live`, and narrow screens can scroll tables horizontally.
- The page connects Socket.IO to the default namespace on the same host. Connection state is visible, `seats.threshold` notices are dismissible, and socket disconnection never blocks HTTP actions.

## Acceptance criteria

### UI-AC01 — serves the interface from the same server [e2e]
- Given the running application
- When `GET /` is requested
- Then dashboard HTML and local assets return 200, and `/docs` remains available

### UI-AC02 — shows the overview [manual]
- Given seed data
- When the dashboard opens
- Then totals, savings, active licenses, idle seats, department costs, and product waste match the report

### UI-AC03 — creates and edits a product [manual]
- Entering `189.00` sends `monthlyCostCents: 18900`; POST/PATCH results appear after refresh

### UI-AC04 — creates, filters, and details an employee [manual]
- A newly created employee appears as ACTIVE; filters use query parameters; details show only active licenses

### UI-AC05 — leave preserves licenses [manual] RN08
- Choosing "Place on leave" sends `ON_LEAVE`, updates status, and keeps existing licenses visible

### UI-AC06 — offboarding shows the backend result [manual] RN04 RN05
- Confirmed offboarding calls the endpoint, shows returned revoked count and savings, and refreshes all datasets

### UI-AC07 — assigns and revokes a license [manual] RN01 RN02 RN03 RN06
- Selecting a product and ACTIVE employee creates an assignment; confirmed revocation leaves it visible in history

### UI-AC08 — exposes backend errors [manual]
- A 400, 404, or 409 displays its status and message without removing already loaded data

### UI-AC09 — does not trust stale availability [manual] RN01
- If another request takes the last displayed seat, the assignment's 409 is shown and the next refresh displays actual usage

### UI-AC10 — displays real-time alerts [manual] RT-AC01
- At 90% or more usage, the dashboard shows product name, usage, and total; socket disconnection does not stop HTTP operations

### UI-AC11 — handles loading and empty data [manual]
- Initial requests show `Loading…`; empty lists show specific messages without breaking navigation

### UI-AC12 — works in Docker without internet access [manual]
- `docker compose up --build` serves the API, dashboard, Swagger, and Socket.IO at the same address without external assets

### UI-AC13 — does not duplicate business rules [manual]
- The implementation contains no independent RN01–RN10 or offboarding-savings calculations and performs every mutation through existing HTTP interfaces

## Out of scope

Login and UI users, deletion of historical assignments/products/employees, browser-side routes, complex charts and themes, internationalization, cross-tab polling, CSV/PDF export, and browser E2E tooling such as Playwright or Cypress.
