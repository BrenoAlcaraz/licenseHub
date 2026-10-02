import { IsolationLevel } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';

// Rows as the two aggregate queries return them for the seed described in
// specs/reports.spec.md (department rows deliberately out of order).
const SEED_PRODUCT_ROWS = [
  {
    id: 'm365',
    name: 'Microsoft 365 E3',
    monthly_cost_cents: 18900,
    total_seats: 10,
    seats_in_use: 7,
  },
  {
    id: 'slack',
    name: 'Slack Pro',
    monthly_cost_cents: 4500,
    total_seats: 5,
    seats_in_use: 5,
  },
  {
    id: 'adobe',
    name: 'Adobe Creative Cloud',
    monthly_cost_cents: 27500,
    total_seats: 3,
    seats_in_use: 1,
  },
  {
    id: 'jira',
    name: 'Jira Software',
    monthly_cost_cents: 4000,
    total_seats: 8,
    seats_in_use: 4,
  },
];
const SEED_DEPARTMENT_ROWS = [
  { department: 'Financeiro', active_licenses: 2, monthly_cost_cents: 23400 },
  { department: 'TI', active_licenses: 11, monthly_cost_cents: 105100 },
  { department: 'RH', active_licenses: 4, monthly_cost_cents: 69800 },
];

describe('ReportsService', () => {
  let service: ReportsService;
  let em: { execute: jest.Mock; transactional: jest.Mock };

  // The service runs the product query first, then the department query.
  function mockQueries(productRows: unknown[], departmentRows: unknown[]) {
    em.execute
      .mockResolvedValueOnce(productRows)
      .mockResolvedValueOnce(departmentRows);
  }

  beforeEach(async () => {
    em = {
      execute: jest.fn(),
      transactional: jest.fn((work: () => Promise<unknown>) => work()),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ReportsService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('getCostReport (seed)', () => {
    beforeEach(() => mockQueries(SEED_PRODUCT_ROWS, SEED_DEPARTMENT_ROWS));

    it('REP-AC01 total cost is the sum of totalSeats x monthlyCostCents', async () => {
      const report = await service.getCostReport();

      expect(report.totalMonthlyCostCents).toBe(326000);
    });

    it('REP-AC02 cost by department, most expensive first', async () => {
      const report = await service.getCostReport();

      expect(report.byDepartment).toEqual([
        { department: 'TI', activeLicenses: 11, monthlyCostCents: 105100 },
        { department: 'RH', activeLicenses: 4, monthlyCostCents: 69800 },
        {
          department: 'Financeiro',
          activeLicenses: 2,
          monthlyCostCents: 23400,
        },
      ]);
    });

    it('REP-AC03 idle seats only for products with free seats, most wasteful first', async () => {
      const report = await service.getCostReport();

      expect(report.idleSeats).toEqual([
        {
          productId: 'm365',
          productName: 'Microsoft 365 E3',
          idleSeats: 3,
          wastedMonthlyCostCents: 56700,
        },
        {
          productId: 'adobe',
          productName: 'Adobe Creative Cloud',
          idleSeats: 2,
          wastedMonthlyCostCents: 55000,
        },
        {
          productId: 'jira',
          productName: 'Jira Software',
          idleSeats: 4,
          wastedMonthlyCostCents: 16000,
        },
      ]);
    });

    it('REP-AC04 potential savings is the sum of wasted cost and closes the books', async () => {
      const report = await service.getCostReport();

      const spentOnActiveLicenses = report.byDepartment.reduce(
        (total, department) => total + department.monthlyCostCents,
        0,
      );
      expect(report.potentialMonthlySavingsCents).toBe(127700);
      expect(report.totalMonthlyCostCents - spentOnActiveLicenses).toBe(
        report.potentialMonthlySavingsCents,
      );
    });

    it('reads both aggregates from one REPEATABLE READ snapshot', async () => {
      await service.getCostReport();

      expect(em.transactional).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: IsolationLevel.REPEATABLE_READ,
      });
      expect(em.execute).toHaveBeenCalledTimes(2);
    });
  });

  it('REP-AC06 returns zeros and empty lists when there are no products', async () => {
    mockQueries([], []);

    const report = await service.getCostReport();

    expect(report).toEqual({
      totalMonthlyCostCents: 0,
      byDepartment: [],
      idleSeats: [],
      potentialMonthlySavingsCents: 0,
    });
  });
});
