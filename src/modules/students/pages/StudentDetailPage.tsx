import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Edit, User, MapPin, Phone,
  GraduationCap, Building2, UserCircle2,
  Briefcase, HeartPulse, Home, CreditCard, Wallet
} from 'lucide-react';
import { studentService } from '../services/student.service';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 1. IMPORT USEAUTHSTORE UNTUK MENGAMBIL ROLE PENGGUNA
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { StudentParent, StudentEconomic } from '../types/student.types';

// Definisi Strict Type lokal untuk menangkap field tambahan Dapodik
interface ExtendedStudentData {
  id: string;
  nis: string;
  nisn: string;
  nik: string;
  noKk: string;
  fullName: string;
  nickname?: string;
  gender: 'L' | 'P';
  birthPlace: string;
  birthDate: string;
  religion: string;
  address: string;
  dusun?: string; // BARU
  rt?: string;
  rw?: string;
  kelurahan?: string;
  kecamatan?: string;
  city: string;
  province: string;
  postalCode?: string;
  telepon?: string; // BARU
  phone?: string;
  email?: string;
  status: string;
  entryDate: string;
  className: string;
  gradeLevel: number;
  parents?: (StudentParent & { birthYear?: string })[]; // BARU: Tahun Lahir
  economic?: StudentEconomic & { namaKip?: string; layakPip?: boolean; alasanLayakPip?: string; desil?: number; hasKks?: boolean; kksNumber?: string }; // BARU: KKS
  noAktaLahir?: string;
  anakKe?: number;
  jmlSaudara?: number;
  beratBadan?: number;
  tinggiBadan?: number;
  lingkarKepala?: number;
  jarakSekolah?: number;
  jenisTinggal?: string;
  alatTransportasi?: string;
  sekolahAsal?: string;
  bank?: string;
  noRekening?: string;
  namaRekening?: string;
  // FIX: Menambahkan properti yang sebelumnya error di TypeScript
  kebutuhanKhusus?: string;
  lintang?: string;
  bujur?: string;
  skhun?: string;
  noIjazah?: string;
  noPesertaUn?: string;
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = useTranslation();

