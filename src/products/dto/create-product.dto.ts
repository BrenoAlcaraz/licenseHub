import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProductDto {
  /** @example 'Microsoft 365 E3' */
  @IsString()
  @IsNotEmpty()
  name: string;

  /** @example 'Microsoft' */
  @IsString()
  @IsNotEmpty()
  vendor: string;

  /**
   * Monthly cost of one seat, in cents.
   * @example 18900
   */
  @IsInt()
  @Min(0)
  monthlyCostCents: number;

  /**
   * Number of seats purchased.
   * @example 10
   */
  @IsInt()
  @Min(1)
  totalSeats: number;
}
