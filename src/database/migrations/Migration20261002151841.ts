import { Migration } from '@mikro-orm/migrations';

export class Migration20261002151841 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "license_assignment" ("id" uuid not null, "product_id" uuid not null, "employee_id" uuid not null, "assigned_at" timestamptz not null, "revoked_at" timestamptz null, "revoke_reason" text check ("revoke_reason" in ('MANUAL', 'OFFBOARDING')) null, constraint "license_assignment_pkey" primary key ("id"));`);
    this.addSql(`create unique index "license_assignment_active_unique" on "license_assignment" ("product_id", "employee_id") where "revoked_at" is null;`);

    this.addSql(`alter table "license_assignment" add constraint "license_assignment_product_id_foreign" foreign key ("product_id") references "product" ("id") on update cascade;`);
    this.addSql(`alter table "license_assignment" add constraint "license_assignment_employee_id_foreign" foreign key ("employee_id") references "employee" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "license_assignment" cascade;`);
  }

}
