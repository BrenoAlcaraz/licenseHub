import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeDetailResponseDto } from './dto/employee-detail-response.dto';
import { EmployeeResponseDto } from './dto/employee-response.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.employeesService.create(dto);
  }

  @Get()
  findAll(
    @Query() query: ListEmployeesQueryDto,
  ): Promise<EmployeeResponseDto[]> {
    return this.employeesService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployeeDetailResponseDto> {
    return this.employeesService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.updateStatus(id, dto);
  }
}
