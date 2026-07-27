import type { User, School, AcademicYear } from '../types/common.types';

// Mock School
export const mockSchool: School = {
  id: 'school-001',
  name: 'SMK Nusantara Informatika',
  npsn: '20512345',
  level: 'SMK',
  type: 'SWASTA',
  address: 'Jl. Pendidikan No. 123, Kel. Sukamaju',
  city: 'Bandung',
  province: 'Jawa Barat',
  phone: '022-1234567',
  email: 'info@smknusantara.sch.id',
  logoUrl: undefined,
};

export const mockAcademicYear: AcademicYear = {
  id: 'ay-2025-2026',
  name: '2025/2026',
  startYear: 2025,
  endYear: 2026,
  isActive: true,
};

// Mock Users for each role
export const mockUsers: Record<string, User> = {
  admin: {
    id: 'user-001',
    email: 'admin@smknusantara.sch.id',
    fullName: 'Ahmad Suryadi',
    role: 'SUPER_ADMIN',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
    lastLogin: '2026-06-10T08:00:00Z',
  },
  kepsek: {
    id: 'user-002',
    email: 'kepsek@smknusantara.sch.id',
    fullName: 'Dr. Hj. Siti Rahmawati, M.Pd.',
    role: 'KEPALA_SEKOLAH',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
    lastLogin: '2026-06-10T07:30:00Z',
  },
  bendahara: {
    id: 'user-003',
    email: 'bendahara@smknusantara.sch.id',
    fullName: 'Rina Kurniawan',
    role: 'BENDAHARA',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
  },
  operator: {
    id: 'user-004',
    email: 'operator@smknusantara.sch.id',
    fullName: 'Budi Santoso',
    role: 'OPERATOR',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
  },
  guru: {
    id: 'user-005',
    email: 'guru@smknusantara.sch.id',
    fullName: 'Dewi Anggraeni, S.Pd.',
    role: 'GURU',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
  },
  walikelas: {
    id: 'user-006',
    email: 'walikelas@smknusantara.sch.id',
    fullName: 'Ir. Hendra Wijaya',
    role: 'WALI_KELAS',
    avatarUrl: undefined,
    schoolId: 'school-001',
    isActive: true,
  },
};

// Dashboard Stats
export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  monthlyRevenue: number;
  pendingPayments: number;
  attendanceToday: number;
  damagedItems: number;
  pipRecipients: number;
  incomingLetters: number;
  studentGrowth: number;
  teacherGrowth: number;
  revenueGrowth: number;
  paymentGrowth: number;
}

export const mockDashboardStats: DashboardStats = {
  totalStudents: 847,
  totalTeachers: 52,
  monthlyRevenue: 425000000,
  pendingPayments: 67500000,
  attendanceToday: 94.2,
  damagedItems: 12,
  pipRecipients: 38,
  incomingLetters: 5,
  studentGrowth: 12.5,
  teacherGrowth: 3.8,
  revenueGrowth: 8.2,
  paymentGrowth: -15.3,
};

// Revenue chart data - monthly for current year
export const mockRevenueData = [
  { month: 'Jan', pemasukan: 380000000, pengeluaran: 290000000 },
  { month: 'Feb', pemasukan: 410000000, pengeluaran: 310000000 },
  { month: 'Mar', pemasukan: 395000000, pengeluaran: 285000000 },
  { month: 'Apr', pemasukan: 420000000, pengeluaran: 320000000 },
  { month: 'Mei', pemasukan: 440000000, pengeluaran: 305000000 },
  { month: 'Jun', pemasukan: 425000000, pengeluaran: 298000000 },
  { month: 'Jul', pemasukan: 280000000, pengeluaran: 250000000 },
  { month: 'Agu', pemasukan: 390000000, pengeluaran: 275000000 },
  { month: 'Sep', pemasukan: 435000000, pengeluaran: 310000000 },
  { month: 'Okt', pemasukan: 415000000, pengeluaran: 295000000 },
  { month: 'Nov', pemasukan: 445000000, pengeluaran: 325000000 },
  { month: 'Des', pemasukan: 460000000, pengeluaran: 340000000 },
];

// Student distribution by class/major
export const mockStudentDistribution = [
  { name: 'RPL', value: 215, color: '#6366f1' },
  { name: 'TKJ', value: 198, color: '#8b5cf6' },
  { name: 'MM', value: 176, color: '#a855f7' },
  { name: 'AKL', value: 142, color: '#10b981' },
  { name: 'OTKP', value: 116, color: '#f59e0b' },
];

// Attendance distribution for today
export const mockAttendanceData = [
  { status: 'Hadir', value: 798, color: '#10b981' },
  { status: 'Izin', value: 18, color: '#3b82f6' },
  { status: 'Sakit', value: 22, color: '#f59e0b' },
  { status: 'Alpha', value: 9, color: '#ef4444' },
];

// Recent payments
export interface RecentPayment {
  id: string;
  studentName: string;
  class: string;
  type: string;
  amount: number;
  method: string;
  date: string;
  status: string;
}

