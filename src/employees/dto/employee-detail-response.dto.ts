import { EmployeeResponseDto } from './employee-response.dto';

export class ActiveLicenseDto {
  assignmentId: string;
  productId: string;
  productName: string;
  assignedAt: Date;
}

export class EmployeeDetailResponseDto extends EmployeeResponseDto {
  activeLicenses: ActiveLicenseDto[];
}
