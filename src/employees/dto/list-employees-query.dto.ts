import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EmployeeStatus } from '../employee-status.enum';

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /** @example 'IT' */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  department?: string;
}