export const mockRecentPayments: RecentPayment[] = [
  {
    id: 'pay-001',
    studentName: 'Anisa Putri Rahayu',
    class: 'XII RPL 1',
    type: 'SPP',
    amount: 750000,
    method: 'Transfer',
    date: '2026-06-10T09:15:00Z',
    status: 'LUNAS',
  },
  {
    id: 'pay-002',
    studentName: 'Muhammad Rizki Fauzan',
    class: 'XI TKJ 2',
    type: 'SPP',
    amount: 750000,
    method: 'Tunai',
    date: '2026-06-10T08:45:00Z',
    status: 'LUNAS',
  },
  {
    id: 'pay-003',
    studentName: 'Dina Amelia',
    class: 'X MM 1',
    type: 'SPP',
    amount: 375000,
    method: 'Transfer',
    date: '2026-06-10T08:30:00Z',
    status: 'SEBAGIAN',
  },
  {
    id: 'pay-004',
    studentName: 'Raka Pratama',
    class: 'XI AKL 1',
    type: 'Daftar Ulang',
    amount: 2500000,
    method: 'Transfer',
    date: '2026-06-09T14:20:00Z',
    status: 'LUNAS',
  },
  {
    id: 'pay-005',
    studentName: 'Sari Wulandari',
    class: 'XII OTKP 1',
    type: 'SPP',
    amount: 750000,
    method: 'QRIS',
    date: '2026-06-09T13:10:00Z',
    status: 'LUNAS',
  },
];

// Today's schedule
export interface ScheduleItem {
  id: string;
  time: string;
  subject: string;
  class: string;
  teacher: string;
  room: string;
}

export const mockTodaySchedule: ScheduleItem[] = [
  { id: 's1', time: '07:00 - 08:30', subject: 'Pemrograman Web', class: 'XII RPL 1', teacher: 'Dewi Anggraeni', room: 'Lab Komputer 1' },
  { id: 's2', time: '08:30 - 10:00', subject: 'Basis Data', class: 'XI RPL 2', teacher: 'Hendra Wijaya', room: 'Lab Komputer 2' },
  { id: 's3', time: '10:15 - 11:45', subject: 'Jaringan Komputer', class: 'X TKJ 1', teacher: 'Agus Prasetyo', room: 'Lab Jaringan' },
  { id: 's4', time: '12:30 - 14:00', subject: 'Desain Grafis', class: 'XI MM 1', teacher: 'Lia Susanti', room: 'Lab Multimedia' },
  { id: 's5', time: '14:00 - 15:30', subject: 'Akuntansi Dasar', class: 'X AKL 1', teacher: 'Rini Hartati', room: 'R. Kelas 15' },
];

// Announcements
export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  isPinned: boolean;
  target: string;
}

export const mockAnnouncements: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Ujian Akhir Semester Genap 2025/2026',
    content: 'Ujian Akhir Semester Genap akan dilaksanakan pada tanggal 16-27 Juni 2026. Pastikan semua siswa sudah melunasi administrasi.',
    date: '2026-06-10',
    author: 'Kepala Sekolah',
    isPinned: true,
    target: 'SEMUA',
  },
  {
    id: 'ann-2',
    title: 'Rapat Guru & Pegawai',
    content: 'Rapat bulanan guru dan pegawai akan dilaksanakan Jumat, 13 Juni 2026 pukul 13:00 di Aula Sekolah.',
    date: '2026-06-09',
    author: 'Wakil Kepala Sekolah',
    isPinned: false,
    target: 'GURU',
  },
  {
    id: 'ann-3',
    title: 'Pembayaran SPP Bulan Juni',
    content: 'Batas akhir pembayaran SPP bulan Juni 2026 adalah tanggal 15 Juni 2026.',
    date: '2026-06-08',
    author: 'Bendahara',
    isPinned: false,
    target: 'ORANG_TUA',
  },
];

// Quick action items
export interface QuickAction {
  id: string;
  label: { id: string; en: string };
  icon: string;
  href: string;
  color: string;
}

export const mockQuickActions: QuickAction[] = [
  { id: 'qa-1', label: { id: 'Tambah Siswa', en: 'Add Student' }, icon: 'UserPlus', href: '/students/create', color: 'indigo' },
  { id: 'qa-2', label: { id: 'Catat Pembayaran', en: 'Record Payment' }, icon: 'CreditCard', href: '/finance/spp', color: 'emerald' },
  { id: 'qa-3', label: { id: 'Absensi Hari Ini', en: "Today's Attendance" }, icon: 'ClipboardCheck', href: '/students/attendance', color: 'amber' },
  { id: 'qa-4', label: { id: 'Buat Surat', en: 'Create Letter' }, icon: 'FileText', href: '/admin/letters/outgoing', color: 'violet' },
  { id: 'qa-5', label: { id: 'Lihat Jadwal', en: 'View Schedule' }, icon: 'Calendar', href: '/schedules/class', color: 'cyan' },
  { id: 'qa-6', label: { id: 'Laporan', en: 'Reports' }, icon: 'BarChart3', href: '/reports', color: 'rose' },
];

// Payment summary per type
export const mockPaymentSummary = [
  { type: 'SPP', total: 325000000, paid: 287500000, pending: 37500000 },
  { type: 'Uang Gedung', total: 85000000, paid: 80000000, pending: 5000000 },
  { type: 'Daftar Ulang', total: 42500000, paid: 35000000, pending: 7500000 },
  { type: 'Kegiatan', total: 15000000, paid: 12500000, pending: 2500000 },
  { type: 'BOS', total: 120000000, paid: 120000000, pending: 0 },
];

// Income sources breakdown
export const mockIncomeSourceData = [
  { source: 'SPP', amount: 287500000, percentage: 52 },
  { source: 'BOS', amount: 120000000, percentage: 22 },
  { source: 'Uang Gedung', amount: 80000000, percentage: 15 },
  { source: 'Daftar Ulang', amount: 35000000, percentage: 6 },
  { source: 'Lainnya', amount: 27500000, percentage: 5 },
];
