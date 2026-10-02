# LicenseHub — Project specification

> Context for AI assistants helping build this project. Read this document before making changes and follow the collaboration rules at the end.

## 1. Context and goal

I am a Data Science and AI student applying for a Junior Backend Developer role whose stack includes NestJS, TypeScript, MikroORM, PostgreSQL, Docker, REST, and WebSockets. This GitHub project demonstrates that I can structure and explain a back end using that stack.

The business problem comes from my process-automation internship. The IT team managed Microsoft licenses manually. Hires, offboarding, and leave required someone to remember to assign or remove licenses. The company consequently paid for licenses assigned to former employees and lacked visibility into available seats. I solved it there with Power Platform; this project rebuilds the solution as a back-end service.

The goal is a small, clean, tested, and well-documented REST API. Simplicity is a requirement.

## 2. Stack and scope

| Item | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript with `strict: true` |
| Framework | Latest compatible stable NestJS |
| Database | PostgreSQL 16 |
| ORM | MikroORM 6 with PostgreSQL, NestJS, migrations, and CLI packages |
| Validation | `class-validator` and `class-transformer`; global `ValidationPipe` with whitelist, forbidNonWhitelisted, and transform |
| Configuration | `@nestjs/config` with `.env` |
| API documentation | `@nestjs/swagger` at `/docs` |
| Tests | Jest |
| Containers | Multi-stage Dockerfile and Docker Compose |
| Quality | ESLint and Prettier |

Do not add authentication/authorization, a separate front end, cloud infrastructure, queues, Kubernetes, Terraform, microservices, pagination, cache, rate limiting, or features not documented in this repository. The existing minimal dashboard is the only approved front-end exception.

## 3. Domain model

All IDs are UUIDs, money is stored as integer cents, and dates use UTC.

- **Product:** `id`, unique `name`, `vendor`, nonnegative `monthlyCostCents`, `totalSeats ≥ 1`, and timestamps.
- **Employee:** `id`, `name`, unique valid `email`, `department`, `status` (`ACTIVE`, `ON_LEAVE`, or `OFFBOARDED`), nullable `offboardedAt`, and timestamps.
- **LicenseAssignment:** `id`, required product and employee relations, `assignedAt`, nullable `revokedAt`, and nullable `revokeReason` (`MANUAL` or `OFFBOARDING`).

An assignment is active when `revokedAt` is null. Assignments are never deleted; revocation turns the table into its own history. Product usage is the count of active assignments.

## 4. Business rules

| Code | Rule | Error |
|---|---|---:|
| RN01 | A license can be assigned only if the product has an available seat. | 409 |
| RN02 | Only ACTIVE employees may receive a license. | 409 |
| RN03 | An employee cannot have two active assignments for the same product. | 409 |
| RN04 | Offboarding sets OFFBOARDED and `offboardedAt`, then revokes every active assignment with OFFBOARDING in one transaction. | — |
| RN05 | An already OFFBOARDED employee cannot be offboarded again. | 409 |
| RN06 | A revoked assignment cannot be revoked again. | 409 |
| RN07 | `totalSeats` cannot be reduced below current usage. | 409 |
| RN08 | An ON_LEAVE employee retains existing licenses but cannot receive new ones. | — |
| RN09 | Product names and employee emails are unique. | 409 |
| RN10 | A missing product, employee, or assignment returns not found. | 404 |

Input validation errors return 400 through the global pipe. Error messages must be clear and in English.

## 5. API

- Products: `POST /products`, `GET /products`, `GET /products/:id`, `PATCH /products/:id`. Responses include calculated `seatsInUse` and `seatsAvailable`.
- Employees: `POST /employees`, `GET /employees` with optional status/department filters, `GET /employees/:id`, `PATCH /employees/:id/status`, and `POST /employees/:id/offboard`.
- Licenses: `POST /licenses`, `GET /licenses` with optional product/employee/active filters, and `POST /licenses/:id/revoke`.
- Reports: `GET /reports/costs` returns total monthly cost, cost by department, idle seats, and potential savings.
- Dashboard: `GET /` serves the English browser interface.
- Swagger: `GET /docs`.

Detailed behavior and acceptance criteria live in [`specs/`](specs/).

## 6. Database, Docker, and configuration

- `docker compose up --build` must start PostgreSQL and the API without manual setup.
- PostgreSQL has a health check; the API waits for a healthy database.
- Pending migrations run automatically when the API starts.
- Production schema changes use migrations only; never `schema:update` or synchronization.
- The Dockerfile is multi-stage and installs production-only dependencies in the runtime image.
- `npm run seed` creates approximately four products, ten employees in three departments, and representative assignments, including idle seats and one ON_LEAVE employee.
- Required scripts include start, start:dev, build, test, test:cov, lint, migration:create, migration:up, and seed.

## 7. Tests

Every business rule belongs in a service and requires unit coverage with mocked MikroORM dependencies. The suite must cover successful assignment; RN01, RN02, RN03, RN06, and RN10 in licenses; transactional RN04, RN05, and RN08 in employees; and RN07 in products. End-to-end tests may exercise the complete flow against PostgreSQL.

## 8. Project organization

Organize code by domain. Each module contains its entity, controller, service, DTOs, and unit tests. Database migrations and seed data live under `src/database`. Controllers handle HTTP concerns and delegate to services; business rules never belong in controllers.

## 9. Documentation

All repository documentation, code comments, error text, Swagger descriptions, and dashboard copy must be in English. Code identifiers must remain in English. The README should explain the problem, features, rules, stack, setup, usage, tests, structure, technical decisions, production improvements, and the role of AI during development.

## 10. Working agreement

- Follow the staged project plan and complete one requested stage at a time. Stop after the stage, summarize it briefly, and wait for confirmation.
- Keep explanations concise and interview-friendly.
- Do not add scope or dependencies without asking first.
- Prefer simple, readable code over generic abstractions or clever patterns.
- Keep names in code and all repository prose in English.
- Put business rules in services; controllers validate/delegate only.
- Generate a migration whenever an entity changes.
- Run tests and lint at the end of each stage and report the results.
- Use small Conventional Commits when commits are requested.
