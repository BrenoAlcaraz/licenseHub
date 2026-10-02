import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { ProductsModule } from '../products/products.module';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { SeatsThresholdGateway } from './seats-threshold.gateway';

@Module({
  imports: [ProductsModule, EmployeesModule],
  controllers: [LicensesController],
  providers: [LicensesService, SeatsThresholdGateway],
})
export class LicensesModule {}
