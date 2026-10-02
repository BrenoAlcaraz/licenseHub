import {
  Entity,
  Enum,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { EmployeeStatus } from './employee-status.enum';

@Entity()
export class Employee {
  // Fields with default values: em.create() does not require them.
  [OptionalProps]?: 'status' | 'offboardedAt' | 'createdAt' | 'updatedAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property()
  name: string;

  @Property({ unique: true })
  email: string;

  @Property()
  department: string;

  @Enum({ items: () => EmployeeStatus })
  status: EmployeeStatus = EmployeeStatus.ACTIVE;

  @Property({ type: 'datetime', nullable: true })
  offboardedAt: Date | null = null;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