  // 2. AMBIL DATA USER DAN BUAT LOGIKA IZIN (RBAC)
  const { user } = useAuthStore();
  const allowedRolesToManage = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'KEPALA_SEKOLAH'];
  const canManageData = user?.role ? allowedRolesToManage.includes(user.role) : false;

  const { data: studentResponse, isLoading, isError } = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.getById(id!),
  });

  const student = studentResponse?.data as unknown as ExtendedStudentData;

  const parentsList = student?.parents || (student as any)?.student_parents || [];
  const rawEco = student?.economic || (student as any)?.student_economics;
  const ecoData = (Array.isArray(rawEco) ? rawEco[0] : rawEco) || {};

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        {locale === 'id' ? 'Memuat data...' : 'Loading data...'}
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-destructive font-medium">
        {locale === 'id' ? 'Gagal memuat data siswa' : 'Failed to load student data'}
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AKTIF': return 'success';
      case 'MUTASI_KELUAR': return 'warning';
      case 'LULUS': return 'default';
      case 'DO': return 'destructive';
      case 'CUTI': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    if (locale === 'id') return status;
    switch (status) {
      case 'AKTIF': return 'ACTIVE';
      case 'MUTASI_KELUAR': return 'TRANSFERRED';
      case 'LULUS': return 'GRADUATED';
      case 'DO': return 'DROPPED OUT';
      case 'CUTI': return 'ON LEAVE';
      default: return status;
    }
  };

  const formatCurrency = (amount?: number | string) => {
    if (!amount) return '-';
    const num = Number(amount);
    if (isNaN(num)) {
      return String(amount);
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatBool = (val?: boolean) => {
    if (val === undefined || val === null) return '-';
    return val ? (locale === 'id' ? 'Ya' : 'Yes') : (locale === 'id' ? 'Tidak' : 'No');
  };

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => navigate('/students')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {locale === 'id' ? 'Detail Siswa' : 'Student Detail'}
            </h1>
          </div>
        </div>

        {/* 3. SEMBUNYIKAN TOMBOL EDIT DARI GURU/SISWA/ORTU */}
        {canManageData && (
          <Button asChild className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
            <Link to={`/students/${id}/edit`} className="flex justify-center items-center">
              <Edit className="mr-2 h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{locale === 'id' ? 'Edit Data' : 'Edit Data'}</span>
            </Link>
          </Button>
        )}
      </div>

      {/* Profile Overview Card */}
      <Card className="border-border shadow-sm bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
            <div className="h-24 w-24 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
              <UserCircle2 className="h-12 w-12" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground truncate">{student.fullName}</h2>
                <Badge variant={getStatusColor(student.status) as any} className="shrink-0">
                  {getStatusLabel(student.status)}
                </Badge>
              </div>

              <div className="mt-2 text-sm font-medium bg-muted/40 inline-block px-3 py-1.5 rounded-md border border-border">
                NIS / NIPD: <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1 mr-4">{student.nis || '-'}</span>
                NISN: <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">{student.nisn}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 ml-1 flex flex-wrap items-center gap-2">
                <span>NIK: {student.nik}</span>
                <span className="hidden sm:inline">•</span>
                <span>{locale === 'id' ? 'Panggilan:' : 'Nickname:'} {student.nickname || '-'}</span>
              </p>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Building2 className="mr-2 h-4 w-4 shrink-0" />
                  {locale === 'id' ? 'Kelas: ' : 'Class: '} {student.className}
                </div>
                <div className="flex items-center">
                  <MapPin className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{student.city}, {student.province}</span>
                </div>
                <div className="flex items-center">
                  <Phone className="mr-2 h-4 w-4 shrink-0" />
                  {student.phone || student.telepon || '-'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================= RIGHT CONTENT (Tabs Detail) ================= */}
      <Tabs defaultValue="pribadi" className="w-full min-w-0">

        {/* Menu Tabs: Scrollable mendatar di HP, teks tidak patah (whitespace-nowrap) */}
        <div className="w-full overflow-x-auto pb-1 mb-4">
          <TabsList className="h-auto gap-1 bg-muted/50 p-1 flex w-max min-w-full sm:min-w-0">
            <TabsTrigger
              value="pribadi"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <User className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Pribadi' : 'Personal'}
            </TabsTrigger>

            <TabsTrigger
              value="akademik"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <GraduationCap className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Akademik' : 'Academic'}
            </TabsTrigger>

            <TabsTrigger
              value="orangtua"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <Briefcase className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Orang Tua' : 'Parents'}
            </TabsTrigger>

            <TabsTrigger
              value="ekonomi"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <Wallet className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Kesejahteraan' : 'Welfare'}
            </TabsTrigger>

            <TabsTrigger
              value="dapodik"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <HeartPulse className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Dapodik' : 'Dapodik'}
            </TabsTrigger>

            <TabsTrigger
              value="dokumen"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <CreditCard className="w-4 h-4 mr-2 shrink-0" />
              {locale === 'id' ? 'Dokumen' : 'Documents'}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: PRIBADI */}
        <TabsContent value="pribadi" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <User className="mr-2 h-5 w-5 shrink-0" />
                  {locale === 'id' ? 'Identitas Diri' : 'Personal Identity'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: locale === 'id' ? 'Nama Lengkap' : 'Full Name', value: student.fullName },
                    { label: locale === 'id' ? 'Nama Panggilan' : 'Nickname', value: student.nickname || '-' },
                    { label: 'NIS / NISN', value: `${student.nis || '-'} / ${student.nisn}` },
                    { label: 'NIK', value: student.nik },
                    { label: locale === 'id' ? 'No. Kartu Keluarga' : 'Family Card No.', value: student.noKk || '-' },
                    { label: locale === 'id' ? 'Tempat, Tgl Lahir' : 'Place, Date of Birth', value: `${student.birthPlace}, ${formatDate(student.birthDate)}` },
                    { label: locale === 'id' ? 'Jenis Kelamin' : 'Gender', value: student.gender === 'L' ? (locale === 'id' ? 'Laki-laki' : 'Male') : (locale === 'id' ? 'Perempuan' : 'Female') },
                    { label: locale === 'id' ? 'Agama' : 'Religion', value: student.religion, capitalize: true },
                  ].map((item, idx) => (
                    <div key={idx} className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium">{item.label}</dt>
                      <dd className={`col-span-2 text-foreground font-medium wrap-break-word ${item.capitalize ? 'capitalize' : ''}`}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <MapPin className="mr-2 h-5 w-5 shrink-0" />
                  {locale === 'id' ? 'Alamat & Kontak' : 'Address & Contact'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: locale === 'id' ? 'Alamat Jalan' : 'Street Address', value: student.address },
                    { label: 'RT / RW / Dusun', value: `${student.rt || '-'} / ${student.rw || '-'} / ${student.dusun || '-'}` },
                    { label: locale === 'id' ? 'Kelurahan' : 'Village', value: student.kelurahan || '-' },
                    { label: locale === 'id' ? 'Kecamatan' : 'District', value: student.kecamatan || '-' },
                    { label: locale === 'id' ? 'Kabupaten/Kota' : 'City', value: student.city },
                    { label: locale === 'id' ? 'Provinsi' : 'Province', value: student.province },
                    { label: locale === 'id' ? 'Kode Pos' : 'Postal Code', value: student.postalCode || '-' },
                    { label: locale === 'id' ? 'Telepon Rumah' : 'Home Phone', value: student.telepon || '-' },
                    { label: locale === 'id' ? 'No. HP' : 'Mobile Phone', value: student.phone || '-' },
                    { label: 'Email', value: student.email || '-' },
                  ].map((item, idx) => (
                    <div key={idx} className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium">{item.label}</dt>
                      <dd className="col-span-2 text-foreground font-medium wrap-break-word">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: AKADEMIK */}
        <TabsContent value="akademik" className="m-0">
          <Card className="shadow-sm border-border max-w-3xl">
            <CardHeader className="bg-muted/20 border-b border-border pb-4">
              <CardTitle className="text-lg flex items-center text-primary">
                <GraduationCap className="mr-2 h-5 w-5 shrink-0" />
                {locale === 'id' ? 'Informasi Akademik' : 'Academic Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-border">
                <div className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                  <dt className="text-muted-foreground font-medium">Status</dt>
                  <dd className="col-span-2"><Badge variant={getStatusColor(student.status) as any}>{getStatusLabel(student.status)}</Badge></dd>
                </div>
                {[
                  { label: locale === 'id' ? 'Kelas Saat Ini' : 'Current Class', value: `${student.className} (Tingkat ${student.gradeLevel})` },
                  { label: locale === 'id' ? 'Tanggal Masuk' : 'Entry Date', value: formatDate(student.entryDate) },
                  { label: locale === 'id' ? 'Sekolah Asal' : 'Previous School', value: student.sekolahAsal || '-' },
                ].map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{item.label}</dt>
                    <dd className="col-span-2 text-foreground font-medium wrap-break-word">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ORANG TUA */}
        <TabsContent value="orangtua" className="m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['AYAH', 'IBU', 'WALI'].map((relation) => {
              const parent = parentsList.find((p: any) => p.relation === relation);
              if (relation === 'WALI' && !parent) return null;

              const isFather = relation === 'AYAH';
              const titleID = relation === 'AYAH' ? 'Data Ayah' : (relation === 'IBU' ? 'Data Ibu' : 'Data Wali');
              const titleEN = relation === 'AYAH' ? 'Father Data' : (relation === 'IBU' ? 'Mother Data' : 'Guardian Data');

              return (
                <Card key={relation} className="shadow-sm border-border">
                  <CardHeader className="bg-muted/20 border-b border-border pb-4">
                    <CardTitle className="text-lg flex items-center text-primary">
                      <Briefcase className={`mr-2 h-5 w-5 shrink-0 ${isFather ? 'text-blue-500' : (relation === 'IBU' ? 'text-pink-500' : 'text-amber-500')}`} />
                      {locale === 'id' ? titleID : titleEN}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <dl className="divide-y divide-border">
                      {[
                        { label: locale === 'id' ? 'Nama Lengkap' : 'Full Name', value: parent?.fullName || '-' },
                        { label: locale === 'id' ? 'Tahun Lahir' : 'Birth Year', value: parent?.birthYear || '-' },
                        { label: 'NIK', value: parent?.nik || '-' },
                        { label: locale === 'id' ? 'Pekerjaan' : 'Occupation', value: parent?.occupation || '-' },
                        { label: locale === 'id' ? 'No. Handphone' : 'Phone', value: parent?.phone || '-' },
                        { label: 'Email', value: parent?.email || '-' },
                        { label: locale === 'id' ? 'Penghasilan' : 'Income', value: formatCurrency(parent?.monthlyIncome) },
                      ].map((item, idx) => (
                        <div key={idx} className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                          <dt className="text-muted-foreground font-medium shrink-0 mr-4">{item.label}</dt>
                          <dd className="text-foreground font-medium text-right wrap-break-word">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              );
            })}

            {(!parentsList || parentsList.length === 0) && (
              <div className="col-span-full p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                {locale === 'id' ? 'Data orang tua/wali belum dilengkapi.' : 'Parent/guardian data has not been provided yet.'}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: KESEJAHTERAAN (EKONOMI) */}
        <TabsContent value="ekonomi" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <Wallet className="mr-2 h-5 w-5 shrink-0 text-blue-500" />
                  {locale === 'id' ? 'Program Indonesia Pintar (PIP/KIP)' : 'Smart Indonesia Program (PIP/KIP)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Penerima KIP' : 'Has KIP'}</dt>
                    <dd className="text-foreground font-bold">{formatBool(ecoData?.hasKip)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Nomor KIP' : 'KIP Number'}</dt>
                    <dd className="text-foreground font-medium wrap-break-word">{ecoData?.kipNumber || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Nama di KIP' : 'Name on KIP'}</dt>
                    <dd className="text-foreground font-medium wrap-break-word">{ecoData?.namaKip || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Usulan Layak PIP' : 'Eligible for PIP'}</dt>
                    <dd className="text-foreground font-bold">{formatBool(ecoData?.layakPip)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Desil DTKS / P3KE' : 'DTKS / P3KE Decile'}</dt>
                    <dd className="text-foreground font-medium">
                      {ecoData?.desil ? (
                        ecoData.desil <= 4 ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                            Desil {ecoData.desil} ({locale === 'id' ? 'Prioritas PIP' : 'PIP Priority'})
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Desil {ecoData.desil}
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium mb-1">{locale === 'id' ? 'Alasan Layak PIP' : 'Reason for PIP'}</dt>
                    <dd className="text-foreground font-medium">{ecoData?.alasanLayakPip || '-'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <HeartPulse className="mr-2 h-5 w-5 shrink-0 text-indigo-500" />
                  {locale === 'id' ? 'Bantuan Sosial Lainnya' : 'Other Social Assistance'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Penerima PKH' : 'Has PKH'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.hasPkh ? <Badge variant="default">{locale === 'id' ? 'Ya' : 'Yes'}</Badge> : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Penerima KKS / KPS' : 'Has KKS / KPS'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.hasKks ? <Badge variant="default">{ecoData.kksNumber || 'Ya'}</Badge> : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{locale === 'id' ? 'Terdaftar DTKS' : 'Registered in DTKS'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.isDtks ? <Badge variant="default">{locale === 'id' ? 'Ya' : 'Yes'}</Badge> : '-'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 5: DAPODIK / FISIK */}
        <TabsContent value="dapodik" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-base flex items-center text-primary">
                  <HeartPulse className="mr-2 h-4 w-4 shrink-0" />
                  {locale === 'id' ? 'Kesehatan & Fisik' : 'Physical Health'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: locale === 'id' ? 'Berat Badan' : 'Weight', value: student.beratBadan ? `${student.beratBadan} kg` : '-' },
                    { label: locale === 'id' ? 'Tinggi Badan' : 'Height', value: student.tinggiBadan ? `${student.tinggiBadan} cm` : '-' },
                    { label: locale === 'id' ? 'Lingkar Kepala' : 'Head Circum.', value: student.lingkarKepala ? `${student.lingkarKepala} cm` : '-' },
                    { label: locale === 'id' ? 'Kebutuhan Khusus' : 'Special Needs', value: student.kebutuhanKhusus || '-' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between px-4 py-4 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium shrink-0 mr-4">{item.label}</dt>
                      <dd className="text-foreground font-medium text-right wrap-break-word">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-base flex items-center text-primary">
                  <Home className="mr-2 h-4 w-4 shrink-0" />
                  {locale === 'id' ? 'Tempat Tinggal' : 'Residence'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: locale === 'id' ? 'Anak Ke' : 'Birth Order', value: student.anakKe || '-' },
                    { label: locale === 'id' ? 'Jml. Saudara' : 'Siblings', value: student.jmlSaudara || '-' },
                    { label: locale === 'id' ? 'Jarak Sekolah' : 'Distance', value: student.jarakSekolah ? `${student.jarakSekolah} km` : '-' },
                    { label: locale === 'id' ? 'Transportasi' : 'Transport', value: student.alatTransportasi || '-' },
                    { label: locale === 'id' ? 'Jenis Tinggal' : 'Residence Type', value: student.jenisTinggal || '-' },
                    { label: locale === 'id' ? 'Koordinat (Lat, Long)' : 'Coordinates', value: (student.lintang || student.bujur) ? `${student.lintang || '-'}, ${student.bujur || '-'}` : '-' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between px-4 py-4 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium shrink-0 mr-4">{item.label}</dt>
                      <dd className="text-foreground font-medium text-right wrap-break-word">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-base flex items-center text-primary">
                  <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                  {locale === 'id' ? 'Registrasi & Dokumen' : 'Registration & Docs'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: locale === 'id' ? 'No. Akta Lahir' : 'Birth Cert No.', value: student.noAktaLahir || '-' },
                    { label: 'SKHUN', value: student.skhun || '-' },
                    { label: locale === 'id' ? 'No. Ijazah' : 'Certificate No.', value: student.noIjazah || '-' },
                    { label: locale === 'id' ? 'No. Peserta UN' : 'UN No.', value: student.noPesertaUn || '-' },
                    { label: 'Bank', value: student.bank || '-' },
                    { label: locale === 'id' ? 'No. Rekening' : 'Account No.', value: student.noRekening || '-' },
                    { label: locale === 'id' ? 'Atas Nama' : 'Account Name', value: student.namaRekening || '-' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col px-4 py-3 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium mb-1">{item.label}</dt>
                      <dd className="text-foreground font-semibold wrap-break-word">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 6: DOKUMEN (Placeholder) */}
        <TabsContent value="dokumen" className="m-0">
          <Card className="shadow-sm border-border">
            <CardContent className="p-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed mt-6">
              {locale === 'id'
                ? 'Modul arsip & unggah dokumen digital (Ijazah, KK, Akta Kelahiran) sedang dalam tahap pengembangan.'
                : 'Digital document upload module (Certificates, Family Card, Birth Certificate) is under development.'}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}