// Seed data DEMO untuk pengembangan. Meniru data contoh admin (apps/admin/src/lib/mock/seed.ts).
// MENGHAPUS SEMUA DATA di database tujuan, lalu mengisi ulang. Jangan dijalankan ke database sungguhan.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type CareType, type CaregiverType, type LogResult, type Role, type TaskStatus } from '../src/generated/prisma/client.js';

const DEMO_PASSWORD = 'demo1234';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL belum diisi.');
const host = new URL(url).hostname;
if (process.env.NODE_ENV === 'production' || (!['localhost', '127.0.0.1', 'postgres'].includes(host) && process.env.SEED_FORCE !== 'true')) {
  throw new Error(`Seed ditolak: ${host} bukan database lokal. Seed menghapus semua data. (SEED_FORCE=true untuk memaksa)`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MEDICINES: [string, string][] = [
  ['Paracetamol', '500 mg'],
  ['Amlodipine', '5 mg'],
  ['Metformin', '500 mg'],
  ['Simvastatin', '20 mg'],
  ['Omeprazole', '20 mg'],
  ['Furosemide', '40 mg'],
  ['Captopril', '25 mg'],
  ['Vitamin B Kompleks', '1 tablet'],
];
const REJECT_NOTES = ['Foto buram, mohon ulangi.', 'Obat tidak terlihat jelas di foto.', 'Foto tidak sesuai pasien.'];
const GIVEN_NOTES = ['Diminum setelah makan.', 'Pasien minum dengan air hangat.', undefined, undefined];

async function main() {
  const rand = rng(20261003);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000);
  const passwordHash = await hash(DEMO_PASSWORD);

  const user = (
    name: string,
    email: string,
    role: Role,
    extra: { caregiverType?: CaregiverType; phone?: string; isActive?: boolean; lastSyncAt?: Date } = {},
  ) => ({ id: randomUUID(), name, email, role, passwordHash, isActive: true, ...extra });

  const admin = user('Budi Santoso', 'admin@contoh.id', 'ADMIN');
  const officers = [user('Nur Aini', 'nur@contoh.id', 'OFFICER'), user('Dimas Prakoso', 'dimas@contoh.id', 'OFFICER')];
  const cg = {
    siti: user('Siti Rahma', 'siti@contoh.id', 'CAREGIVER', { caregiverType: 'STAFF', phone: '0812-3000-0001', lastSyncAt: minutesAgo(12) }),
    andi: user('Andi Wijaya', 'andi@contoh.id', 'CAREGIVER', { caregiverType: 'STAFF', phone: '0812-3000-0002', lastSyncAt: minutesAgo(95) }),
    eko: user('Eko Prasetyo', 'eko@contoh.id', 'CAREGIVER', { caregiverType: 'STAFF', phone: '0812-3000-0004', isActive: false, lastSyncAt: minutesAgo(60 * 24 * 4) }),
    lina: user('Lina Hakim (anak)', 'lina@contoh.id', 'CAREGIVER', { caregiverType: 'FAMILY', phone: '0857-1100-0003', lastSyncAt: minutesAgo(60 * 20) }),
    doni: user('Doni Anggraini (anak)', 'doni@contoh.id', 'CAREGIVER', { caregiverType: 'FAMILY', phone: '0857-1100-0005', lastSyncAt: minutesAgo(40) }),
    fitri: user('Fitri Hidayat (istri)', 'fitri@contoh.id', 'CAREGIVER', { caregiverType: 'FAMILY', phone: '0857-1100-0006', lastSyncAt: minutesAgo(60 * 30) }),
  };
  const users = [admin, ...officers, ...Object.values(cg)];

  const patient = (name: string, careType: CareType, extra: { room?: string; address?: string; phone?: string; notes?: string } = {}) => ({
    id: randomUUID(),
    name,
    careType,
    ...extra,
  });
  const patients = [
    patient('Ibu Sari Wulandari', 'INPATIENT', { room: 'Melati 1', notes: 'Hipertensi. Minum obat setelah makan.' }),
    patient('Bapak Hendra Gunawan', 'INPATIENT', { room: 'Melati 2', notes: 'Diabetes tipe 2.' }),
    patient('Ibu Rini Marlina', 'INPATIENT', { room: 'Mawar 1' }),
    patient('Bapak Agus Salim', 'INPATIENT', { room: 'Mawar 2', notes: 'Alergi penisilin.' }),
    patient('Ibu Dewi Lestari', 'INPATIENT', { room: 'Anggrek 1' }),
    patient('Bapak Yusuf Hakim', 'OUTPATIENT', { address: 'Jl. Kenanga No. 12, RT 03/RW 05, Bekasi', phone: '0857-1100-0003', notes: 'Sulit menelan tablet besar.' }),
    patient('Ibu Maya Anggraini', 'OUTPATIENT', { address: 'Jl. Melur Raya No. 7, Depok', phone: '0857-1100-0005' }),
    patient('Bapak Rahmat Hidayat', 'OUTPATIENT', { address: 'Perum Griya Asri Blok C-4, Tangerang', phone: '0857-1100-0006' }),
  ];
  // Staf memegang beberapa pasien rawat inap; keluarga satu pasien rawat jalan.
  const caregiverOf = [cg.siti, cg.andi, cg.siti, cg.andi, cg.siti, cg.lina, cg.doni, cg.fitri];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const slots = [6, 8, 12, 14, 18, 20];

  type TaskRow = {
    id: string; patientId: string; caregiverId: string; officerId: string; medicine: string; dose: string;
    scheduledAt: Date; dueUntil: Date; status: TaskStatus; verifyNote?: string; verifiedAt?: Date; verifiedById?: string;
  };
  type LogRow = { id: string; taskId: string; caregiverId: string; result: LogResult; takenAt: Date; syncedAt: Date; photoKey?: string; note?: string };
  const tasks: TaskRow[] = [];
  const logs: LogRow[] = [];

  for (let d = -6; d <= 1; d++) {
    const count = d === 1 ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const pIdx = (i + (d + 6) * 2) % patients.length;
      const p = patients[pIdx]!;
      const caregiver = caregiverOf[pIdx]!;
      const officer = officers[(i + d + 6) % officers.length]!;
      const [medicine, dose] = MEDICINES[(i * 3 + d + 7) % MEDICINES.length]!;

      const scheduled = new Date(todayStart);
      scheduled.setDate(scheduled.getDate() + d);
      scheduled.setHours(slots[i]!, 0, 0, 0);
      const due = new Date(scheduled.getTime() + 2 * 3_600_000);

      const task: TaskRow = {
        id: randomUUID(), patientId: p.id, caregiverId: caregiver.id, officerId: officer.id,
        medicine, dose, scheduledAt: scheduled, dueUntil: due, status: 'PENDING',
      };
      if (due.getTime() > now) {
        tasks.push(task);
        continue;
      }

      const r = rand();
      const past = d < 0;
      let outcome: 'GIVEN' | 'REFUSED' | 'MISSED';
      if (past) {
        task.status = r < 0.74 ? 'VERIFIED' : r < 0.8 ? 'VERIFIED' : r < 0.85 ? 'REJECTED' : 'MISSED';
        outcome = r < 0.74 ? 'GIVEN' : r < 0.8 ? 'REFUSED' : r < 0.85 ? 'GIVEN' : 'MISSED';
      } else {
        task.status = r < 0.55 ? 'GIVEN' : r < 0.65 ? 'REFUSED' : r < 0.8 ? 'VERIFIED' : 'MISSED';
        outcome = r < 0.55 ? 'GIVEN' : r < 0.65 ? 'REFUSED' : r < 0.8 ? 'GIVEN' : 'MISSED';
      }

      if (outcome !== 'MISSED') {
        const takenAt = new Date(scheduled.getTime() + Math.floor(rand() * 100) * 60_000);
        const logId = randomUUID();
        logs.push({
          id: logId, taskId: task.id, caregiverId: caregiver.id, result: outcome, takenAt,
          syncedAt: new Date(takenAt.getTime() + (2 + Math.floor(rand() * 20)) * 60_000),
          note: outcome === 'GIVEN' ? pick(GIVEN_NOTES) : 'Pasien menolak minum obat.',
          // Kunci tiruan: belum ada storage; foto sungguhan datang dari modul uploads (belum dibuat).
          photoKey: outcome === 'GIVEN' ? `seed/${logId}.jpg` : undefined,
        });
      }
      if (task.status === 'VERIFIED' || task.status === 'REJECTED') {
        task.verifiedById = officer.id;
        task.verifiedAt = new Date(due.getTime() + 30 * 60_000);
      }
      if (task.status === 'REJECTED') task.verifyNote = pick(REJECT_NOTES);
      tasks.push(task);
    }
  }

  // Bersihkan (urutan menghormati foreign key), lalu isi ulang.
  await prisma.$transaction([
    prisma.medicationLog.deleteMany(),
    prisma.medicationTask.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  await prisma.user.createMany({ data: users });
  await prisma.patient.createMany({ data: patients });
  await prisma.medicationTask.createMany({ data: tasks });
  await prisma.medicationLog.createMany({ data: logs });

  console.log(`Seed selesai: ${users.length} user, ${patients.length} pasien, ${tasks.length} tugas, ${logs.length} log.`);
  console.log(`Login demo: admin@contoh.id / nur@contoh.id (kata sandi: ${DEMO_PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
