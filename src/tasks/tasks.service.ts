import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/decorators.js';
import { CareType, CaregiverType, Prisma, Role, TaskStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTaskDto, ListTasksQuery, UpdateTaskDto, VerifyTaskDto } from './dto.js';

const TASK_INCLUDE = {
  patient: { select: { name: true, careType: true } },
  caregiver: { select: { name: true, caregiverType: true } },
  officer: { select: { name: true } },
  logs: { orderBy: { takenAt: 'desc' as const }, take: 1 },
} satisfies Prisma.MedicationTaskInclude;

type TaskRow = Prisma.MedicationTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

/** Bentuk respons yang rata, cocok dengan model Task di admin. */
export function toTaskView(t: TaskRow) {
  const log = t.logs[0];
  return {
    id: t.id,
    patientId: t.patientId,
    patientName: t.patient.name,
    careType: t.patient.careType,
    caregiverId: t.caregiverId,
    caregiverName: t.caregiver.name,
    caregiverType: t.caregiver.caregiverType,
    officerId: t.officerId,
    officerName: t.officer.name,
    medicine: t.medicine,
    dose: t.dose,
    scheduledAt: t.scheduledAt,
    dueUntil: t.dueUntil,
    status: t.status,
    notes: t.notes,
    verifyNote: t.verifyNote,
    verifiedAt: t.verifiedAt,
    log: log
      ? {
          id: log.id,
          result: log.result,
          takenAt: log.takenAt,
          syncedAt: log.syncedAt,
          note: log.note,
          // Kunci objek tidak dibuka ke klien; foto diambil lewat presigned URL (modul uploads).
          hasPhoto: !!log.photoKey,
        }
      : null,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListTasksQuery) {
    const where: Prisma.MedicationTaskWhereInput = {
      ...(q.status?.length && { status: { in: q.status } }),
      caregiverId: q.caregiverId,
      patientId: q.patientId,
      ...((q.from || q.to) && {
        scheduledAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(q.to) }) },
      }),
      ...(q.search && {
        OR: [
          { medicine: { contains: q.search, mode: 'insensitive' } },
          { patient: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const take = q.take ?? 50;
    const skip = q.skip ?? 0;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.medicationTask.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: { scheduledAt: q.order ?? 'desc' },
        skip,
        take,
      }),
      this.prisma.medicationTask.count({ where }),
    ]);
    return { items: rows.map(toTaskView), total, skip, take };
  }

  async get(id: string) {
    const row = await this.prisma.medicationTask.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!row) throw new NotFoundException('Tugas tidak ditemukan.');
    return toTaskView(row);
  }

  async create(dto: CreateTaskDto, actor: AuthUser) {
    const scheduledAt = new Date(dto.scheduledAt);
    const dueUntil = new Date(dto.dueUntil);
    this.assertWindow(scheduledAt, dueUntil);
    await this.assertAssignable(dto.patientId, dto.caregiverId);

    const row = await this.prisma.medicationTask.create({
      data: {
        patientId: dto.patientId,
        caregiverId: dto.caregiverId,
        officerId: actor.id,
        medicine: dto.medicine,
        dose: dto.dose,
        scheduledAt,
        dueUntil,
        notes: dto.notes || null,
      },
      include: TASK_INCLUDE,
    });
    await this.audit.record(actor.id, 'TASK_CREATE', 'MedicationTask', row.id, {
      patientId: row.patientId,
      caregiverId: row.caregiverId,
    });
    return toTaskView(row);
  }

  async update(id: string, dto: UpdateTaskDto, actor: AuthUser) {
    const current = await this.prisma.medicationTask.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Tugas tidak ditemukan.');
    if (current.status !== TaskStatus.PENDING) {
      throw new ConflictException('Hanya tugas berstatus Menunggu yang dapat diubah.');
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : current.scheduledAt;
    const dueUntil = dto.dueUntil ? new Date(dto.dueUntil) : current.dueUntil;
    this.assertWindow(scheduledAt, dueUntil);
    const caregiverId = dto.caregiverId ?? current.caregiverId;
    if (caregiverId !== current.caregiverId) await this.assertAssignable(current.patientId, caregiverId);

    // updateMany dengan syarat status memastikan tidak menimpa tugas yang baru saja dikerjakan penjaga.
    const res = await this.prisma.medicationTask.updateMany({
      where: { id, status: TaskStatus.PENDING },
      data: {
        caregiverId,
        medicine: dto.medicine,
        dose: dto.dose,
        scheduledAt,
        dueUntil,
        notes: dto.notes === undefined ? undefined : dto.notes || null,
      },
    });
    if (res.count === 0) throw new ConflictException('Status tugas sudah berubah. Muat ulang data.');

    await this.audit.record(actor.id, 'TASK_UPDATE', 'MedicationTask', id, { fields: Object.keys(dto) });
    return this.get(id);
  }

  async verify(id: string, dto: VerifyTaskDto, actor: AuthUser) {
    if (!dto.approve && !dto.note?.trim()) {
      throw new BadRequestException('Catatan wajib diisi saat menolak bukti.');
    }
    // Atomik: hanya satu verifikasi yang menang bila dua petugas menekan bersamaan.
    const res = await this.prisma.medicationTask.updateMany({
      where: { id, status: { in: [TaskStatus.GIVEN, TaskStatus.REFUSED] } },
      data: {
        status: dto.approve ? TaskStatus.VERIFIED : TaskStatus.REJECTED,
        verifyNote: dto.note?.trim() || null,
        verifiedAt: new Date(),
        verifiedById: actor.id,
      },
    });
    if (res.count === 0) {
      const exists = await this.prisma.medicationTask.count({ where: { id } });
      if (!exists) throw new NotFoundException('Tugas tidak ditemukan.');
      throw new ConflictException('Tugas ini tidak menunggu verifikasi (sudah diverifikasi atau belum dikerjakan).');
    }
    await this.audit.record(actor.id, dto.approve ? 'TASK_VERIFY' : 'TASK_REJECT', 'MedicationTask', id);
    return this.get(id);
  }

  private assertWindow(scheduledAt: Date, dueUntil: Date) {
    if (dueUntil <= scheduledAt) throw new BadRequestException('Batas waktu harus setelah jadwal.');
  }

  private async assertAssignable(patientId: string, caregiverId: string) {
    const [patient, caregiver] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { careType: true } }),
      this.prisma.user.findUnique({ where: { id: caregiverId }, select: { role: true, isActive: true, caregiverType: true } }),
    ]);
    if (!patient) throw new BadRequestException('Pasien tidak ditemukan.');
    if (!caregiver || caregiver.role !== Role.CAREGIVER) throw new BadRequestException('Penjaga tidak ditemukan.');
    if (!caregiver.isActive) throw new BadRequestException('Penjaga tidak aktif.');
    // Keluarga hanya merawat pasien rawat jalan di rumah.
    if (caregiver.caregiverType === CaregiverType.FAMILY && patient.careType === CareType.INPATIENT) {
      throw new BadRequestException('Penjaga bertipe keluarga hanya dapat ditugaskan untuk pasien rawat jalan.');
    }
  }
}
