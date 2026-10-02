import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createMikroOrmConfig } from './mikro-orm.config';
import { EmployeesModule } from './employees/employees.module';
import { LicensesModule } from './licenses/licenses.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: createMikroOrmConfig,
    }),
    ProductsModule,
    EmployeesModule,
    LicensesModule,
    ReportsModule,
  ],
})
export class AppModule {}
