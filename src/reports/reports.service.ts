import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { compliance } from './compliance.js';
import type { ComplianceQuery } from './dto.js';

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 92;

@Injectable()
export class ReportsService {
  private readonly offsetMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.offsetMs = config.getOrThrow<number>('TZ_OFFSET_MINUTES') * 60_000;
  }

  /** Awal hari (zona waktu operasional) untuk timestamp tertentu, dalam ms UTC. */
  private dayStart(ts: number) {
    return Math.floor((ts + this.offsetMs) / DAY) * DAY - this.offsetMs;
  }

  /** Label tanggal YYYY-MM-DD menurut zona waktu operasional. */
  private dayLabel(dayStartMs: number) {
    return new Date(dayStartMs + this.offsetMs).toISOString().slice(0, 10);
  }

  async dashboard() {
    const todayStart = this.dayStart(Date.now());
    const weekStart = todayStart - 6 * DAY;

    const [rows, awaitingVerification] = await Promise.all([
      this.prisma.medicationTask.findMany({
        where: { scheduledAt: { gte: new Date(weekStart), lt: new Date(todayStart + DAY) } },
        select: { scheduledAt: true, status: true, logs: { orderBy: { takenAt: 'desc' }, take: 1, select: { result: true } } },
      }),
      this.prisma.medicationTask.count({ where: { status: { in: [TaskStatus.GIVEN, TaskStatus.REFUSED] } } }),
    ]);

    const items = rows.map((r) => ({ at: r.scheduledAt.getTime(), status: r.status, logResult: r.logs[0]?.result ?? null }));
    const today = items.filter((i) => i.at >= todayStart);
    const count = (list: typeof items, ...s: TaskStatus[]) => list.filter((i) => s.includes(i.status)).length;

    const week = Array.from({ length: 7 }, (_, i) => {
      const start = weekStart + i * DAY;
      const list = items.filter((x) => x.at >= start && x.at < start + DAY);
      return {
        date: this.dayLabel(start),
        total: list.length,
        pending: count(list, TaskStatus.PENDING),
        given: count(list, TaskStatus.GIVEN, TaskStatus.VERIFIED, TaskStatus.REFUSED),
        rejected: count(list, TaskStatus.REJECTED),
        missed: count(list, TaskStatus.MISSED),
      };
    });

    return {
      today: {
        date: this.dayLabel(todayStart),
        total: today.length,
        given: count(today, TaskStatus.GIVEN, TaskStatus.VERIFIED),
        missed: count(today, TaskStatus.MISSED),
        complianceRate: compliance(today).rate,
      },
      awaitingVerification,
      week,
    };
  }

  async compliance(query: ComplianceQuery) {
    const todayStart = this.dayStart(Date.now());
    const from = query.from ? this.dayStart(new Date(query.from).getTime()) : todayStart - 6 * DAY;
    const to = query.to ? this.dayStart(new Date(query.to).getTime()) + DAY : todayStart + DAY;
    if (to <= from) throw new BadRequestException('Rentang tanggal tidak valid.');
    if ((to - from) / DAY > MAX_RANGE_DAYS) throw new BadRequestException(`Rentang maksimal ${MAX_RANGE_DAYS} hari.`);

    const rows = await this.prisma.medicationTask.findMany({
      where: { scheduledAt: { gte: new Date(from), lt: new Date(to) } },
      select: {
        scheduledAt: true,
        status: true,
        caregiverId: true,
        patientId: true,
        caregiver: { select: { name: true } },
        patient: { select: { name: true } },
        logs: { orderBy: { takenAt: 'desc' }, take: 1, select: { result: true } },
      },
    });
    const items = rows.map((r) => ({ ...r, at: r.scheduledAt.getTime(), logResult: r.logs[0]?.result ?? null }));

    const byDay = Array.from({ length: Math.round((to - from) / DAY) }, (_, i) => {
      const start = from + i * DAY;
      return { date: this.dayLabel(start), ...compliance(items.filter((x) => x.at >= start && x.at < start + DAY)) };
    });

    const group = (key: 'caregiverId' | 'patientId', nameOf: (r: (typeof items)[number]) => string) => {
      const map = new Map<string, { id: string; name: string; list: typeof items }>();
      for (const r of items) {
        const entry = map.get(r[key]) ?? { id: r[key], name: nameOf(r), list: [] };
        entry.list.push(r);
        map.set(r[key], entry);
      }
      return [...map.values()]
        .map(({ id, name, list }) => ({ id, name, ...compliance(list) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };

    return {
      from: this.dayLabel(from),
      to: this.dayLabel(to - DAY),
      overall: compliance(items),
      byDay,
      byCaregiver: group('caregiverId', (r) => r.caregiver.name),
      byPatient: group('patientId', (r) => r.patient.name),
    };
  }
}
