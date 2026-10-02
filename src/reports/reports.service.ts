import { IsolationLevel } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CostReportDto,
  DepartmentCostDto,
  IdleSeatsDto,
} from './dto/cost-report.dto';

interface ProductUsageRow {
  id: string;
  name: string;
  monthly_cost_cents: number;
  total_seats: number;
  seats_in_use: number;
}

interface DepartmentCostRow {
  department: string;
  active_licenses: number;
  monthly_cost_cents: number;
}

// Seats in use per product. LEFT JOIN keeps products with no assignment
// (seats_in_use = 0); only active assignments are joined.
const PRODUCT_USAGE_SQL = `
  select p.id, p.name, p.monthly_cost_cents, p.total_seats,
         count(a.id)::int as seats_in_use
  from product p
  left join license_assignment a
    on a.product_id = p.id and a.revoked_at is null
  group by p.id`;

// Cost of the active assignments, grouped by the employee's department.
const DEPARTMENT_COST_SQL = `
  select e.department,
         count(*)::int as active_licenses,
         sum(p.monthly_cost_cents)::int as monthly_cost_cents
  from license_assignment a
  join employee e on e.id = a.employee_id
  join product p on p.id = a.product_id
  where a.revoked_at is null
  group by e.department`;

@Injectable()
export class ReportsService {
  constructor(private readonly em: EntityManager) {}

  async getCostReport(): Promise<CostReportDto> {
    // The database aggregates; this method derives the rest. Both queries
    // read the same snapshot, so the numbers always add up.
    const [products, departments] = await this.em.transactional(
      async () => {
        const productRows =
          await this.em.execute<ProductUsageRow[]>(PRODUCT_USAGE_SQL);
        const departmentRows =
          await this.em.execute<DepartmentCostRow[]>(DEPARTMENT_COST_SQL);
        return [productRows, departmentRows] as const;
      },
      { isolationLevel: IsolationLevel.REPEATABLE_READ },
    );

    const idleSeats = this.toIdleSeats(products);
    return {
      totalMonthlyCostCents: sum(
        products.map((p) => p.total_seats * p.monthly_cost_cents),
      ),
      byDepartment: this.toDepartmentCosts(departments),
      idleSeats,
      potentialMonthlySavingsCents: sum(
        idleSeats.map((p) => p.wastedMonthlyCostCents),
      ),
    };
  }

  private toDepartmentCosts(rows: DepartmentCostRow[]): DepartmentCostDto[] {
    return rows
      .map((row) => ({
        department: row.department,
        activeLicenses: row.active_licenses,
        monthlyCostCents: row.monthly_cost_cents,
      }))
      .sort(
        (a, b) =>
          b.monthlyCostCents - a.monthlyCostCents ||
          a.department.localeCompare(b.department),
      );
  }

  private toIdleSeats(products: ProductUsageRow[]): IdleSeatsDto[] {
    return products
      .map((product) => {
        const idleSeats = product.total_seats - product.seats_in_use;
        return {
          productId: product.id,
          productName: product.name,
          idleSeats,
          wastedMonthlyCostCents: idleSeats * product.monthly_cost_cents,
        };
      })
      .filter((product) => product.idleSeats > 0)
      .sort(
        (a, b) =>
          b.wastedMonthlyCostCents - a.wastedMonthlyCostCents ||
          a.productName.localeCompare(b.productName),
      );
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
