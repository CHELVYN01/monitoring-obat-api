import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CreateTaskDto, ListTasksQuery, UpdateTaskDto, VerifyTaskDto } from './dto.js';
import { TasksService } from './tasks.service.js';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Roles(Role.ADMIN, Role.OFFICER)
  @Get()
  @ApiOperation({ summary: 'Daftar tugas dengan filter dan paginasi' })
  list(@Query() query: ListTasksQuery) {
    return this.tasks.list(query);
  }

  @Roles(Role.ADMIN, Role.OFFICER)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(id);
  }

  @Roles(Role.OFFICER)
  @Post()
  @ApiOperation({ summary: 'Buat tugas obat (Petugas)' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.create(dto, actor);
  }

  @Roles(Role.OFFICER)
  @Patch(':id')
  @ApiOperation({ summary: 'Ubah tugas yang masih Menunggu' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.update(id, dto, actor);
  }

  @Roles(Role.OFFICER)
  @Patch(':id/verify')
  @ApiOperation({ summary: 'Setujui atau tolak bukti pemberian obat' })
  verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.verify(id, dto, actor);
  }
}
