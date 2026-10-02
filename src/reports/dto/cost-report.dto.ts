export class DepartmentCostDto {
  /** @example 'TI' */
  department: string;
  /** Active license assignments of the department's employees. */
  activeLicenses: number;
  /** Sum of monthlyCostCents of those assignments. */
  monthlyCostCents: number;
}

export class IdleSeatsDto {
  productId: string;
  productName: string;
  /** totalSeats - seatsInUse */
  idleSeats: number;
  /** idleSeats x monthlyCostCents */
  wastedMonthlyCostCents: number;
}

export class CostReportDto {
  /** What the company pays: sum of totalSeats x monthlyCostCents. */
  totalMonthlyCostCents: number;
  byDepartment: DepartmentCostDto[];
  idleSeats: IdleSeatsDto[];
  /** Sum of wastedMonthlyCostCents. */
  potentialMonthlySavingsCents: number;
}
