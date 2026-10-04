import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN, Role.OFFICER)
  @Get()
  @ApiOperation({ summary: 'Daftar pengguna (Petugas hanya melihat penjaga)' })
  list(@Query() query: ListUsersQuery, @CurrentUser() actor: AuthUser) {
    return this.users.list(query, actor);
  }

  @Roles(Role.ADMIN, Role.OFFICER)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.users.get(id, actor);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }
}
