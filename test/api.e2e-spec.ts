import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';

const PASSWORD = 'rahasia-test-123';

describe('API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  const ids = {} as Record<'admin' | 'officer' | 'staff' | 'family' | 'inpatient' | 'outpatient', string>;
  const tokens = {} as Record<'admin' | 'officer' | 'staff' | 'family', string>;

  const login = async (email: string) => {
    const res = await http.post('/auth/login').send({ email, password: PASSWORD });
    return res;
  };
  const auth = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(nest);
    await nest.init();
    app = nest;
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer()) as unknown as ReturnType<typeof request>;

    // Mulai dari database kosong (database test khusus, bukan data dev).
    await prisma.$transaction([
      prisma.medicationLog.deleteMany(),
      prisma.medicationTask.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.patient.deleteMany(),
      prisma.user.deleteMany(),
    ]);
    const passwordHash = await hashPassword(PASSWORD);
    const mk = (name: string, email: string, role: 'ADMIN' | 'OFFICER' | 'CAREGIVER', caregiverType?: 'STAFF' | 'FAMILY') =>
      prisma.user.create({ data: { name, email, role, caregiverType, passwordHash } });

    ids.admin = (await mk('Admin', 'admin@test.id', 'ADMIN')).id;
    ids.officer = (await mk('Petugas', 'officer@test.id', 'OFFICER')).id;
    ids.staff = (await mk('Staf', 'staff@test.id', 'CAREGIVER', 'STAFF')).id;
    ids.family = (await mk('Keluarga', 'family@test.id', 'CAREGIVER', 'FAMILY')).id;
    ids.inpatient = (await prisma.patient.create({ data: { name: 'Pasien Inap', careType: 'INPATIENT', room: 'A1' } })).id;
    ids.outpatient = (
      await prisma.patient.create({ data: { name: 'Pasien Jalan', careType: 'OUTPATIENT', address: 'Jl. Uji 1' } })
    ).id;

    for (const [who, email] of [
      ['admin', 'admin@test.id'],
      ['officer', 'officer@test.id'],
      ['staff', 'staff@test.id'],
      ['family', 'family@test.id'],
    ] as const) {
      tokens[who] = (await login(email)).body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health & proteksi dasar', () => {
    it('GET /health publik dan memeriksa database', async () => {
      await http.get('/health').expect(200, { status: 'ok', db: 'up' });
    });

    it('menolak permintaan tanpa token dan dengan token palsu', async () => {
      await http.get('/tasks').expect(401);
      await http.get('/tasks').set('Authorization', 'Bearer palsu').expect(401);
    });

    it('menolak field di luar DTO (whitelist)', async () => {
      await http.post('/auth/login').send({ email: 'officer@test.id', password: PASSWORD, admin: true }).expect(400);
    });
  });

  describe('auth', () => {
    it('login berhasil tidak membocorkan hash atau pushToken', async () => {
      const res = await login('officer@test.id').then((r) => r);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user).toMatchObject({ email: 'officer@test.id', role: 'OFFICER' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|pushToken/);
    });

    it('kata sandi salah dan email tidak dikenal memberi respons yang sama', async () => {
      const a = await http.post('/auth/login').send({ email: 'officer@test.id', password: 'salah-salah' });
      const b = await http.post('/auth/login').send({ email: 'tidak-ada@test.id', password: 'salah-salah' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('refresh merotasi token; pemakaian ulang token lama mencabut seluruh sesi', async () => {
      const first = (await login('staff@test.id')).body;
      const second = await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      expect(second.body.refreshToken).not.toBe(first.refreshToken);

      // Token lama dipakai lagi -> ditolak, dan token baru ikut dicabut (indikasi pencurian).
      await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await http.post('/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
    });

    it('logout mencabut refresh token', async () => {
      const { refreshToken } = (await login('staff@test.id')).body;
      await http.post('/auth/logout').send({ refreshToken }).expect(204);
      await http.post('/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('akun nonaktif tidak bisa login dan access token yang sudah ada langsung ditolak', async () => {
      await prisma.user.create({
        data: { name: 'Sementara', email: 'tmp@test.id', role: 'OFFICER', passwordHash: await hashPassword(PASSWORD) },
      });
      const tmpToken = (await login('tmp@test.id')).body.accessToken;
      await http.get('/auth/me').set('Authorization', `Bearer ${tmpToken}`).expect(200);

      await prisma.user.update({ where: { email: 'tmp@test.id' }, data: { isActive: false } });
      await http.get('/auth/me').set('Authorization', `Bearer ${tmpToken}`).expect(401);
      await login('tmp@test.id').then((r) => expect(r.status).toBe(403));
    });
  });

  describe('users', () => {
    it('Admin membuat penjaga; caregiverType wajib untuk penjaga', async () => {
      const base = { name: 'Baru', email: 'baru@test.id', role: 'CAREGIVER', password: 'password-baru-1' };
      await http.post('/users').set(auth('admin')).send(base).expect(400);
      const ok = await http.post('/users').set(auth('admin')).send({ ...base, caregiverType: 'FAMILY' }).expect(201);
      expect(ok.body).not.toHaveProperty('passwordHash');
      expect(ok.body.caregiverType).toBe('FAMILY');
    });

    it('email ganda -> 409', async () => {
      await http
        .post('/users')
        .set(auth('admin'))
        .send({ name: 'Dobel', email: 'officer@test.id', role: 'OFFICER', password: 'password-baru-1' })
        .expect(409);
    });

    it('Petugas dan Penjaga tidak boleh membuat user', async () => {
      const body = { name: 'X', email: 'x@test.id', role: 'OFFICER', password: 'password-baru-1' };
      await http.post('/users').set(auth('officer')).send(body).expect(403);
      await http.post('/users').set(auth('staff')).send(body).expect(403);
    });

    it('Petugas hanya melihat penjaga', async () => {
      const res = await http.get('/users').set(auth('officer')).expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((u: { role: string }) => u.role === 'CAREGIVER')).toBe(true);
      await http.get(`/users/${ids.admin}`).set(auth('officer')).expect(404);
    });

    it('Admin tidak bisa menonaktifkan atau mengubah peran akun sendiri', async () => {
      await http.patch(`/users/${ids.admin}`).set(auth('admin')).send({ isActive: false }).expect(400);
      await http.patch(`/users/${ids.admin}`).set(auth('admin')).send({ role: 'OFFICER' }).expect(400);
    });
  });

  describe('patients', () => {
    it('rawat jalan wajib beralamat', async () => {
      await http.post('/patients').set(auth('officer')).send({ name: 'Tanpa Alamat', careType: 'OUTPATIENT' }).expect(400);
    });

    it('menormalkan kolom: rawat jalan tanpa kamar, rawat inap tanpa alamat', async () => {
      const jalan = await http
        .post('/patients')
        .set(auth('officer'))
        .send({ name: 'Jalan', careType: 'OUTPATIENT', address: 'Jl. A', room: 'X9' })
        .expect(201);
      expect(jalan.body).toMatchObject({ address: 'Jl. A', room: null });

      const inap = await http
        .patch(`/patients/${jalan.body.id}`)
        .set(auth('officer'))
        .send({ careType: 'INPATIENT', room: 'B2' })
        .expect(200);
      expect(inap.body).toMatchObject({ careType: 'INPATIENT', room: 'B2', address: null });
    });

    it('Penjaga tidak boleh membaca data pasien', async () => {
      await http.get('/patients').set(auth('staff')).expect(403);
      await http.get('/patients').set(auth('family')).expect(403);
    });
  });

  describe('alur tugas: buat -> dikerjakan -> verifikasi', () => {
    let taskId: string;

    it('Petugas membuat tugas; Admin tidak boleh membuat', async () => {
      const body = {
        patientId: ids.inpatient,
        caregiverId: ids.staff,
        medicine: 'Amlodipine',
        dose: '5 mg',
        scheduledAt: inHours(1),
        dueUntil: inHours(3),
      };
      await http.post('/tasks').set(auth('admin')).send(body).expect(403);
      const res = await http.post('/tasks').set(auth('officer')).send(body).expect(201);
      taskId = res.body.id;
      expect(res.body).toMatchObject({ status: 'PENDING', patientName: 'Pasien Inap', officerId: ids.officer, log: null });
    });

    it('validasi: batas waktu setelah jadwal, penjaga keluarga tidak untuk rawat inap, penjaga harus ada', async () => {
      const base = { patientId: ids.inpatient, caregiverId: ids.staff, medicine: 'X', dose: '1', scheduledAt: inHours(2), dueUntil: inHours(1) };
      await http.post('/tasks').set(auth('officer')).send(base).expect(400);
      await http
        .post('/tasks')
        .set(auth('officer'))
        .send({ ...base, dueUntil: inHours(3), caregiverId: ids.family })
        .expect(400);
      await http
        .post('/tasks')
        .set(auth('officer'))
        .send({ ...base, dueUntil: inHours(3), caregiverId: ids.officer })
        .expect(400);
      // Keluarga untuk pasien rawat jalan: boleh.
      await http
        .post('/tasks')
        .set(auth('officer'))
        .send({ ...base, dueUntil: inHours(3), patientId: ids.outpatient, caregiverId: ids.family })
        .expect(201);
    });

    it('tidak bisa diverifikasi sebelum dikerjakan', async () => {
      await http.patch(`/tasks/${taskId}/verify`).set(auth('officer')).send({ approve: true }).expect(409);
    });

    it('setelah penjaga mengerjakan (disimulasikan), penolakan wajib memakai catatan', async () => {
      // Sinkronisasi dari HP belum dibuat; simulasikan hasil sync/push di database.
      await prisma.medicationTask.update({ where: { id: taskId }, data: { status: 'GIVEN' } });
      await prisma.medicationLog.create({
        data: { id: crypto.randomUUID(), taskId, caregiverId: ids.staff, result: 'GIVEN', takenAt: new Date(), photoKey: 'test/foto.jpg' },
      });

      const view = await http.get(`/tasks/${taskId}`).set(auth('admin')).expect(200);
      expect(view.body.log).toMatchObject({ result: 'GIVEN', hasPhoto: true });
      expect(JSON.stringify(view.body)).not.toContain('test/foto.jpg');

      await http.patch(`/tasks/${taskId}/verify`).set(auth('officer')).send({ approve: false }).expect(400);
      const rejected = await http
        .patch(`/tasks/${taskId}/verify`)
        .set(auth('officer'))
        .send({ approve: false, note: 'Foto buram' })
        .expect(200);
      expect(rejected.body).toMatchObject({ status: 'REJECTED', verifyNote: 'Foto buram' });
    });

    it('sudah diverifikasi: tidak bisa diverifikasi atau diubah lagi', async () => {
      await http.patch(`/tasks/${taskId}/verify`).set(auth('officer')).send({ approve: true }).expect(409);
      await http.patch(`/tasks/${taskId}`).set(auth('officer')).send({ dose: '10 mg' }).expect(409);
    });

    it('tugas Menunggu bisa diubah; mencatat audit', async () => {
      const created = await http
        .post('/tasks')
        .set(auth('officer'))
        .send({ patientId: ids.inpatient, caregiverId: ids.staff, medicine: 'Vit C', dose: '1', scheduledAt: inHours(5), dueUntil: inHours(7) })
        .expect(201);
      const upd = await http.patch(`/tasks/${created.body.id}`).set(auth('officer')).send({ dose: '2 tablet' }).expect(200);
      expect(upd.body.dose).toBe('2 tablet');

      const audits = await prisma.auditLog.findMany({ where: { entityId: created.body.id } });
      expect(audits.map((a) => a.action).sort()).toEqual(['TASK_CREATE', 'TASK_UPDATE']);
    });

    it('daftar tugas mendukung filter status (koma) dan paginasi', async () => {
      const res = await http.get('/tasks?status=REJECTED,GIVEN&take=1').set(auth('officer')).expect(200);
      expect(res.body.take).toBe(1);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items.every((t: { status: string }) => ['REJECTED', 'GIVEN'].includes(t.status))).toBe(true);
      await http.get('/tasks?status=NGAWUR').set(auth('officer')).expect(400);
      await http.get('/tasks?take=9999').set(auth('officer')).expect(400);
    });
  });

  describe('laporan', () => {
    it('dashboard memberi angka hari ini dan 7 hari', async () => {
      const res = await http.get('/reports/dashboard').set(auth('admin')).expect(200);
      expect(res.body.week).toHaveLength(7);
      expect(res.body.today).toHaveProperty('total');
      expect(typeof res.body.awaitingVerification).toBe('number');
    });

    it('kepatuhan menghitung REJECTED sebagai tidak patuh dan memberi rincian', async () => {
      const res = await http.get('/reports/compliance').set(auth('officer')).expect(200);
      expect(res.body.byDay).toHaveLength(7);
      const staff = res.body.byCaregiver.find((c: { id: string }) => c.id === ids.staff);
      expect(staff).toBeTruthy();
      expect(staff.ok).toBeLessThanOrEqual(staff.total);
    });

    it('menolak rentang terlalu panjang dan Penjaga tidak boleh mengakses', async () => {
      await http.get('/reports/compliance?from=2020-01-01&to=2026-01-01').set(auth('officer')).expect(400);
      await http.get('/reports/dashboard').set(auth('staff')).expect(403);
    });
  });
});
