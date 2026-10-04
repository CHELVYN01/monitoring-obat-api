import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.service.js';
import type { AuthUser } from '../common/decorators.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto.js';
import { USER_SELECT } from './user.select.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListUsersQuery, actor: AuthUser) {
    // Petugas hanya perlu melihat penjaga (untuk menugaskan tugas), bukan semua akun.
    const role = actor.role === Role.OFFICER ? Role.CAREGIVER : query.role;
    return this.prisma.user.findMany({
      where: {
        role,
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string, actor: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user || (actor.role === Role.OFFICER && user.role !== Role.CAREGIVER)) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    const caregiverType = this.resolveCaregiverType(dto.role, dto.caregiverType);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          role: dto.role,
          caregiverType,
          phone: dto.phone || null,
          passwordHash: await hashPassword(dto.password),
        },
        select: USER_SELECT,
      });
      await this.audit.record(actor.id, 'USER_CREATE', 'User', user.id, { role: user.role });
      return user;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pengguna tidak ditemukan.');

    // Cegah admin mengunci diri sendiri.
    if (id === actor.id) {
      if (dto.isActive === false) throw new BadRequestException('Tidak dapat menonaktifkan akun sendiri.');
      if (dto.role && dto.role !== current.role) throw new BadRequestException('Tidak dapat mengubah peran akun sendiri.');
    }

    const role = dto.role ?? current.role;
    const caregiverType = this.resolveCaregiverType(role, dto.caregiverType ?? current.caregiverType ?? undefined);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          role,
          caregiverType,
          phone: dto.phone === undefined ? undefined : dto.phone || null,
          isActive: dto.isActive,
          ...(dto.password && { passwordHash: await hashPassword(dto.password) }),
        },
        select: USER_SELECT,
      });

      // Nonaktif / reset sandi / ganti peran: cabut semua sesi agar berlaku seketika.
      if (dto.isActive === false || dto.password || role !== current.role) {
        await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      await this.audit.record(actor.id, 'USER_UPDATE', 'User', id, {
        fields: Object.keys(dto).filter((k) => k !== 'password'),
        passwordReset: !!dto.password,
      });
      return user;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  /** caregiverType wajib untuk CAREGIVER dan harus kosong untuk peran lain. */
  private resolveCaregiverType(role: Role, type: UpdateUserDto['caregiverType']) {
    if (role === Role.CAREGIVER) {
      if (!type) throw new BadRequestException('caregiverType wajib diisi untuk penjaga (STAFF atau FAMILY).');
      return type;
    }
    return null;
  }

  private mapError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('Email sudah dipakai.');
    }
    return err;
  }
}
