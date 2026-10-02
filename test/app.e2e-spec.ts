// End-to-end tests against the real PostgreSQL (see specs/e2e.spec.md).
// Requires the database container: `docker compose up -d db`.
import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EmployeeDetailResponseDto } from '../src/employees/dto/employee-detail-response.dto';
import { EmployeeResponseDto } from '../src/employees/dto/employee-response.dto';
import { OffboardResponseDto } from '../src/employees/dto/offboard-response.dto';
import { LicenseResponseDto } from '../src/licenses/dto/license-response.dto';
import { ProductResponseDto } from '../src/products/dto/product-response.dto';
import { CostReportDto } from '../src/reports/dto/cost-report.dto';

describe('LicenseHub (e2e)', () => {
  let app: INestApplication<Server>;
  let orm: MikroORM;
  let uniqueId = 0;

  const api = () => request(app.getHttpServer());
  const sql = (query: string) => orm.em.fork().getConnection().execute(query);

  async function createProduct(
    overrides: Partial<{ totalSeats: number; monthlyCostCents: number }> = {},
  ): Promise<ProductResponseDto> {
    const response = await api()
      .post('/products')
      .send({
        name: `Product ${++uniqueId}`,
        vendor: 'Vendor',
        monthlyCostCents: 1000,
        totalSeats: 10,
        ...overrides,
      })
      .expect(201);
    return response.body as ProductResponseDto;
  }

  async function createEmployee(
    department = 'TI',
  ): Promise<EmployeeResponseDto> {
    const id = ++uniqueId;
    const response = await api()
      .post('/employees')
      .send({
        name: `Employee ${id}`,
        email: `employee${id}@e2e.com`,
        department,
      })
      .expect(201);
    return response.body as EmployeeResponseDto;
  }

  const assign = (productId: string, employeeId: string) =>
    api().post('/licenses').send({ productId, employeeId });

  const getProduct = async (id: string) =>
    (await api().get(`/products/${id}`)).body as ProductResponseDto;

  const activeLicensesOf = async (employeeId: string) =>
    (await api().get(`/licenses?employeeId=${employeeId}&active=true`))
      .body as LicenseResponseDto[];

  function countStatuses(responses: Response[]): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const { status } of responses) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);

    // Same path as production: the schema comes from the migrations.
    orm = app.get(MikroORM);
    await orm.migrator.up();

    // Listening on a random port lets concurrent requests share one server.
    await app.listen(0);
  });

  beforeEach(() => sql('truncate license_assignment, employee, product'));

  afterAll(() => app.close());

  it('E2E-01 offboarding frees the license: product → employee → assign → offboard', async () => {
    const product = await createProduct({ monthlyCostCents: 18900 });
    const employee = await createEmployee();

    const assigned = await assign(product.id, employee.id).expect(201);
    expect((await getProduct(product.id)).seatsInUse).toBe(1);

    const offboard = await api()
      .post(`/employees/${employee.id}/offboard`)
      .expect(200);
    expect(offboard.body as OffboardResponseDto).toEqual({
      employeeId: employee.id,
      status: 'OFFBOARDED',
      revokedLicenses: 1,
      monthlySavingsCents: 18900,
    });

    const productAfter = await getProduct(product.id);
    expect(productAfter).toMatchObject({ seatsInUse: 0, seatsAvailable: 10 });

    const revoked = (
      await api().get(`/licenses?employeeId=${employee.id}&active=false`)
    ).body as LicenseResponseDto[];
    expect(revoked).toEqual([
      expect.objectContaining({
        id: (assigned.body as LicenseResponseDto).id,
        revokeReason: 'OFFBOARDING',
      }),
    ]);

    const detail = (await api().get(`/employees/${employee.id}`))
      .body as EmployeeDetailResponseDto;
    expect(detail).toMatchObject({ status: 'OFFBOARDED', activeLicenses: [] });
    expect(detail.offboardedAt).not.toBeNull();
  });

  it('E2E-02 rejects invalid input with 400', async () => {
    const employee = await createEmployee();

    await api()
      .post('/products')
      .send({ name: 'X', vendor: 'Y', monthlyCostCents: -1, totalSeats: 1.5 })
      .expect(400);
    await api()
      .post('/employees')
      .send({
        name: 'X',
        email: 'not-an-email',
        department: 'TI',
        status: 'ACTIVE',
      })
      .expect(400);
    await api()
      .patch(`/employees/${employee.id}/status`)
      .send({ status: 'OFFBOARDED' })
      .expect(400);
    await api()
      .post('/licenses')
      .send({ productId: 'abc', employeeId: employee.id, extra: true })
      .expect(400);
    await api().get('/licenses?active=yes').expect(400);
    await api().get('/products/not-a-uuid').expect(400);
  });

  describe('E2E-03 offboarding is atomic (RN04)', () => {
    afterEach(() =>
      sql(
        'drop trigger if exists fail_employee_update on employee; drop function if exists fail_employee_update();',
      ),
    );

    it('revokes nothing when saving the employee fails', async () => {
      const product = await createProduct();
      const employee = await createEmployee();
      await assign(product.id, employee.id).expect(201);
      await sql(`
        create function fail_employee_update() returns trigger as $$
        begin raise exception 'simulated failure'; end $$ language plpgsql;
        create trigger fail_employee_update before update on employee
        for each row execute function fail_employee_update();`);

      await api().post(`/employees/${employee.id}/offboard`).expect(500);

      expect(await activeLicensesOf(employee.id)).toHaveLength(1);
      const detail = (await api().get(`/employees/${employee.id}`))
        .body as EmployeeDetailResponseDto;
      expect(detail.status).toBe('ACTIVE');
    });
  });

  it('E2E-04 (REP-AC05) the report ignores revoked assignments', async () => {
    const product = await createProduct({
      totalSeats: 2,
      monthlyCostCents: 5000,
    });
    const employee = await createEmployee('RH');
    const assigned = await assign(product.id, employee.id).expect(201);

    await api()
      .post(`/licenses/${(assigned.body as LicenseResponseDto).id}/revoke`)
      .expect(200);

    const report = (await api().get('/reports/costs')).body as CostReportDto;
    expect(report.byDepartment).toEqual([]);
    expect(report.idleSeats).toEqual([
      expect.objectContaining({ idleSeats: 2, wastedMonthlyCostCents: 10000 }),
    ]);
  });

  describe('concurrency', () => {
    it('E2E-05 (LIC-AC14) the last seat goes to exactly one of 20 concurrent requests', async () => {
      const product = await createProduct({ totalSeats: 1 });
      const employees = await Promise.all(
        Array.from({ length: 20 }, () => createEmployee()),
      );

      const responses = await Promise.all(
        employees.map((employee) => assign(product.id, employee.id)),
      );

      expect(countStatuses(responses)).toEqual({ 201: 1, 409: 19 });
      expect((await getProduct(product.id)).seatsInUse).toBe(1);
    });

    it('E2E-06 (LIC-AC13) the same assignment requested 10 times at once is created once', async () => {
      const product = await createProduct();
      const employee = await createEmployee();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => assign(product.id, employee.id)),
      );

      expect(countStatuses(responses)).toEqual({ 201: 1, 409: 9 });
      expect(await activeLicensesOf(employee.id)).toHaveLength(1);
    });

    it('E2E-07 (LIC-AC15) an assignment revoked 10 times at once is revoked once', async () => {
      const product = await createProduct();
      const employee = await createEmployee();
      const assigned = (await assign(product.id, employee.id).expect(201))
        .body as LicenseResponseDto;

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          api().post(`/licenses/${assigned.id}/revoke`),
        ),
      );

      expect(countStatuses(responses)).toEqual({ 200: 1, 409: 9 });
      const winner = responses.find((r) => r.status === 200)!
        .body as LicenseResponseDto;
      const [stored] = (await api().get(`/licenses?employeeId=${employee.id}`))
        .body as LicenseResponseDto[];
      expect(stored.revokedAt).toBe(winner.revokedAt);
    });

    it('E2E-08 (EMP-AC15) concurrent offboards succeed once', async () => {
      const employee = await createEmployee();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          api().post(`/employees/${employee.id}/offboard`),
        ),
      );

      expect(countStatuses(responses)).toEqual({ 200: 1, 409: 9 });
    });

    it('E2E-08 (EMP-AC15) offboarding during assignments leaves no active license', async () => {
      const employee = await createEmployee();
      const products = await Promise.all(
        Array.from({ length: 15 }, () => createProduct()),
      );

      await Promise.all([
        ...products.map((product) => assign(product.id, employee.id)),
        api().post(`/employees/${employee.id}/offboard`).expect(200),
      ]);

      expect(await activeLicensesOf(employee.id)).toEqual([]);
    });

    it('E2E-09 (PRD-AC11) reducing seats during assignments never exceeds totalSeats', async () => {
      const product = await createProduct({ totalSeats: 10 });
      const employees = await Promise.all(
        Array.from({ length: 12 }, () => createEmployee()),
      );
      for (const employee of employees.slice(0, 7)) {
        await assign(product.id, employee.id).expect(201);
      }

      const [patch, ...assignments] = await Promise.all([
        api().patch(`/products/${product.id}`).send({ totalSeats: 7 }),
        ...employees
          .slice(7)
          .map((employee) => assign(product.id, employee.id)),
      ]);

      const after = await getProduct(product.id);
      expect(after.seatsInUse).toBeLessThanOrEqual(after.totalSeats);
      if (patch.status === 200) {
        // The reduction won: no assignment got in after it.
        expect(countStatuses(assignments)).toEqual({ 409: 5 });
      } else {
        // Assignments won first: the reduction was refused by RN07.
        expect(patch.status).toBe(409);
      }
    });
  });
});
