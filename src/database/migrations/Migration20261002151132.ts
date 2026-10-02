import { Migration } from '@mikro-orm/migrations';

export class Migration20261002151132 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "employee" ("id" uuid not null, "name" varchar(255) not null, "email" varchar(255) not null, "department" varchar(255) not null, "status" text check ("status" in ('ACTIVE', 'ON_LEAVE', 'OFFBOARDED')) not null default 'ACTIVE', "offboarded_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "employee_pkey" primary key ("id"));`);
    this.addSql(`alter table "employee" add constraint "employee_email_unique" unique ("email");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "employee" cascade;`);
  }

}
