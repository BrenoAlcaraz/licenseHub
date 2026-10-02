export class ProductResponseDto {
  id: string;
  name: string;
  vendor: string;
  monthlyCostCents: number;
  totalSeats: number;
  /** Active license assignments of this product. */
  seatsInUse: number;
  /** totalSeats - seatsInUse */
  seatsAvailable: number;
}
