import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY, type AuthUser } from '../common/decorators.js';
import type { Role } from '../generated/prisma/client.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;

    // Deny by default: endpoint non-publik wajib mendeklarasikan @Roles.
    if (!roles?.length || !user || !roles.includes(user.role)) {
      throw new ForbiddenException('Anda tidak berhak mengakses sumber daya ini.');
    }
    return true;
  }
}
