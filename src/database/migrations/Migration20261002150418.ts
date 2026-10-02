import { Migration } from '@mikro-orm/migrations';

export class Migration20261002150418 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "product" ("id" uuid not null, "name" varchar(255) not null, "vendor" varchar(255) not null, "monthly_cost_cents" int not null, "total_seats" int not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "product_pkey" primary key ("id"));`);
    this.addSql(`alter table "product" add constraint "product_name_unique" unique ("name");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product" cascade;`);
  }

}
