import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { ComplianceQuery } from './dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OFFICER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Angka dashboard hari ini dan ringkasan 7 hari' })
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Kepatuhan per hari, per penjaga, dan per pasien' })
  compliance(@Query() query: ComplianceQuery) {
    return this.reports.compliance(query);
  }
}
