import type { ApiResponsePaginated, ApiResponse, PaginatedParams } from '@/services/api.types';
import type { StudentListItem, StudentDetail } from '../types/student.types';

const allStudents: StudentListItem[] = [
  { id: '1', nisn: '0012345678', nik: '3204012503080001', fullName: 'Anisa Putri Rahayu', gender: 'P', className: 'XII RPL 1', classId: 'cls-1', gradeLevel: 12, status: 'AKTIF', phone: '081234567890', entryDate: '2023-07-10' },
  { id: '2', nisn: '0012345679', nik: '3204012207090002', fullName: 'Muhammad Rizki Fauzan', gender: 'L', className: 'XI TKJ 2', classId: 'cls-2', gradeLevel: 11, status: 'AKTIF', phone: '081234567891', entryDate: '2024-07-10' },
  { id: '3', nisn: '0012345680', nik: '3204010811100003', fullName: 'Dina Amelia Putri', gender: 'P', className: 'X MM 1', classId: 'cls-3', gradeLevel: 10, status: 'AKTIF', phone: '081234567892', entryDate: '2025-07-10' },
  { id: '4', nisn: '0012345681', nik: '3204013001090004', fullName: 'Raka Pratama Putra', gender: 'L', className: 'XI AKL 1', classId: 'cls-4', gradeLevel: 11, status: 'AKTIF', phone: '081234567893', entryDate: '2024-07-10' },
  { id: '5', nisn: '0012345682', nik: '3204011209080005', fullName: 'Sari Wulandari', gender: 'P', className: 'XII OTKP 1', classId: 'cls-5', gradeLevel: 12, status: 'AKTIF', phone: '081234567894', entryDate: '2023-07-10' },
  { id: '6', nisn: '0012345683', nik: '3204012505100006', fullName: 'Adi Nugroho', gender: 'L', className: 'X RPL 2', classId: 'cls-6', gradeLevel: 10, status: 'AKTIF', phone: '081234567895', entryDate: '2025-07-10' },
  { id: '7', nisn: '0012345684', nik: '3204010112080007', fullName: 'Fitri Handayani', gender: 'P', className: 'XII TKJ 1', classId: 'cls-7', gradeLevel: 12, status: 'AKTIF', phone: '081234567896', entryDate: '2023-07-10' },
  { id: '8', nisn: '0012345685', nik: '3204011804090008', fullName: 'Bayu Setiawan', gender: 'L', className: 'XI MM 2', classId: 'cls-8', gradeLevel: 11, status: 'MUTASI_KELUAR', phone: '081234567897', entryDate: '2024-07-10' },
  { id: '9', nisn: '0012345686', nik: '3204010708100009', fullName: 'Citra Dewi Lestari', gender: 'P', className: 'X AKL 1', classId: 'cls-9', gradeLevel: 10, status: 'AKTIF', phone: '081234567898', entryDate: '2025-07-10' },
  { id: '10', nisn: '0012345687', nik: '3204011406080010', fullName: 'Dimas Arya Pratama', gender: 'L', className: 'XII RPL 2', classId: 'cls-10', gradeLevel: 12, status: 'AKTIF', phone: '081234567899', entryDate: '2023-07-10' },
  { id: '11', nisn: '0012345688', nik: '3204012802090011', fullName: 'Eka Ramadhani', gender: 'P', className: 'XI RPL 1', classId: 'cls-11', gradeLevel: 11, status: 'AKTIF', phone: '081234567900', entryDate: '2024-07-10' },
  { id: '12', nisn: '0012345689', nik: '3204010310100012', fullName: 'Fajar Maulana', gender: 'L', className: 'X TKJ 1', classId: 'cls-12', gradeLevel: 10, status: 'AKTIF', phone: '081234567901', entryDate: '2025-07-10' },
  { id: '13', nisn: '0012345690', nik: '3204011507080013', fullName: 'Gita Puspitasari', gender: 'P', className: 'XII MM 1', classId: 'cls-13', gradeLevel: 12, status: 'AKTIF', phone: '081234567902', entryDate: '2023-07-10' },
  { id: '14', nisn: '0012345691', nik: '3204012109090014', fullName: 'Hadi Kurniawan', gender: 'L', className: 'XI OTKP 1', classId: 'cls-14', gradeLevel: 11, status: 'AKTIF', phone: '081234567903', entryDate: '2024-07-10' },
  { id: '15', nisn: '0012345692', nik: '3204010503100015', fullName: 'Indah Permatasari', gender: 'P', className: 'X RPL 1', classId: 'cls-15', gradeLevel: 10, status: 'AKTIF', phone: '081234567904', entryDate: '2025-07-10' },
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function mockStudentList(
  params: PaginatedParams & { classId?: string; status?: string }
): Promise<ApiResponsePaginated<StudentListItem>> {
  await delay(400);
  let filtered = [...allStudents];

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(s => s.fullName.toLowerCase().includes(q) || s.nisn.includes(q));
  }
  if (params.status && params.status !== 'all') {
    filtered = filtered.filter(s => s.status === params.status);
  }
  if (params.classId) {
    filtered = filtered.filter(s => s.className.includes(params.classId!));
  }
  if (params.sortBy) {
    filtered.sort((a, b) => {
      const aVal = (a as any)[params.sortBy!];
      const bVal = (b as any)[params.sortBy!];
      const order = params.sortOrder === 'desc' ? -1 : 1;
      return aVal > bVal ? order : aVal < bVal ? -order : 0;
    });
  }

  const page = params.page || 1;
  const limit = params.limit || 10;
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const data = filtered.slice((page - 1) * limit, page * limit);

  return {
    success: true,
    data: { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } },
  };
}

export async function mockStudentDetail(id: string): Promise<ApiResponse<StudentDetail>> {
  await delay(300);
  const student = allStudents.find(s => s.id === id);
  if (!student) return { success: false, data: null as any, message: 'Siswa tidak ditemukan' };

  const detail: StudentDetail = {
    ...student,
    noKk: '3204011234567890',
    nickname: student.fullName.split(' ')[0],
    birthDate: '2008-03-15',
    birthPlace: 'Bandung',
    religion: 'ISLAM',
    address: 'Jl. Merdeka No. 45 RT 03/RW 05',
    rt: '03', rw: '05',
    kelurahan: 'Sukamaju', kecamatan: 'Cibeunying Kaler',
    city: 'Bandung', province: 'Jawa Barat', postalCode: '40123',
    email: `${student.fullName.toLowerCase().replace(/\s+/g, '.')}@email.com`,
    distanceToSchool: 3.5, transport: 'MOTOR', previousSchool: 'SMP Negeri 1 Bandung',
    parents: [
      { id: 'p-1', relation: 'AYAH', fullName: 'Budi ' + student.fullName.split(' ').pop(), nik: '3204011234560001', phone: '081298765432', education: 'S1', occupation: 'Wiraswasta', monthlyIncome: 5000000, isAlive: true },
      { id: 'p-2', relation: 'IBU', fullName: 'Sri ' + student.fullName.split(' ').pop(), nik: '3204011234560002', phone: '081298765433', education: 'SMA', occupation: 'Ibu Rumah Tangga', monthlyIncome: 0, isAlive: true },
    ],
    economic: {
      hasKip: false, hasKks: false, hasPkh: false, isDtks: false,
      houseOwnership: 'MILIK', houseCondition: 'LAYAK', dependentsCount: 3,
      isOrphan: false, orphanType: 'BUKAN', pipScore: 25, economicCategory: 'MENENGAH',
    },
  };
  return { success: true, data: detail };
}
