import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, Edit, User, MapPin, Phone, Mail, FileText, 
  GraduationCap, Briefcase, HeartPulse, Building2, UserCircle2 
} from 'lucide-react';
import { studentService } from '../services/student.service';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: studentResponse, isLoading, isError } = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.getById(id!),
  });

  const student = studentResponse?.data;

  if (isLoading) {
    return <div className="flex h-[60vh] items-center justify-center">Memuat data...</div>;
  }

  if (isError || !student) {
    return <div className="flex h-[60vh] items-center justify-center text-red-500">Gagal memuat data siswa</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AKTIF': return 'success';
      case 'MUTASI_KELUAR': return 'warning';
      case 'LULUS': return 'default';
      case 'DO': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Detail Siswa</h1>
        </div>
        <Button asChild>
          <Link to={`/students/${id}/edit`}>
            <Edit className="mr-2 h-4 w-4" /> Edit Data
          </Link>
        </Button>
      </div>

      {/* Profile Overview Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
            <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-200">
              <UserCircle2 className="h-12 w-12" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold">{student.fullName}</h2>
                <Badge variant={getStatusColor(student.status)}>{student.status}</Badge>
              </div>
              <p className="text-muted-foreground mt-1">NISN: {student.nisn} • NIK: {student.nik}</p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center"><Building2 className="mr-2 h-4 w-4" /> Kelas: {student.className}</div>
                <div className="flex items-center"><MapPin className="mr-2 h-4 w-4" /> {student.city}, {student.province}</div>
                <div className="flex items-center"><Phone className="mr-2 h-4 w-4" /> {student.phone || '-'}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs defaultValue="pribadi" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="pribadi">Identitas & Akademik</TabsTrigger>
          <TabsTrigger value="orangtua">Orang Tua/Wali</TabsTrigger>
          <TabsTrigger value="ekonomi">Ekonomi (PIP/KIP)</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pribadi" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><User className="mr-2 h-5 w-5 text-emerald-500" /> Data Pribadi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Nama Lengkap</span>
                  <span className="font-medium col-span-2">{student.fullName}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">No. KK</span>
                  <span className="font-medium col-span-2">{student.noKk}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Tempat, Tgl Lahir</span>
                  <span className="font-medium col-span-2">{student.birthPlace}, {formatDate(student.birthDate)}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Jenis Kelamin</span>
                  <span className="font-medium col-span-2">{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Agama</span>
                  <span className="font-medium col-span-2">{student.religion}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Alamat Lengkap</span>
                  <span className="font-medium col-span-2">
                    {student.address}, RT {student.rt}/RW {student.rw}<br />
                    Kel. {student.kelurahan}, Kec. {student.kecamatan}<br />
                    {student.city}, {student.province} {student.postalCode}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center"><GraduationCap className="mr-2 h-5 w-5 text-emerald-500" /> Data Akademik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Status</span>
                  <span className="font-medium col-span-2"><Badge variant={getStatusColor(student.status)}>{student.status}</Badge></span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Kelas Saat Ini</span>
                  <span className="font-medium col-span-2">{student.className} (Tingkat {student.gradeLevel})</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Tanggal Masuk</span>
                  <span className="font-medium col-span-2">{formatDate(student.entryDate)}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Asal Sekolah</span>
                  <span className="font-medium col-span-2">{student.previousSchool || '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Jarak ke Sekolah</span>
                  <span className="font-medium col-span-2">{student.distanceToSchool ? `${student.distanceToSchool} km` : '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Transportasi</span>
                  <span className="font-medium col-span-2">{student.transport || '-'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orangtua" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {student.parents?.map((parent) => (
              <Card key={parent.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center capitalize">
                    {parent.relation === 'AYAH' ? <User className="mr-2 h-5 w-5 text-blue-500" /> : <User className="mr-2 h-5 w-5 text-pink-500" />}
                    Data {parent.relation.toLowerCase()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">Nama Lengkap</span>
                    <span className="font-medium col-span-2">{parent.fullName}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">NIK</span>
                    <span className="font-medium col-span-2">{parent.nik || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">Pendidikan</span>
                    <span className="font-medium col-span-2">{parent.education || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">Pekerjaan</span>
                    <span className="font-medium col-span-2">{parent.occupation || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">No. Handphone</span>
                    <span className="font-medium col-span-2">{parent.phone || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">Status</span>
                    <span className="font-medium col-span-2">
                      <Badge variant={parent.isAlive ? "outline" : "secondary"}>
                        {parent.isAlive ? "Masih Hidup" : "Meninggal"}
                      </Badge>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!student.parents?.length && (
              <div className="col-span-2 p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                Data orang tua/wali belum dilengkapi.
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="ekonomi" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kesejahteraan & Bantuan (PIP/KIP)</CardTitle>
              <CardDescription>Data ekonomi digunakan untuk menentukan kelayakan beasiswa/bantuan PIP.</CardDescription>
            </CardHeader>
            <CardContent>
               {/* Simplified for now, real app would show the economic fields */}
               <div className="p-8 text-center text-muted-foreground">
                  Detail ekonomi akan ditampilkan di sini.
               </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
