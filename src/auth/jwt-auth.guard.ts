import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { IS_PUBLIC_KEY, type AuthUser } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token tidak ada.');

    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Token tidak valid atau kedaluwarsa.');
    }

    // Selalu baca peran dan status dari database: akun yang dinonaktifkan atau diubah
    // perannya berlaku seketika, tidak menunggu token kedaluwarsa.
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Akun tidak aktif.');

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    // Semua log request ini (termasuk log akhir request) otomatis memuat siapa pelakunya.
    this.logger.assign({ userId: user.id, role: user.role });
    return true;
  }
}
