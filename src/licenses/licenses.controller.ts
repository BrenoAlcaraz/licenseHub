import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssignLicenseDto } from './dto/assign-license.dto';
import { LicenseResponseDto } from './dto/license-response.dto';
import { ListLicensesQueryDto } from './dto/list-licenses-query.dto';
import { LicensesService } from './licenses.service';

@ApiTags('licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Post()
  assign(@Body() dto: AssignLicenseDto): Promise<LicenseResponseDto> {
    return this.licensesService.assign(dto);
  }

  @Get()
  findAll(@Query() query: ListLicensesQueryDto): Promise<LicenseResponseDto[]> {
    return this.licensesService.findAll(query);
  }

  // POST returns 201 by default; revoking changes an existing resource.
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id', ParseUUIDPipe) id: string): Promise<LicenseResponseDto> {
    return this.licensesService.revoke(id);
  }
}
