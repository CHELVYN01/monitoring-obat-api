import { Prisma } from '../generated/prisma/client.js';

/** Kolom user yang aman dikirim ke klien (tanpa passwordHash dan pushToken). */
export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  caregiverType: true,
  phone: true,
  isActive: true,
  lastSyncAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;
