import { EmployeeStatus } from '../employee-status.enum';

export class EmployeeResponseDto {
  id: string;
  name: string;
  email: string;
  department: string;
  status: EmployeeStatus;
  offboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
