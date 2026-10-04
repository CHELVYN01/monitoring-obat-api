import { TaskStatus } from '../generated/prisma/client.js';

export interface ComplianceInput {
  status: TaskStatus;
  /** Hasil log terbaru (bila ada). */
  logResult?: 'GIVEN' | 'REFUSED' | null;
}

export interface ComplianceStat {
  total: number;
  ok: number;
  rate: number | null;
}

/**
 * Kepatuhan penjaga = (GIVEN + VERIFIED) / tugas yang sudah ada hasilnya.
 * - PENDING belum dihitung.
 * - Penolakan pasien (REFUSED) tidak dihitung: penjaga sudah menjalankan tugasnya.
 * - REJECTED (bukti ditolak) dan MISSED dihitung tidak patuh.
 * Aturan ini sama dengan yang dipakai UI admin (apps/admin/src/lib/stats.ts).
 */
export function compliance(items: ComplianceInput[]): ComplianceStat {
  const counted = items.filter((t) => t.status !== TaskStatus.PENDING && t.status !== TaskStatus.REFUSED && t.logResult !== 'REFUSED');
  const ok = counted.filter((t) => t.status === TaskStatus.GIVEN || t.status === TaskStatus.VERIFIED).length;
  return { total: counted.length, ok, rate: counted.length ? ok / counted.length : null };
}
