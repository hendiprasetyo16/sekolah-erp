// src/modules/teachers/pages/TeacherDetailPage.tsx
import { useMemo, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Loader2,
  Mail,
  Phone,
  Briefcase,
  Award,
  GraduationCap,
  Building,
  UserCheck,
  UserX,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  teacherService,
  normalizeTeacherSchoolId,
} from '../services/teacher.service';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatDate, formatCurrency } from '@/utils/format';
import { cn } from '@/utils/cn';

function InfoItem({
  label,
  value,
  fallback = '-',
}: {
  label: string;
  value?: ReactNode;
  fallback?: string;
}) {
  return (
    <div className="border-b border-border/40 py-2.5 last:border-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="wrap-break-word text-sm font-medium text-foreground">
        {value || fallback}
      </div>
    </div>
  );
}

export function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const { school, user: currentUser } = useAuthStore();
  const { hasPermission } = usePermission();

  // Mengecek izin update guru secara terpusat (selaras dengan TeacherListPage & RLS database)
  const canManageTeachers = hasPermission('teachers', 'update');
  const activeSchoolId = useMemo(
    () => normalizeTeacherSchoolId(school?.id) ?? normalizeTeacherSchoolId(currentUser?.schoolId),
    [school?.id, currentUser?.schoolId]
  );

  // Kamus label teks
  const dict = {
    title: locale === 'id' ? 'Profil Guru & PTK' : 'Teacher Profile',
    desc:
      locale === 'id'
        ? 'Informasi detail kepegawaian dan biodata Dapodik PTK.'
        : 'Detailed employment and Dapodik PTK information.',
    back: locale === 'id' ? 'Kembali ke Data Guru' : 'Back to Teachers',
    editBtn: locale === 'id' ? 'Edit Data' : 'Edit Data',
    tabPersonal: locale === 'id' ? 'Data Pribadi' : 'Personal Info',
    tabProf: locale === 'id' ? 'Kepegawaian' : 'Employment',
    tabTask: locale === 'id' ? 'Tugas & Lisensi' : 'Duties & Licenses',
    tabFamily: locale === 'id' ? 'Keluarga & Finansial' : 'Family & Financial',
    noData: '-',
    yes: locale === 'id' ? 'Ya' : 'Yes',
    no: locale === 'id' ? 'Tidak' : 'No',
  };

  // Mengambil detail data guru berdasarkan ID dari URL
  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['teacher', id, activeSchoolId],
    queryFn: () => teacherService.getById(id!, activeSchoolId ?? undefined),
    enabled: Boolean(id),
  });

  const teacher = response?.data;

  // Tampilan saat data sedang dimuat
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Tampilan jika data tidak ditemukan atau gagal dimuat
  if (isError || !teacher) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">
          {locale === 'id' ? 'Gagal memuat data guru.' : 'Failed to load teacher data.'}
        </p>
        <Button type="button" variant="outline" onClick={() => navigate('/teachers')}>
          {dict.back}
        </Button>
      </div>
    );
  }

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  // Warna lencana status kepegawaian
  const statusColorMap: Record<string, string> = {
    PNS: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300',
    CPNS: 'bg-blue-100 text-blue-800 border-blue-200 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
    PPPK: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300',
    HONORER: 'bg-orange-100 text-orange-800 border-orange-200 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300',
    GTY: 'bg-purple-100 text-purple-800 border-purple-200 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300',
    GTT: 'bg-gray-100 text-gray-800 border-gray-200 dark:border-border dark:bg-muted dark:text-muted-foreground',
  };

  const normalizedStatus = teacher.status?.toUpperCase();
  const normalizedGender = teacher.gender?.toUpperCase();

  const genderText =
    normalizedGender === 'L'
      ? 'Laki-laki'
      : normalizedGender === 'P'
        ? 'Perempuan'
        : dict.noData;

  const rtRwText =
    teacher.rt || teacher.rw
      ? `RT ${teacher.rt || '-'} / RW ${teacher.rw || '-'}`
      : dict.noData;

  const fullAddressParts = [
    teacher.address,
    teacher.dusun ? `Dusun ${teacher.dusun}` : null,
    teacher.rt || teacher.rw ? `RT ${teacher.rt || '-'}/RW ${teacher.rw || '-'}` : null,
    teacher.kelurahan,
    teacher.kecamatan,
    teacher.city,
    teacher.province,
    teacher.postalCode,
  ].filter(Boolean);

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* ================= BAGIAN 1: HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => navigate('/teachers')}
            aria-label={dict.back}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{dict.title}</h1>
            <p className="text-sm text-muted-foreground">{dict.desc}</p>
          </div>
        </div>

        {canManageTeachers && (
          <Button
            type="button"
            onClick={() => navigate(`/teachers/${id}/edit`)}
            className="w-fit shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            <Edit className="mr-2 h-4 w-4" />
            {dict.editBtn}
          </Button>
        )}
      </div>

      {/* ================= BAGIAN 2: GRID UTAMA ================= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* KARTU PROFIL SINGKAT (KIRI) */}
        <Card className="h-fit border-border shadow-sm">
          <CardContent className="flex flex-col items-center pt-6 text-center">
            <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-3xl font-bold text-white shadow-lg">
              {getInitials(teacher.fullName)}
            </div>
            <h2 className="text-lg font-bold leading-tight text-foreground">{teacher.fullName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{teacher.position || 'Guru'}</p>

            <div className="mt-3 mb-5 flex flex-wrap justify-center gap-2">
              <Badge
                className={cn(
                  normalizedStatus && statusColorMap[normalizedStatus]
                    ? statusColorMap[normalizedStatus]
                    : 'bg-muted'
                )}
                variant="outline"
              >
                {teacher.status || 'Belum Diatur'}
              </Badge>
              {!teacher.isActive && (
                <Badge
                  className="border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
                  variant="outline"
                >
                  {locale === 'id' ? 'Nonaktif' : 'Inactive'}
                </Badge>
              )}
              {teacher.tugasTambahan && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  <Briefcase className="mr-1 h-3 w-3 shrink-0" />
                  <span className="max-w-44 truncate">{teacher.tugasTambahan}</span>
                </Badge>
              )}
            </div>

            <div className="w-full space-y-2.5 border-t border-border/50 pt-5 text-sm">
              {teacher.phone && (
                <div className="flex items-center justify-center gap-2.5 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">{teacher.phone}</span>
                </div>
              )}
              {teacher.email && (
                <div className="flex items-center justify-center gap-2.5 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate" title={teacher.email}>
                    {teacher.email}
                  </span>
                </div>
              )}
              {teacher.isCertified && (
                <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 py-1.5 px-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Award className="h-4 w-4 shrink-0" />
                  <span>{locale === 'id' ? 'Guru Tersertifikasi' : 'Certified Teacher'}</span>
                </div>
              )}
              {teacher.userId ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 py-1.5 px-2 text-xs font-medium text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{locale === 'id' ? 'Terhubung Akun Login' : 'Login Account Linked'}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 py-1.5 px-2 text-xs font-medium text-muted-foreground">
                  <UserX className="h-3.5 w-3.5 shrink-0" />
                  <span>{locale === 'id' ? 'Belum Punya Akun Login' : 'No Login Account'}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ================= BAGIAN 3: KONTEN TAB DETAIL (KANAN) ================= */}
        <Tabs defaultValue="personal" className="w-full min-w-0">
          <div className="mb-4 w-full overflow-x-auto pb-1">
            <TabsList className="inline-flex h-auto w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted/60 p-1">
              <TabsTrigger
                value="personal"
                className="whitespace-nowrap rounded-md px-3.5 py-2 text-sm text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
              >
                <GraduationCap className="mr-2 h-4 w-4 shrink-0" />
                {dict.tabPersonal}
              </TabsTrigger>

              <TabsTrigger
                value="professional"
                className="whitespace-nowrap rounded-md px-3.5 py-2 text-sm text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
              >
                <Building className="mr-2 h-4 w-4 shrink-0" />
                {dict.tabProf}
              </TabsTrigger>

              <TabsTrigger
                value="tasks"
                className="whitespace-nowrap rounded-md px-3.5 py-2 text-sm text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
              >
                <Award className="mr-2 h-4 w-4 shrink-0" />
                {dict.tabTask}
              </TabsTrigger>

              <TabsTrigger
                value="family"
                className="whitespace-nowrap rounded-md px-3.5 py-2 text-sm text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
              >
                <Briefcase className="mr-2 h-4 w-4 shrink-0" />
                {dict.tabFamily}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: Data Pribadi & Alamat Dapodik */}
          <TabsContent value="personal" className="m-0 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Informasi Dasar (Dapodik)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem
                  label={locale === 'id' ? 'Nama Lengkap' : 'Full Name'}
                  value={teacher.fullName}
                />
                <InfoItem
                  label={locale === 'id' ? 'Jenis Kelamin' : 'Gender'}
                  value={genderText}
                />
                <InfoItem label="NIK" value={teacher.nik} />
                <InfoItem label="No. KK" value={teacher.noKk} />
                <InfoItem
                  label={locale === 'id' ? 'Tempat, Tanggal Lahir' : 'Birth Info'}
                  value={`${teacher.birthPlace || dict.noData}, ${teacher.birthDate ? formatDate(teacher.birthDate) : dict.noData
                    }`}
                />
                <InfoItem
                  label={locale === 'id' ? 'Agama / Kepercayaan' : 'Religion'}
                  value={teacher.religion}
                />
                <InfoItem
                  label={locale === 'id' ? 'Kewarganegaraan' : 'Nationality'}
                  value={teacher.kewarganegaraan}
                />
                <InfoItem
                  label={locale === 'id' ? 'Nama Ibu Kandung' : 'Mother Name'}
                  value={teacher.namaIbuKandung}
                />
                <InfoItem label="No. HP / WhatsApp" value={teacher.phone} />
                <InfoItem label="Telepon Rumah" value={teacher.telepon} />
                <div className="sm:col-span-2">
                  <InfoItem
                    label={locale === 'id' ? 'Alamat Lengkap' : 'Address'}
                    value={fullAddressParts.length > 0 ? fullAddressParts.join(', ') : dict.noData}
                  />
                </div>
                <InfoItem label="Dusun" value={teacher.dusun} />
                <InfoItem label="RT / RW" value={rtRwText} />
                <InfoItem label="Desa / Kelurahan" value={teacher.kelurahan} />
                <InfoItem label="Kecamatan" value={teacher.kecamatan} />
                <InfoItem label="Kabupaten / Kota" value={teacher.city} />
                <InfoItem
                  label="Provinsi / Kode Pos"
                  value={`${teacher.province || '-'} (${teacher.postalCode || '-'})`}
                />
                <InfoItem label="Lintang (Latitude)" value={teacher.lintang} />
                <InfoItem label="Bujur (Longitude)" value={teacher.bujur} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Kepegawaian */}
          <TabsContent value="professional" className="m-0 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Status & SK Pengangkatan</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Status Kepegawaian" value={teacher.status} />
                <InfoItem label="Jenis PTK / Jabatan" value={teacher.position} />
                <InfoItem label="NIP" value={teacher.nip} />
                <InfoItem label="NUPTK" value={teacher.nuptk} />
                <InfoItem label="SK CPNS" value={teacher.skCpns} />
                <InfoItem
                  label="Tanggal CPNS"
                  value={teacher.tanggalCpns ? formatDate(teacher.tanggalCpns) : dict.noData}
                />
                <InfoItem label="SK Pengangkatan" value={teacher.skPengangkatan} />
                <InfoItem
                  label="TMT Pengangkatan"
                  value={
                    teacher.tmtPengangkatan ? formatDate(teacher.tmtPengangkatan) : dict.noData
                  }
                />
                <InfoItem label="Lembaga Pengangkatan" value={teacher.lembagaPengangkatan} />
                <InfoItem label="Pangkat / Golongan" value={teacher.pangkatGolongan} />
                <InfoItem label="Sumber Gaji" value={teacher.sumberGaji} />
                <InfoItem
                  label="TMT PNS"
                  value={teacher.tmtPns ? formatDate(teacher.tmtPns) : dict.noData}
                />
                <InfoItem label="Karpeg" value={teacher.karpeg} />
                <InfoItem
                  label="Tanggal Bergabung"
                  value={teacher.joinDate ? formatDate(teacher.joinDate) : dict.noData}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Tugas & Lisensi */}
          <TabsContent value="tasks" className="m-0 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Akademik, Tugas Tambahan & Kompetensi</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Tugas Tambahan Saat Ini
                  </div>
                  <div className="text-sm font-medium text-amber-950 dark:text-amber-100">
                    {teacher.tugasTambahan || 'Tidak ada tugas tambahan'}
                  </div>
                </div>

                <InfoItem
                  label="Pendidikan Terakhir"
                  value={`${teacher.education || dict.noData} - ${teacher.major || dict.noData}`}
                />
                <InfoItem label="Universitas / Institusi" value={teacher.university} />
                <InfoItem
                  label="Sertifikasi Guru"
                  value={
                    teacher.isCertified
                      ? `Ya (No: ${teacher.certificationNumber || '-'})`
                      : dict.no
                  }
                />
                <InfoItem
                  label="Maksimal Jam Mengajar"
                  value={`${teacher.maxHoursPerWeek || 24} Jam / Minggu`}
                />
                <InfoItem label="NUKS" value={teacher.nuks} />

                <div className="mt-4 grid gap-4 rounded-lg border border-border/50 bg-muted/30 p-4 sm:col-span-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Lisensi Kepala Sekolah</span>
                    <Badge variant={teacher.sudahLisensiKepalaSekolah ? 'default' : 'secondary'}>
                      {teacher.sudahLisensiKepalaSekolah ? dict.yes : dict.no}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Diklat Kepengawasan</span>
                    <Badge variant={teacher.pernahDiklatKepengawasan ? 'default' : 'secondary'}>
                      {teacher.pernahDiklatKepengawasan ? dict.yes : dict.no}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Keahlian Braille</span>
                    <Badge variant={teacher.keahlianBraille ? 'default' : 'secondary'}>
                      {teacher.keahlianBraille ? dict.yes : dict.no}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Keahlian Bahasa Isyarat</span>
                    <Badge variant={teacher.keahlianBahasaIsyarat ? 'default' : 'secondary'}>
                      {teacher.keahlianBahasaIsyarat ? dict.yes : dict.no}
                    </Badge>
                  </div>
                </div>

                <div className="mt-5 border-t border-border/50 pt-5 sm:col-span-2">
                  <div className="mb-3 text-sm font-medium text-muted-foreground">
                    Mata Pelajaran yang Diampu
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {teacher.subjects ? (
                      String(teacher.subjects)
                        .split(',')
                        .map((sub, i) => (
                          <Badge key={i} variant="outline" className="bg-background shadow-sm">
                            {sub.trim()}
                          </Badge>
                        ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{dict.noData}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Keluarga & Finansial */}
          <TabsContent value="family" className="m-0 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Keluarga & Pajak</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Status Perkawinan" value={teacher.statusPerkawinan} />
                <InfoItem label="Nama Suami/Istri" value={teacher.namaSuamiIstri} />
                <InfoItem label="NIP Suami/Istri" value={teacher.nipSuamiIstri} />
                <InfoItem label="Pekerjaan Suami/Istri" value={teacher.pekerjaanSuamiIstri} />
                <InfoItem label="Karis / Karsu" value={teacher.karisKarsu} />
                <div className="col-span-1 hidden sm:block" />

                <InfoItem label="NPWP" value={teacher.npwp} />
                <InfoItem label="Nama Wajib Pajak" value={teacher.namaWajibPajak} />
                <InfoItem
                  label="Gaji Pokok"
                  value={teacher.baseSalary ? formatCurrency(teacher.baseSalary) : dict.noData}
                />
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Informasi Rekening Bank</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Nama Bank" value={teacher.bank} />
                <InfoItem label="Nomor Rekening" value={teacher.nomorRekeningBank} />
                <InfoItem label="Rekening Atas Nama" value={teacher.rekeningAtasNama} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default TeacherDetailPage;