import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Endpoint tanpa login (mis. /auth/login, /health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Daftar peran yang boleh mengakses. Endpoint non-publik TANPA @Roles ditolak
 * (deny by default) agar endpoint baru tidak terbuka tanpa sengaja.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** User yang sedang login, diisi oleh JwtAuthGuard. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});
