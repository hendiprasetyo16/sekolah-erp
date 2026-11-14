import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Edit, User, MapPin, Phone,
  GraduationCap, Building2, UserCircle2,
  Briefcase, HeartPulse, Home, CreditCard, Wallet, Loader2, RefreshCw
} from 'lucide-react';
import { studentService } from '../services/student.service';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/modules/auth/store/auth.store';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

const ALLOWED_MANAGE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU', 'KEPALA_SEKOLAH'];

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const isId = locale === 'id';

  const [photoError, setPhotoError] = useState(false);

  const { user, school } = useAuthStore();
  const canManageData = user?.role ? ALLOWED_MANAGE_ROLES.includes(user.role) : false;

  const { data: studentResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', id, school?.id],
    queryFn: () => studentService.getById(id!, school?.id),
    enabled: !!id,
  });

  const student = studentResponse?.data;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p>{isId ? 'Memuat data siswa...' : 'Loading student data...'}</p>
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-destructive font-medium">
          {isId ? 'Gagal memuat data siswa.' : 'Failed to load student data.'}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/students')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isId ? 'Kembali' : 'Back'}
          </Button>
          <Button onClick={() => refetch()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <RefreshCw className="mr-2 h-4 w-4" />
            {isId ? 'Coba Lagi' : 'Retry'}
          </Button>
        </div>
      </div>
    );
  }

  const parentsList = student.parents || [];
  const ecoData = student.economic;
  const formattedNis = student.nis && student.nis !== '-' ? student.nis : '-';

  const getStatusColor = (status: string): BadgeVariant => {
    switch (status) {
      case 'AKTIF':
        return 'success';
      case 'MUTASI_KELUAR':
        return 'warning';
      case 'LULUS':
        return 'default';
      case 'DO':
        return 'destructive';
      case 'CUTI':
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: string): string => {
    if (isId) {
      return status === 'MUTASI_KELUAR' ? 'MUTASI KELUAR' : status;
    }
    switch (status) {
      case 'AKTIF':
        return 'ACTIVE';
      case 'MUTASI_KELUAR':
        return 'TRANSFERRED';
      case 'LULUS':
        return 'GRADUATED';
      case 'DO':
        return 'DROPPED OUT';
      case 'CUTI':
        return 'ON LEAVE';
      default:
        return status;
    }
  };

  const formatCurrency = (amount?: number | string | null): string => {
    if (amount === undefined || amount === null || String(amount).trim() === '') return '-';
    const cleaned = String(amount).replace(/â€“/g, '-').trim();
    const num = Number(cleaned);
    if (Number.isNaN(num)) {
      return cleaned;
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatBool = (val?: boolean | null): string => {
    if (val === undefined || val === null) return '-';
    return val ? (isId ? 'Ya' : 'Yes') : isId ? 'Tidak' : 'No';
  };

  const getOrphanLabel = (): string => {
    if (!ecoData) return '-';
    if (ecoData.orphanType && ecoData.orphanType !== 'BUKAN') {
      const mapID: Record<string, string> = {
        YATIM: 'Yatim',
        PIATU: 'Piatu',
        YATIM_PIATU: 'Yatim Piatu',
      };
      const mapEN: Record<string, string> = {
        YATIM: 'Paternal Orphan (Yatim)',
        PIATU: 'Maternal Orphan (Piatu)',
        YATIM_PIATU: 'Double Orphan (Yatim Piatu)',
      };
      return isId
        ? mapID[ecoData.orphanType] || ecoData.orphanType
        : mapEN[ecoData.orphanType] || ecoData.orphanType;
    }
    return ecoData.isOrphan
      ? isId ? 'Yatim / Piatu' : 'Orphan'
      : isId ? 'Tidak (Lengkap)' : 'No';
  };

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => navigate('/students')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">
            {isId ? 'Detail Siswa' : 'Student Detail'}
          </h1>
        </div>

        {canManageData && (
          <Button
            asChild
            className="w-fit shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Link to={`/students/${id}/edit`} className="inline-flex items-center justify-center gap-2">
              <Edit className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">
                {isId ? 'Edit Data' : 'Edit Data'}
              </span>
            </Link>
          </Button>
        )}
      </div>

      {/* Profile Overview Card */}
      <Card className="border-border shadow-sm bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
            {student.photoUrl && !photoError ? (
              <img
                src={student.photoUrl}
                alt={student.fullName}
                onError={() => setPhotoError(true)}
                className="h-24 w-24 rounded-full object-cover border border-emerald-200 dark:border-emerald-800 shrink-0"
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                <UserCircle2 className="h-12 w-12" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground truncate">{student.fullName}</h2>
                <Badge variant={getStatusColor(student.status)} className="shrink-0">
                  {getStatusLabel(student.status)}
                </Badge>
              </div>

              <div className="mt-2 text-sm font-medium bg-muted/40 inline-block px-3 py-1.5 rounded-md border border-border">
                NIS / NIPD:{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1 mr-4">
                  {formattedNis}
                </span>
                NISN:{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">
                  {student.nisn}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 ml-1 flex flex-wrap items-center gap-2">
                <span>NIK: {student.nik}</span>
                <span className="hidden sm:inline">•</span>
                <span>
                  {isId ? 'Panggilan:' : 'Nickname:'} {student.nickname || '-'}
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Building2 className="mr-2 h-4 w-4 shrink-0" />
                  {isId ? 'Kelas: ' : 'Class: '} {student.className || '-'}
                </div>
                <div className="flex items-center">
                  <MapPin className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {student.city || '-'}, {student.province || '-'}
                  </span>
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

      {/* ================= TABS DETAIL ================= */}
      <Tabs defaultValue="pribadi" className="w-full min-w-0">
        <div className="w-full overflow-x-auto pb-1 mb-4">
          <TabsList className="h-auto gap-1 bg-muted/50 p-1 flex w-max min-w-full sm:min-w-0">
            <TabsTrigger
              value="pribadi"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <User className="w-4 h-4 mr-2 shrink-0" />
              {isId ? 'Pribadi' : 'Personal'}
            </TabsTrigger>

            <TabsTrigger
              value="akademik"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <GraduationCap className="w-4 h-4 mr-2 shrink-0" />
              {isId ? 'Akademik' : 'Academic'}
            </TabsTrigger>

            <TabsTrigger
              value="orangtua"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <Briefcase className="w-4 h-4 mr-2 shrink-0" />
              {isId ? 'Orang Tua' : 'Parents'}
            </TabsTrigger>

            <TabsTrigger
              value="ekonomi"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <Wallet className="w-4 h-4 mr-2 shrink-0" />
              {isId ? 'Kesejahteraan' : 'Welfare'}
            </TabsTrigger>

            <TabsTrigger
              value="dapodik"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <HeartPulse className="w-4 h-4 mr-2 shrink-0" />
              Dapodik
            </TabsTrigger>

            <TabsTrigger
              value="dokumen"
              className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
            >
              <CreditCard className="w-4 h-4 mr-2 shrink-0" />
              {isId ? 'Dokumen' : 'Documents'}
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
                  {isId ? 'Identitas Diri' : 'Personal Identity'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: isId ? 'Nama Lengkap' : 'Full Name', value: student.fullName },
                    { label: isId ? 'Nama Panggilan' : 'Nickname', value: student.nickname || '-' },
                    { label: 'NIS / NISN', value: `${formattedNis} / ${student.nisn}` },
                    { label: 'NIK', value: student.nik },
                    { label: isId ? 'No. Kartu Keluarga' : 'Family Card No.', value: student.noKk || '-' },
                    {
                      label: isId ? 'Tempat, Tgl Lahir' : 'Place, Date of Birth',
                      value: `${student.birthPlace || '-'}, ${formatDate(student.birthDate)}`,
                    },
                    {
                      label: isId ? 'Jenis Kelamin' : 'Gender',
                      value:
                        student.gender === 'L'
                          ? isId ? 'Laki-laki' : 'Male'
                          : isId ? 'Perempuan' : 'Female',
                    },
                    { label: isId ? 'Agama' : 'Religion', value: student.religion || '-', capitalize: true },
                  ].map((item, idx) => (
                    <div key={idx} className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                      <dt className="text-muted-foreground font-medium">{item.label}</dt>
                      <dd className={`col-span-2 text-foreground font-medium wrap-break-word ${item.capitalize ? 'capitalize' : ''}`}>
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <MapPin className="mr-2 h-5 w-5 shrink-0" />
                  {isId ? 'Alamat & Kontak' : 'Address & Contact'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: isId ? 'Alamat Jalan' : 'Street Address', value: student.address || '-' },
                    { label: 'RT / RW / Dusun', value: `${student.rt || '-'} / ${student.rw || '-'} / ${student.dusun || '-'}` },
                    { label: isId ? 'Kelurahan' : 'Village', value: student.kelurahan || '-' },
                    { label: isId ? 'Kecamatan' : 'District', value: student.kecamatan || '-' },
                    { label: isId ? 'Kabupaten/Kota' : 'City', value: student.city || '-' },
                    { label: isId ? 'Provinsi' : 'Province', value: student.province || '-' },
                    { label: isId ? 'Kode Pos' : 'Postal Code', value: student.postalCode || '-' },
                    { label: isId ? 'Telepon Rumah' : 'Home Phone', value: student.telepon || '-' },
                    { label: isId ? 'No. HP' : 'Mobile Phone', value: student.phone || '-' },
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
                {isId ? 'Informasi Akademik' : 'Academic Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-border">
                <div className="grid grid-cols-3 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                  <dt className="text-muted-foreground font-medium">Status</dt>
                  <dd className="col-span-2">
                    <Badge variant={getStatusColor(student.status)}>{getStatusLabel(student.status)}</Badge>
                  </dd>
                </div>
                {[
                  {
                    label: isId ? 'Kelas Saat Ini' : 'Current Class',
                    value:
                      (student.gradeLevel ?? 0) > 0
                        ? `${student.className || '-'} (${isId ? 'Tingkat' : 'Grade'} ${student.gradeLevel})`
                        : student.className || '-',
                  },
                  {
                    label: isId ? 'Tanggal Masuk' : 'Entry Date',
                    value: student.entryDate ? formatDate(student.entryDate) : '-',
                  },
                  { label: isId ? 'Sekolah Asal' : 'Previous School', value: student.sekolahAsal || '-' },
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
          {parentsList.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
              {isId
                ? 'Data orang tua/wali belum dilengkapi.'
                : 'Parent/guardian data has not been provided yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(['AYAH', 'IBU', 'WALI'] as const).map((relation) => {
                const parent = parentsList.find((p) => p.relation === relation);
                if (relation === 'WALI' && !parent) return null;

                const isFather = relation === 'AYAH';
                const titleID = relation === 'AYAH' ? 'Data Ayah' : relation === 'IBU' ? 'Data Ibu' : 'Data Wali';
                const titleEN = relation === 'AYAH' ? 'Father Data' : relation === 'IBU' ? 'Mother Data' : 'Guardian Data';

                const aliveLabel = !parent
                  ? '-'
                  : parent.isAlive
                    ? isId ? 'Masih Hidup' : 'Alive'
                    : isId
                      ? relation === 'IBU' ? 'Almarhumah' : 'Almarhum'
                      : 'Deceased';

                return (
                  <Card key={relation} className="shadow-sm border-border">
                    <CardHeader className="bg-muted/20 border-b border-border pb-4">
                      <CardTitle className="text-lg flex items-center justify-between text-primary">
                        <span className="flex items-center">
                          <Briefcase
                            className={`mr-2 h-5 w-5 shrink-0 ${isFather ? 'text-blue-500' : relation === 'IBU' ? 'text-pink-500' : 'text-amber-500'
                              }`}
                          />
                          {isId ? titleID : titleEN}
                        </span>
                        {parent && !parent.isAlive && (
                          <Badge variant="secondary" className="text-xs">
                            {aliveLabel}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <dl className="divide-y divide-border">
                        {[
                          { label: isId ? 'Nama Lengkap' : 'Full Name', value: parent?.fullName || '-' },
                          { label: isId ? 'Status' : 'Status', value: aliveLabel },
                          { label: isId ? 'Tahun Lahir' : 'Birth Year', value: parent?.birthYear || '-' },
                          { label: 'NIK', value: parent?.nik || '-' },
                          { label: isId ? 'Pendidikan' : 'Education', value: parent?.education || '-' },
                          { label: isId ? 'Pekerjaan' : 'Occupation', value: parent?.occupation || '-' },
                          { label: isId ? 'No. Handphone' : 'Phone', value: parent?.phone || '-' },
                          { label: 'Email', value: parent?.email || '-' },
                          { label: isId ? 'Penghasilan' : 'Income', value: formatCurrency(parent?.monthlyIncome) },
                          ...(parent?.address
                            ? [{ label: isId ? 'Alamat' : 'Address', value: parent.address }]
                            : []),
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
            </div>
          )}
        </TabsContent>

        {/* TAB 4: KESEJAHTERAAN */}
        <TabsContent value="ekonomi" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <Wallet className="mr-2 h-5 w-5 shrink-0 text-blue-500" />
                  {isId ? 'Program Indonesia Pintar (PIP/KIP)' : 'Smart Indonesia Program (PIP/KIP)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Penerima KIP' : 'Has KIP'}</dt>
                    <dd className="text-foreground font-bold">{formatBool(ecoData?.hasKip)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Nomor KIP' : 'KIP Number'}</dt>
                    <dd className="text-foreground font-medium wrap-break-word">{ecoData?.kipNumber || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Nama di KIP' : 'Name on KIP'}</dt>
                    <dd className="text-foreground font-medium wrap-break-word">{ecoData?.namaKip || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Usulan Layak PIP' : 'Eligible for PIP'}</dt>
                    <dd className="text-foreground font-bold">{formatBool(ecoData?.layakPip)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Desil DTKS / P3KE' : 'DTKS / P3KE Decile'}</dt>
                    <dd className="text-foreground font-medium">
                      {ecoData?.desil ? (
                        ecoData.desil <= 4 ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                            Desil {ecoData.desil} ({isId ? 'Prioritas PIP' : 'PIP Priority'})
                          </Badge>
                        ) : (
                          <Badge variant="outline">Desil {ecoData.desil}</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium mb-1">{isId ? 'Alasan Layak PIP' : 'Reason for PIP'}</dt>
                    <dd className="text-foreground font-medium">{ecoData?.alasanLayakPip || '-'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="bg-muted/20 border-b border-border pb-4">
                <CardTitle className="text-lg flex items-center text-primary">
                  <HeartPulse className="mr-2 h-5 w-5 shrink-0 text-indigo-500" />
                  {isId ? 'Bantuan Sosial & Kondisi Keluarga' : 'Social Assistance & Family'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Penerima PKH' : 'Has PKH'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.hasPkh ? (
                        <Badge variant="default">{isId ? 'Ya' : 'Yes'}</Badge>
                      ) : (
                        formatBool(ecoData?.hasPkh)
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Penerima KKS / KPS' : 'Has KKS / KPS'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.hasKks ? (
                        <Badge variant="default">{ecoData.kksNumber || (isId ? 'Ya' : 'Yes')}</Badge>
                      ) : (
                        formatBool(ecoData?.hasKks)
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Terdaftar DTKS' : 'Registered in DTKS'}</dt>
                    <dd className="text-foreground font-bold">
                      {ecoData?.isDtks ? (
                        <Badge variant="default">{isId ? 'Ya' : 'Yes'}</Badge>
                      ) : (
                        formatBool(ecoData?.isDtks)
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Status Yatim/Piatu' : 'Orphan Status'}</dt>
                    <dd className="text-foreground font-medium">{getOrphanLabel()}</dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Kepemilikan Rumah' : 'House Ownership'}</dt>
                    <dd className="text-foreground font-medium wrap-break-word">{ecoData?.houseOwnership || '-'}</dd>
                  </div>
                  <div className="flex justify-between px-4 sm:px-6 py-4 text-sm hover:bg-muted/10 transition-colors">
                    <dt className="text-muted-foreground font-medium">{isId ? 'Jumlah Tanggungan' : 'Dependents'}</dt>
                    <dd className="text-foreground font-medium">
                      {ecoData?.dependentsCount !== null && ecoData?.dependentsCount !== undefined
                        ? `${ecoData.dependentsCount} ${isId ? 'orang' : 'person(s)'}`
                        : '-'}
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
                  {isId ? 'Kesehatan & Fisik' : 'Physical Health'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: isId ? 'Berat Badan' : 'Weight', value: student.beratBadan ? `${student.beratBadan} kg` : '-' },
                    { label: isId ? 'Tinggi Badan' : 'Height', value: student.tinggiBadan ? `${student.tinggiBadan} cm` : '-' },
                    { label: isId ? 'Lingkar Kepala' : 'Head Circum.', value: student.lingkarKepala ? `${student.lingkarKepala} cm` : '-' },
                    { label: isId ? 'Kebutuhan Khusus' : 'Special Needs', value: student.kebutuhanKhusus || '-' },
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
                  {isId ? 'Tempat Tinggal' : 'Residence'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: isId ? 'Anak Ke' : 'Birth Order', value: student.anakKe || '-' },
                    { label: isId ? 'Jml. Saudara' : 'Siblings', value: student.jmlSaudara ?? '-' },
                    { label: isId ? 'Jarak Sekolah' : 'Distance', value: student.jarakSekolah !== null && student.jarakSekolah !== undefined ? `${student.jarakSekolah} km` : '-' },
                    { label: isId ? 'Transportasi' : 'Transport', value: student.alatTransportasi || '-' },
                    { label: isId ? 'Jenis Tinggal' : 'Residence Type', value: student.jenisTinggal || '-' },
                    {
                      label: isId ? 'Koordinat (Lat, Long)' : 'Coordinates',
                      value: student.lintang || student.bujur ? `${student.lintang || '-'}, ${student.bujur || '-'}` : '-',
                    },
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
                  {isId ? 'Registrasi & Dokumen' : 'Registration & Docs'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    { label: isId ? 'No. Akta Lahir' : 'Birth Cert No.', value: student.noAktaLahir || '-' },
                    { label: 'SKHUN', value: student.skhun || '-' },
                    { label: isId ? 'No. Ijazah' : 'Certificate No.', value: student.noIjazah || '-' },
                    { label: isId ? 'No. Peserta UN' : 'UN No.', value: student.noPesertaUn || '-' },
                    { label: 'Bank', value: student.bank || '-' },
                    { label: isId ? 'No. Rekening' : 'Account No.', value: student.noRekening || '-' },
                    { label: isId ? 'Atas Nama' : 'Account Name', value: student.namaRekening || '-' },
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

        {/* TAB 6: DOKUMEN */}
        <TabsContent value="dokumen" className="m-0">
          <Card className="shadow-sm border-border">
            <CardContent className="p-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed mt-6">
              {isId
                ? 'Modul arsip & unggah dokumen digital (Ijazah, KK, Akta Kelahiran) sedang dalam tahap pengembangan.'
                : 'Digital document upload module (Certificates, Family Card, Birth Certificate) is under development.'}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}