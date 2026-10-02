import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { EmployeeStatus } from '../employee-status.enum';

// OFFBOARDED is not here on purpose: offboarding has its own endpoint
// (POST /employees/:id/offboard) because it also revokes licenses.
const CHANGEABLE_STATUSES = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.ON_LEAVE,
] as const;

type ChangeableStatus = (typeof CHANGEABLE_STATUSES)[number];

export class UpdateEmployeeStatusDto {
  @ApiProperty({ enum: CHANGEABLE_STATUSES, example: EmployeeStatus.ON_LEAVE })
  @IsIn(CHANGEABLE_STATUSES)
  status: ChangeableStatus;
}
