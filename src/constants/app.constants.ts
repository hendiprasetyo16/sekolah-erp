export const APP_NAME = 'SekolahERP';
export const APP_DESCRIPTION = 'Sistem Manajemen Sekolah Indonesia';
export const APP_VERSION = '1.0.0';

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const SCHOOL_LEVELS = [
  { value: 'SD', label: 'SD - Sekolah Dasar' },
  { value: 'SMP', label: 'SMP - Sekolah Menengah Pertama' },
  { value: 'SMA', label: 'SMA - Sekolah Menengah Atas' },
  { value: 'SMK', label: 'SMK - Sekolah Menengah Kejuruan' },
] as const;

export const ROLE_LABELS: Record<string, { id: string; en: string }> = {
  SUPER_ADMIN: { id: 'Super Admin', en: 'Super Admin' },
  KEPALA_SEKOLAH: { id: 'Kepala Sekolah', en: 'Principal' },
  BENDAHARA: { id: 'Bendahara', en: 'Treasurer' },
  OPERATOR: { id: 'Operator Sekolah', en: 'School Operator' },
  WALI_KELAS: { id: 'Wali Kelas', en: 'Homeroom Teacher' },
  GURU: { id: 'Guru', en: 'Teacher' },
  STAFF_TU: { id: 'Staff TU', en: 'Admin Staff' },
  STAFF_SARPRAS: { id: 'Staff Sarpras', en: 'Facility Staff' },
  ORANG_TUA: { id: 'Orang Tua', en: 'Parent' },
  SISWA: { id: 'Siswa', en: 'Student' },
};

export const DAYS_OF_WEEK = [
  { value: 1, id: 'Senin', en: 'Monday' },
  { value: 2, id: 'Selasa', en: 'Tuesday' },
  { value: 3, id: 'Rabu', en: 'Wednesday' },
  { value: 4, id: 'Kamis', en: 'Thursday' },
  { value: 5, id: 'Jumat', en: 'Friday' },
  { value: 6, id: 'Sabtu', en: 'Saturday' },
] as const;

export const MONTHS = [
  { value: 1, id: 'Januari', en: 'January' },
  { value: 2, id: 'Februari', en: 'February' },
  { value: 3, id: 'Maret', en: 'March' },
  { value: 4, id: 'April', en: 'April' },
  { value: 5, id: 'Mei', en: 'May' },
  { value: 6, id: 'Juni', en: 'June' },
  { value: 7, id: 'Juli', en: 'July' },
  { value: 8, id: 'Agustus', en: 'August' },
  { value: 9, id: 'September', en: 'September' },
  { value: 10, id: 'Oktober', en: 'October' },
  { value: 11, id: 'November', en: 'November' },
  { value: 12, id: 'Desember', en: 'December' },
] as const;

export const RELIGIONS = [
  { value: 'ISLAM', id: 'Islam', en: 'Islam' },
  { value: 'KRISTEN', id: 'Kristen', en: 'Christian' },
  { value: 'KATOLIK', id: 'Katolik', en: 'Catholic' },
  { value: 'HINDU', id: 'Hindu', en: 'Hindu' },
  { value: 'BUDDHA', id: 'Buddha', en: 'Buddhist' },
  { value: 'KONGHUCU', id: 'Konghucu', en: 'Confucian' },
] as const;

export const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  HADIR: 'bg-emerald-500',
  IZIN: 'bg-blue-500',
  SAKIT: 'bg-amber-500',
  ALPHA: 'bg-red-500',
  TERLAMBAT: 'bg-orange-500',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  BELUM_BAYAR: 'bg-red-500',
  SEBAGIAN: 'bg-amber-500',
  LUNAS: 'bg-emerald-500',
  DIBATALKAN: 'bg-gray-500',
};

export const ECONOMIC_CATEGORY_COLORS: Record<string, string> = {
  SANGAT_MISKIN: 'bg-red-600',
  RENTAN_MISKIN: 'bg-orange-500',
  MENENGAH: 'bg-blue-500',
  MAMPU: 'bg-emerald-500',
};
