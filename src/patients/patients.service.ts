import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/decorators.js';
import { CareType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePatientDto, ListPatientsQuery, UpdatePatientDto } from './dto.js';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListPatientsQuery) {
    return this.prisma.patient.findMany({
      where: {
        careType: query.careType,
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { room: { contains: query.search, mode: 'insensitive' } },
            { address: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
    return patient;
  }

  async create(dto: CreatePatientDto, actor: AuthUser) {
    const patient = await this.prisma.patient.create({ data: this.normalize(dto) });
    // Alamat dan kontak tidak dimasukkan ke audit (data pribadi).
    await this.audit.record(actor.id, 'PATIENT_CREATE', 'Patient', patient.id, { careType: patient.careType });
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto, actor: AuthUser) {
    const current = await this.get(id);
    const merged = {
      name: dto.name ?? current.name,
      careType: dto.careType ?? current.careType,
      room: dto.room ?? current.room ?? undefined,
      address: dto.address ?? current.address ?? undefined,
      phone: dto.phone ?? current.phone ?? undefined,
      notes: dto.notes ?? current.notes ?? undefined,
    };
    const patient = await this.prisma.patient.update({ where: { id }, data: this.normalize(merged) });
    await this.audit.record(actor.id, 'PATIENT_UPDATE', 'Patient', id, { fields: Object.keys(dto) });
    return patient;
  }

  /**
   * Rawat jalan wajib beralamat dan tidak punya kamar; rawat inap sebaliknya.
   * Kolom yang tidak relevan dikosongkan agar tidak menyisakan data pribadi yang usang.
   */
  private normalize(input: CreatePatientDto) {
    const outpatient = input.careType === CareType.OUTPATIENT;
    if (outpatient && !input.address?.trim()) {
      throw new BadRequestException('Alamat rumah wajib diisi untuk pasien rawat jalan.');
    }
    return {
      name: input.name,
      careType: input.careType,
      room: outpatient ? null : input.room || null,
      address: outpatient ? input.address!.trim() : null,
      phone: input.phone || null,
      notes: input.notes || null,
    };
  }
}
