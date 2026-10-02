import { RevokeReason } from '../revoke-reason.enum';

export class LicenseResponseDto {
  id: string;
  productId: string;
  productName: string;
  employeeId: string;
  employeeName: string;
  assignedAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
}
