import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CostReportDto } from './dto/cost-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('costs')
  getCostReport(): Promise<CostReportDto> {
    return this.reportsService.getCostReport();
  }
}
