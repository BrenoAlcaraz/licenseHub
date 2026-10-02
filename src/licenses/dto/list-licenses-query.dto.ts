import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

// Query strings are always text: turn "true"/"false" into booleans and let
// anything else reach @IsBoolean() so it fails with 400.
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListLicensesQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /** true = only active assignments, false = only revoked ones. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}
