export const APP_NAME = 'Sistem Informasi Manajemen Sekolah';
export const APP_SHORT_NAME = 'SIMS';
export const APP_VERSION = '2.0.0';

export const DEFAULT_PAGE_SIZE = 15;
export const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

export const SCHOOL_LEVELS = [
  { value: 'SD', label: 'SD - Sekolah Dasar' },
  { value: 'MI', label: 'MI - Madrasah Ibtidaiyah' },
  { value: 'SMP', label: 'SMP - Sekolah Menengah Pertama' },
  { value: 'MTs', label: 'MTs - Madrasah Tsanawiyah' },
  { value: 'SMA', label: 'SMA - Sekolah Menengah Atas' },
  { value: 'MA', label: 'MA - Madrasah Aliyah' },
  { value: 'SMK', label: 'SMK - Sekolah Menengah Kejuruan' },
  { value: 'MAK', label: 'MAK - Madrasah Aliyah Kejuruan' },
] as const;

export const ROLE_LABELS: Record<string, { id: string; en: string }> = {
  SUPER_ADMIN: { id: 'Super Admin', en: 'Super Admin' },
  ADMIN: { id: 'Admin Sekolah', en: 'School Admin' },
  KEPALA_SEKOLAH: { id: 'Kepala Sekolah', en: 'Principal' },
  OPERATOR: { id: 'Operator Dapodik', en: 'School Operator' },
  BENDAHARA: { id: 'Bendahara', en: 'Treasurer' },
  WALI_KELAS: { id: 'Wali Kelas', en: 'Homeroom Teacher' },
  GURU: { id: 'Guru', en: 'Teacher' },
  STAFF_TU: { id: 'Staff Tata Usaha', en: 'Admin Staff' },
  STAFF_SARPRAS: { id: 'Staff Sarpras', en: 'Facility Staff' },
  ORANG_TUA: { id: 'Orang Tua / Wali', en: 'Parent' },
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
  { value: 'Islam', id: 'Islam', en: 'Islam' },
  { value: 'Kristen', id: 'Kristen', en: 'Christian' },
  { value: 'Katolik', id: 'Katolik', en: 'Catholic' },
  { value: 'Hindu', id: 'Hindu', en: 'Hindu' },
  { value: 'Buddha', id: 'Buddha', en: 'Buddhist' },
  { value: 'Konghucu', id: 'Konghucu', en: 'Confucian' },
] as const;

export const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  HADIR: 'bg-emerald-600',
  IZIN: 'bg-sky-600',
  SAKIT: 'bg-amber-600',
  ALPA: 'bg-rose-600',
  TERLAMBAT: 'bg-orange-600',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  BELUM_BAYAR: 'bg-rose-600',
  CICILAN: 'bg-amber-600',
  LUNAS: 'bg-emerald-600',
  DIBATALKAN: 'bg-slate-500',
};

export const ECONOMIC_CATEGORY_COLORS: Record<string, string> = {
  SANGAT_MISKIN: 'bg-rose-600',
  RENTAN_MISKIN: 'bg-orange-600',
  MENENGAH: 'bg-sky-600',
  MAMPU: 'bg-emerald-600',
};