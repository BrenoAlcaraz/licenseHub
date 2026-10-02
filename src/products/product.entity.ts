import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

@Entity()
export class Product {
  // Fields with default values: em.create() does not require them.
  [OptionalProps]?: 'createdAt' | 'updatedAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ unique: true })
  name: string;

  @Property()
  vendor: string;

  /** Monthly cost of a single seat, in cents. */
  @Property({ type: 'integer' })
  monthlyCostCents: number;

  /** Number of seats the company pays for. */
  @Property({ type: 'integer' })
  totalSeats: number;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
