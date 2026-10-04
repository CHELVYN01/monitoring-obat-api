import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { USER_SELECT } from '../users/user.select.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Hash tiruan agar waktu respons login sama baik email ada maupun tidak (anti user-enumeration).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash('tidak-dipakai-sebagai-kata-sandi'));

export const hashPassword = (password: string) => hash(password);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = await verify(user?.passwordHash ?? (await getDummyHash()), password);
    if (!user || !passwordOk) {
      // Alasan sebenarnya hanya ada di log (respons ke klien tetap seragam). Email tidak dicatat
      // utuh, hanya sidik jarinya, supaya percobaan berulang ke akun yang sama tetap bisa dikenali.
      this.logger.warn({
        event: 'auth.login_failed',
        reason: user ? 'bad_password' : 'unknown_email',
        userId: user?.id,
        emailHash: sha256(email.toLowerCase()).slice(0, 12),
        msg: 'Login gagal',
      });
      throw new UnauthorizedException('Email atau kata sandi salah.');
    }
    // Pesan spesifik hanya setelah kata sandi benar, supaya tidak membocorkan status akun orang lain.
    if (!user.isActive) {
      this.logger.warn({ event: 'auth.login_inactive', userId: user.id, msg: 'Login ditolak: akun nonaktif' });
      throw new ForbiddenException('Akun dinonaktifkan. Hubungi admin.');
    }
    this.logger.log({ event: 'auth.login', userId: user.id, role: user.role, msg: 'Login berhasil' });
    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });
    if (!record) {
      this.logger.warn({ event: 'auth.refresh_unknown', msg: 'Refresh token tidak dikenal' });
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    if (record.revokedAt) {
      // Token lama dipakai lagi: kemungkinan dicuri. Cabut semua sesi pengguna ini.
      const { count } = await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.error({
        event: 'auth.refresh_reuse',
        userId: record.userId,
        revokedSessions: count,
        msg: 'Refresh token yang sudah dicabut dipakai lagi; semua sesi pengguna dicabut',
      });
      throw new UnauthorizedException('Refresh token tidak valid.');
    }
    if (record.expiresAt <= new Date() || !record.user.isActive) {
      this.logger.warn({
        event: 'auth.refresh_rejected',
        reason: record.user.isActive ? 'expired' : 'inactive',
        userId: record.userId,
        msg: 'Refresh ditolak',
      });
      throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
    }

    // Rotasi atomik: hanya satu permintaan yang berhasil mencabut token ini.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new UnauthorizedException('Refresh token tidak valid.');

    return this.issueTokens(record.user.id, record.user.role);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
  }

  private async issueTokens(userId: string, role: string) {
    const ttl = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const refreshDays = this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS');

    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ttl },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
    return { accessToken, refreshToken, expiresIn: ttl, user };
  }
}
