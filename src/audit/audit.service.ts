import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catat aksi penting. Kegagalan audit tidak boleh menggagalkan aksi utama,
   * tapi dicatat ke log. Jangan taruh data sensitif (kata sandi, alamat) di `meta`.
   */
  async record(actorId: string, action: string, entity: string, entityId: string, meta?: Prisma.InputJsonValue) {
    try {
      await this.prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
      // Jejak ringkas juga di log (tanpa `meta`) supaya satu pencarian reqId menampilkan aksinya.
      this.logger.log({ event: 'audit', actorId, action, entity, entityId, msg: `${action} ${entity}` });
    } catch (err) {
      this.logger.error({ event: 'audit.failed', actorId, action, entity, entityId, err, msg: 'Gagal mencatat audit' });
    }
  }
}
