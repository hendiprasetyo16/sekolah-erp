// src/modules/students/pages/StudentDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit3,
  User,
  MapPin,
  FileText,
  Users,
  HeartHandshake,
  History,
  Wallet,
  Award,
  BookOpen,
  CalendarCheck,
  KeyRound,
  AlertCircle,
  Loader2,
  Phone,
  Mail,
  School,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import {
  studentService,
  MANAGE_STUDENT_ROLES,
} from '../services/student.service';
import type {
  StudentDetail,
  StudentClassHistoryRecord,
  StudentBillRecord,
  ScholarshipRecord,
  StudentLibraryLoanRecord,
  StudentAttendanceRecord,
  UserStudentLinkRecord,
} from '../types/student.types';

type DetailTab =
  | 'profil'
  | 'ortu'
  | 'ekonomi'
  | 'rombel'
  | 'keuangan'
  | 'perpustakaan'
  | 'absensi';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
};

const formatDateId = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const formatCurrency = (value?: number | string | null): string => {
  if (value === null || value === undefined || value === '') return 'Rp 0';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { school } = useAuthStore();

  const [activeTab, setActiveTab] = useState<DetailTab>('profil');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canManage, setCanManage] = useState<boolean>(false);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [classHistory, setClassHistory] = useState<StudentClassHistoryRecord[]>([]);
  const [bills, setBills] = useState<StudentBillRecord[]>([]);
  const [scholarships, setScholarships] = useState<ScholarshipRecord[]>([]);
  const [libraryLoans, setLibraryLoans] = useState<StudentLibraryLoanRecord[]>([]);
  const [attendances, setAttendances] = useState<StudentAttendanceRecord[]>([]);
  const [linkedUsers, setLinkedUsers] = useState<UserStudentLinkRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!id) {
        setErrorMsg('ID siswa tidak ditemukan.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMsg(null);

        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr || !user) {
          throw new Error('Sesi login tidak valid. Silakan masuk kembali.');
        }

        const [{ data: profile }, { data: allRoles }] = await Promise.all([
          supabase.from('users').select('schoolId, role').eq('id', user.id).single(),
          supabase.rpc('get_user_all_roles'),
        ]);

        const effectiveRoles: string[] = Array.from(
          new Set([
            ...(Array.isArray(allRoles) ? (allRoles as string[]) : []),
            ...(profile?.role ? [profile.role] : []),
          ])
        );

        const allowedManage = effectiveRoles.some((r) =>
          (MANAGE_STUDENT_ROLES as readonly string[]).includes(r)
        );
        const superAdm = effectiveRoles.includes('SUPER_ADMIN');
        const scopedSchoolId = superAdm
          ? undefined
          : school?.id || profile?.schoolId || undefined;

        const res = await studentService.getById(id, scopedSchoolId);
        const st = res.data;

        // Query semua relasi v14 dengan join PostgREST standar (nama tabel langsung)
        const [
          historyRes,
          billsRes,
          scholarshipRes,
          loansRes,
          attendanceRes,
          linksRes,
        ] = await Promise.all([
          supabase
            .from('student_class_history')
            .select(
              'id, createdAt, academic_years(id, name, isActive), classes(id, name, gradeLevel, major, teachers(fullName))'
            )
            .eq('studentId', id)
            .eq('schoolId', st.schoolId)
            .order('createdAt', { ascending: false }),
          supabase
            .from('student_bills')
            .select(
              'id, title, periodMonth, periodYear, totalAmount, paidAmount, dueDate, status'
            )
            .eq('studentId', id)
            .eq('schoolId', st.schoolId)
            .order('dueDate', { ascending: false }),
          supabase
            .from('scholarship_records')
            .select('id, name, type, provider, amount, startDate, endDate, status')
            .eq('studentId', id)
            .eq('schoolId', st.schoolId)
            .order('startDate', { ascending: false }),
          supabase
            .from('library_loans')
            .select(
              'id, quantity, loanDate, dueDate, returnDate, status, fineAmount, library_books(code, title, author)'
            )
            .eq('studentId', id)
            .eq('schoolId', st.schoolId)
            .order('loanDate', { ascending: false }),
          supabase
            .from('attendances')
            .select('id, date, status, notes, recordedBy')
            .eq('studentId', id)
            .eq('schoolId', st.schoolId)
            .order('date', { ascending: false })
            .limit(30),
          supabase
            .from('user_student_links')
            .select(
              'id, relationship, isPrimary, users(id, fullName, email, role, isActive, lastLogin)'
            )
            .eq('studentId', id)
            .eq('schoolId', st.schoolId),
        ]);

        if (!mounted) return;
        setCanManage(allowedManage);
        setStudent(st);
        setClassHistory(
          (historyRes.data as unknown as StudentClassHistoryRecord[]) || []
        );
        setBills((billsRes.data as unknown as StudentBillRecord[]) || []);
        setScholarships(
          (scholarshipRes.data as unknown as ScholarshipRecord[]) || []
        );
        setLibraryLoans(
          (loansRes.data as unknown as StudentLibraryLoanRecord[]) || []
        );
        setAttendances(
          (attendanceRes.data as unknown as StudentAttendanceRecord[]) || []
        );
        setLinkedUsers(
          (linksRes.data as unknown as UserStudentLinkRecord[]) || []
        );
      } catch (err: unknown) {
        if (mounted) {
          setErrorMsg(getErrorMessage(err, 'Gagal memuat detail peserta didik.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDetail();
    return () => {
      mounted = false;
    };
  }, [id, school?.id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="text-sm font-medium">Memuat profil lengkap siswa...</span>
        </div>
      </div>
    );
  }

  if (errorMsg || !student) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-5 w-5" />
            <span>Data Siswa Tidak Dapat Ditampilkan</span>
          </div>
          <p className="mt-2 text-sm">{errorMsg || 'Data tidak ditemukan.'}</p>
          <button
            type="button"
            onClick={() => navigate('/students')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Siswa
          </button>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: DetailTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'profil', label: 'Biodata & Dapodik', icon: <User className="h-4 w-4" /> },
    {
      key: 'ortu',
      label: 'Orang Tua & Akun',
      icon: <Users className="h-4 w-4" />,
      badge: student.parents.length,
    },
    { key: 'ekonomi', label: 'Kesejahteraan & PIP', icon: <HeartHandshake className="h-4 w-4" /> },
    {
      key: 'rombel',
      label: 'Riwayat Kelas',
      icon: <History className="h-4 w-4" />,
      badge: classHistory.length,
    },
    {
      key: 'keuangan',
      label: 'Tagihan & Beasiswa',
      icon: <Wallet className="h-4 w-4" />,
      badge: bills.length + scholarships.length,
    },
    {
      key: 'perpustakaan',
      label: 'Perpustakaan',
      icon: <BookOpen className="h-4 w-4" />,
      badge: libraryLoans.length,
    },
    {
      key: 'absensi',
      label: 'Presensi',
      icon: <CalendarCheck className="h-4 w-4" />,
      badge: attendances.length,
    },
  ];

  const statusBadgeColor: Record<string, string> = {
    AKTIF: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    LULUS: 'bg-sky-100 text-sky-800 border-sky-200',
    MUTASI_KELUAR: 'bg-amber-100 text-amber-800 border-amber-200',
    DO: 'bg-rose-100 text-rose-800 border-rose-200',
    CUTI: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-4 md:p-6"
    >
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/students')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Daftar Siswa
        </button>

        {canManage && (
          <button
            type="button"
            onClick={() => navigate(`/students/${student.id}/edit`)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Edit3 className="h-4 w-4" />
            Edit Data Siswa
          </button>
        )}
      </div>

      {/* Profile Summary Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-emerald-50 text-2xl font-bold text-emerald-700">
            {student.photoUrl ? (
              <img
                src={student.photoUrl}
                alt={student.fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              student.fullName.charAt(0).toUpperCase()
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
              <span
                className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${statusBadgeColor[student.status] || 'bg-slate-100 text-slate-700'
                  }`}
              >
                {student.status.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-700">
                {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <School className="h-4 w-4 text-emerald-600" />
                Kelas: <strong className="text-slate-800">{student.className}</strong>
              </span>
              <span>
                NISN: <strong className="font-mono text-slate-800">{student.nisn}</strong>
              </span>
              <span>
                NIS: <strong className="font-mono text-slate-800">{student.nis || '-'}</strong>
              </span>
              <span>
                NIK: <strong className="font-mono text-slate-800">{student.nik}</strong>
              </span>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              {student.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {student.phone}
                </span>
              )}
              {student.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {student.email}
                </span>
              )}
              <span>
                TTL: {student.birthPlace}, {formatDateId(student.birthDate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFIL & DAPODIK */}
      {activeTab === 'profil' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
              <FileText className="h-4 w-4 text-emerald-600" />
              Identitas Kependudukan & Akademik
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Nama Panggilan</dt>
                <dd className="font-medium text-slate-800">{student.nickname || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">No. Kartu Keluarga (KK)</dt>
                <dd className="font-mono font-medium text-slate-800">{student.noKk || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Agama</dt>
                <dd className="font-medium text-slate-800">{student.religion || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tanggal Masuk</dt>
                <dd className="font-medium text-slate-800">{formatDateId(student.entryDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sekolah Asal</dt>
                <dd className="font-medium text-slate-800">{student.sekolahAsal || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Kebutuhan Khusus</dt>
                <dd className="font-medium text-slate-800">{student.kebutuhanKhusus || 'Tidak Ada'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">No. Akta Lahir</dt>
                <dd className="font-medium text-slate-800">{student.noAktaLahir || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">No. Peserta UN</dt>
                <dd className="font-medium text-slate-800">{student.noPesertaUn || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">No. Seri Ijazah</dt>
                <dd className="font-medium text-slate-800">{student.noIjazah || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">No. Seri SKHUN</dt>
                <dd className="font-medium text-slate-800">{student.skhun || '-'}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                <MapPin className="h-4 w-4 text-emerald-600" />
                Alamat Domisili & Koordinat
              </h2>
              <p className="text-sm font-medium text-slate-800">{student.address}</p>
              <p className="mt-1 text-sm text-slate-600">
                {student.dusun ? `Dusun ${student.dusun}, ` : ''}
                {student.rt || student.rw ? `RT ${student.rt || '-'} / RW ${student.rw || '-'}, ` : ''}
                {student.kelurahan ? `Kel. ${student.kelurahan}, ` : ''}
                {student.kecamatan ? `Kec. ${student.kecamatan}, ` : ''}
                {student.city}, {student.province} {student.postalCode || ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Tinggal: {student.jenisTinggal || '-'}</span>
                <span>Transportasi: {student.alatTransportasi || '-'}</span>
                <span>Jarak: {student.jarakSekolah != null ? `${student.jarakSekolah} km` : '-'}</span>
                {(student.lintang || student.bujur) && (
                  <span>
                    Koordinat: {student.lintang || '-'}, {student.bujur || '-'}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Data Periodik & Rekening PIP
              </h2>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Anak Ke / Saudara</dt>
                  <dd className="font-medium text-slate-800">
                    {student.anakKe ?? '-'} / {student.jmlSaudara ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Tinggi / Berat</dt>
                  <dd className="font-medium text-slate-800">
                    {student.tinggiBadan != null ? `${student.tinggiBadan} cm` : '-'} /{' '}
                    {student.beratBadan != null ? `${student.beratBadan} kg` : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Lingkar Kepala</dt>
                  <dd className="font-medium text-slate-800">
                    {student.lingkarKepala != null ? `${student.lingkarKepala} cm` : '-'}
                  </dd>
                </div>
                <div className="col-span-3 border-t border-slate-100 pt-3">
                  <dt className="text-xs text-slate-500">Rekening Bank Penerima Bantuan</dt>
                  <dd className="font-medium text-slate-800">
                    {student.bank || student.noRekening
                      ? `${student.bank || 'Bank'} - ${student.noRekening || '-'} (a.n. ${student.namaRekening || student.fullName
                      })`
                      : 'Belum terdaftar'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORANG TUA & AKUN TERHUBUNG */}
      {activeTab === 'ortu' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {student.parents.length === 0 ? (
              <div className="col-span-3 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Belum ada data orang tua / wali yang tercatat.
              </div>
            ) : (
              student.parents.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {p.relation}
                    </span>
                    <span className="text-xs text-slate-500">
                      {p.isAlive ? 'Masih Hidup' : 'Meninggal Dunia'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-900">{p.fullName}</h3>
                  <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">NIK:</dt>
                      <dd className="font-mono font-medium">{p.nik || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Tahun Lahir:</dt>
                      <dd>{p.birthYear || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Pendidikan:</dt>
                      <dd>{p.education || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Pekerjaan:</dt>
                      <dd>{p.occupation || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Penghasilan:</dt>
                      <dd className="font-medium text-slate-800">{p.monthlyIncome || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">No. HP:</dt>
                      <dd>{p.phone || '-'}</dd>
                    </div>
                  </dl>
                </div>
              ))
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <KeyRound className="h-4 w-4 text-emerald-600" />
              Akun Portal Orang Tua / Wali Tertaut (`user_student_links`)
            </h2>
            {linkedUsers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Belum ada akun pengguna portal yang ditautkan ke siswa ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {linkedUsers.map((link) => (
                  <div
                    key={link.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">
                        {link.users?.fullName || 'Pengguna'}{' '}
                        <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {link.relationship}
                        </span>
                        {link.isPrimary && (
                          <span className="ml-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Utama
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{link.users?.email || '-'}</div>
                    </div>
                    <span
                      className={`text-xs font-medium ${link.users?.isActive ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                    >
                      {link.users?.isActive ? 'Akun Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: KESEJAHTERAAN & PIP */}
      {activeTab === 'ekonomi' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!student.economic ? (
            <p className="text-sm text-slate-500">
              Data kesejahteraan sosial / ekonomi tidak tersedia atau dibatasi oleh kebijakan akses.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Skor Prioritas PIP
                </div>
                <div className="mt-2 text-4xl font-extrabold text-emerald-700">
                  {student.economic.pipScore ?? 0}
                  <span className="text-base font-normal text-emerald-600"> / 100</span>
                </div>
                <div className="mt-2 inline-block rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  {(student.economic.economicCategory || 'REGULER').replace(/_/g, ' ')}
                </div>
                {student.economic.desil && (
                  <div className="mt-3 text-xs font-medium text-emerald-900">
                    Desil DTKS/DTSEN: <strong>Desil {student.economic.desil}</strong>
                  </div>
                )}
              </div>

              <div className="space-y-3 md:col-span-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Status Kepemilikan Kartu Bantuan & Kondisi Keluarga
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    { label: 'KIP', active: student.economic.hasKip },
                    { label: 'KKS', active: student.economic.hasKks },
                    { label: 'PKH', active: student.economic.hasPkh },
                    { label: 'DTKS', active: student.economic.isDtks },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 p-3"
                    >
                      {item.active ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-300" />
                      )}
                      <span className="font-semibold text-slate-800">{item.label}</span>
                    </div>
                  ))}
                </div>

                <dl className="grid grid-cols-1 gap-3 pt-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Nomor / Nama KIP</dt>
                    <dd className="font-medium text-slate-800">
                      {student.economic.hasKip
                        ? `${student.economic.kipNumber || '-'} (${student.economic.namaKip || '-'})`
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Nomor KKS</dt>
                    <dd className="font-medium text-slate-800">
                      {student.economic.hasKks ? student.economic.kksNumber || '-' : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Layak PIP Dapodik</dt>
                    <dd className="font-medium text-slate-800">
                      {student.economic.layakPip
                        ? `Ya (${student.economic.alasanLayakPip || 'Memenuhi kriteria'})`
                        : 'Tidak'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Status Keluarga</dt>
                    <dd className="font-medium text-slate-800">
                      {(student.economic.orphanType || 'BUKAN').replace(/_/g, ' ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Rumah & Kondisi</dt>
                    <dd className="font-medium text-slate-800">
                      {(student.economic.houseOwnership || '-').replace(/_/g, ' ')} •{' '}
                      {(student.economic.houseCondition || '-').replace(/_/g, ' ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Tanggungan Keluarga</dt>
                    <dd className="font-medium text-slate-800">
                      {student.economic.dependentsCount != null
                        ? `${student.economic.dependentsCount} orang`
                        : '-'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: RIWAYAT KELAS */}
      {activeTab === 'rombel' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {classHistory.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Belum ada catatan riwayat rombongan belajar.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Tahun Ajaran</th>
                  <th className="px-5 py-3">Kelas / Rombel</th>
                  <th className="px-5 py-3">Tingkat</th>
                  <th className="px-5 py-3">Wali Kelas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {h.academic_years?.name || '-'}
                      {h.academic_years?.isActive && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {h.classes?.name || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      Tingkat {h.classes?.gradeLevel ?? '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {h.classes?.teachers?.fullName || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 5: TAGIHAN & BEASISWA */}
      {activeTab === 'keuangan' && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">
              Riwayat Tagihan Siswa
            </div>
            {bills.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Tidak ada data tagihan.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Tagihan</th>
                    <th className="px-5 py-3">Jatuh Tempo</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Terbayar</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-3.5 font-medium text-slate-800">{b.title}</td>
                      <td className="px-5 py-3.5 text-slate-600">{formatDateId(b.dueDate)}</td>
                      <td className="px-5 py-3.5">{formatCurrency(b.totalAmount)}</td>
                      <td className="px-5 py-3.5 text-emerald-700">
                        {formatCurrency(b.paidAmount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">
              <Award className="h-4 w-4 text-emerald-600" />
              Riwayat Penerimaan Beasiswa
            </div>
            {scholarships.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                Belum ada riwayat beasiswa tercatat.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Nama Program</th>
                    <th className="px-5 py-3">Jenis / Penyelenggara</th>
                    <th className="px-5 py-3">Nominal</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scholarships.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3.5 font-medium text-slate-800">{s.name}</td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {s.type} {s.provider ? `• ${s.provider}` : ''}
                      </td>
                      <td className="px-5 py-3.5">{formatCurrency(s.amount)}</td>
                      <td className="px-5 py-3.5">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: PEMINJAMAN PERPUSTAKAAN */}
      {activeTab === 'perpustakaan' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {libraryLoans.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Belum ada riwayat peminjaman buku perpustakaan.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Judul Buku</th>
                  <th className="px-5 py-3">Tgl Pinjam</th>
                  <th className="px-5 py-3">Batas Kembali</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {libraryLoans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {loan.library_books?.title || 'Buku Perpustakaan'}
                      {loan.library_books?.code && (
                        <span className="ml-2 text-xs text-slate-400">
                          [{loan.library_books.code}]
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDateId(loan.loanDate)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDateId(loan.dueDate)}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {loan.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 7: PRESENSI TERAKHIR */}
      {activeTab === 'absensi' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {attendances.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Belum ada catatan presensi harian.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Status Kehadiran</th>
                  <th className="px-5 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendances.map((att) => (
                  <tr key={att.id}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {formatDateId(att.date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {att.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{att.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default StudentDetailPage;