import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CreatePatientDto, ListPatientsQuery, UpdatePatientDto } from './dto.js';
import { PatientsService } from './patients.service.js';

@ApiTags('patients')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OFFICER)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar pasien (rawat inap dan rawat jalan)' })
  list(@Query() query: ListPatientsQuery) {
    return this.patients.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.patients.get(id);
  }

  @Post()
  create(@Body() dto: CreatePatientDto, @CurrentUser() actor: AuthUser) {
    return this.patients.create(dto, actor);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto, @CurrentUser() actor: AuthUser) {
    return this.patients.update(id, dto, actor);
  }
}
