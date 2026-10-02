import { IsUUID } from 'class-validator';

export class AssignLicenseDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  employeeId: string;
}
