import { EmployeeStatus } from '../employee-status.enum';

export class OffboardResponseDto {
  employeeId: string;
  status: EmployeeStatus;
  /** Active licenses revoked by this offboarding. */
  revokedLicenses: number;
  /** Sum of monthlyCostCents of the revoked licenses. */
  monthlySavingsCents: number;
}
