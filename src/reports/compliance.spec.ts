import { TaskStatus } from '../generated/prisma/client.js';
import { compliance } from './compliance.js';

describe('compliance', () => {
  it('kosong -> rate null', () => {
    expect(compliance([])).toEqual({ total: 0, ok: 0, rate: null });
  });

  it('PENDING tidak dihitung', () => {
    expect(compliance([{ status: TaskStatus.PENDING }])).toEqual({ total: 0, ok: 0, rate: null });
  });

  it('GIVEN dan VERIFIED patuh; MISSED dan REJECTED tidak patuh', () => {
    const r = compliance([
      { status: TaskStatus.GIVEN },
      { status: TaskStatus.VERIFIED, logResult: 'GIVEN' },
      { status: TaskStatus.MISSED },
      { status: TaskStatus.REJECTED, logResult: 'GIVEN' },
    ]);
    expect(r).toEqual({ total: 4, ok: 2, rate: 0.5 });
  });

  it('penolakan pasien tidak dihitung, baik masih REFUSED maupun sudah diverifikasi', () => {
    const r = compliance([
      { status: TaskStatus.REFUSED, logResult: 'REFUSED' },
      { status: TaskStatus.VERIFIED, logResult: 'REFUSED' },
      { status: TaskStatus.GIVEN, logResult: 'GIVEN' },
    ]);
    expect(r).toEqual({ total: 1, ok: 1, rate: 1 });
  });
});
