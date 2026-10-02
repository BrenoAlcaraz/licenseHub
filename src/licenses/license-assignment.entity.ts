import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { Employee } from '../employees/employee.entity';
import { Product } from '../products/product.entity';
import { RevokeReason } from './revoke-reason.enum';

// RN03 enforced by the database too: at most one *active* assignment
// (revoked_at IS NULL) per product and employee.
@Entity()
@Index({
  name: 'license_assignment_active_unique',
  expression:
    'create unique index "license_assignment_active_unique" on "license_assignment" ("product_id", "employee_id") where "revoked_at" is null',
})
export class LicenseAssignment {
  // Fields with default values (and the computed getter): em.create() does
  // not require them.
  [OptionalProps]?: 'assignedAt' | 'revokedAt' | 'revokeReason' | 'isActive';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Product)
  product: Product;

  @ManyToOne(() => Employee)
  employee: Employee;

  @Property()
  assignedAt: Date = new Date();

  @Property({ type: 'datetime', nullable: true })
  revokedAt: Date | null = null;

  @Enum({ items: () => RevokeReason, nullable: true })
  revokeReason: RevokeReason | null = null;

  /** An assignment is active while it has not been revoked. */
  get isActive(): boolean {
    return this.revokedAt === null;
  }

  // Assignments are never deleted: revoking keeps the row as history.
  revoke(reason: RevokeReason): void {
    this.revokedAt = new Date();
    this.revokeReason = reason;
  }
}
