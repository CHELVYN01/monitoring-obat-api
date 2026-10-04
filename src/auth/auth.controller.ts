import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';
import { LoginDto, RefreshDto } from './dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Login; mengembalikan access + refresh token' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: 'Tukar refresh token dengan pasangan token baru (rotasi)' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  @ApiOperation({ summary: 'Cabut refresh token (idempoten)' })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OFFICER, Role.CAREGIVER)
  @Get('me')
  @ApiOperation({ summary: 'Profil user yang sedang login' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
