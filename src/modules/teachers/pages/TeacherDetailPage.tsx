// src/modules/teachers/pages/TeacherDetailPage.tsx
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  AlertCircle,
  RefreshCw,
  Camera,
  Trash2,
  History,
  ShieldCheck,
  Clock,
  ZoomIn,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  teacherService,
  normalizeTeacherSchoolId,
} from '../services/teacher.service';
import type {
  PhotoRetentionDays,
  TeacherPhotoHistoryItem,
} from '../types/teacher.types';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatDate, formatCurrency } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * Menerjemahkan error teknis (API, Supabase, Jaringan, atau UUID tidak valid)
 * menjadi pesan yang ramah bagi pengguna.
 */
const extractFriendlyErrorMessage = (
  error: unknown,
  locale: string,
  fallbackId: string,
  fallbackEn: string
): string => {
  const isId = locale === 'id';
  const fallback = isId ? fallbackId : fallbackEn;

  if (!error) return fallback;

  if (typeof error === 'object' && error !== null) {
    const errObj = error as {
      response?: {
        data?: {
          message?: string | string[];
          error?: string;
        };
      };
      message?: string;
      details?: string;
      code?: string;
    };

    const apiMessage = errObj.response?.data?.message;
    if (Array.isArray(apiMessage) && apiMessage.length > 0) {
      return apiMessage.join(', ');
    }
    if (typeof apiMessage === 'string' && apiMessage.trim() !== '') {
      return apiMessage;
    }
    if (typeof errObj.response?.data?.error === 'string' && errObj.response.data.error.trim() !== '') {
      return errObj.response.data.error;
    }

    if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
      const rawMsg = errObj.message;
      const lowerMsg = rawMsg.toLowerCase();

      if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
        return isId
          ? 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.'
          : 'Connection to server failed. Check your internet connection and try again.';
      }

      if (lowerMsg.includes('invalid input syntax for type uuid') || errObj.code === '22P02') {
        return isId
          ? 'Format tautan atau ID data guru tidak valid.'
          : 'Invalid teacher ID format in URL.';
      }

      if (lowerMsg.includes('permission denied') || lowerMsg.includes('row-level security')) {
        return isId
          ? 'Anda tidak memiliki izin untuk melihat detail data guru ini.'
          : 'You do not have permission to view this teacher record.';
      }

      return rawMsg;
    }
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }

  return fallback;
};

const formatDateTimeShort = (isoString?: string | null): string => {
  if (!isoString) return '-';
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

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
  const queryClient = useQueryClient();
  const { locale } = useTranslation();
  const { school, user: currentUser } = useAuthStore();
  const { hasPermission } = usePermission();
  const isId = locale === 'id';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [previewModalCaption, setPreviewModalCaption] = useState<string>('');

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Mengecek izin update guru secara terpusat (selaras dengan TeacherListPage & RLS database)
  const canManageTeachers = hasPermission('teachers', 'update');
  const activeSchoolId = useMemo(
    () => normalizeTeacherSchoolId(school?.id) ?? normalizeTeacherSchoolId(currentUser?.schoolId),
    [school?.id, currentUser?.schoolId]
  );

  // Mengecek cakupan akses profil guru bagi pengguna yang sedang login
  const teacherScope = useTeacherScope(activeSchoolId);
  const isForbiddenTeacherView =
    !teacherScope.isLoading &&
    !teacherScope.hasFullAcademicAccess &&
    (!teacherScope.teacherId || teacherScope.teacherId !== id);

  // Kamus label teks
  const dict = {
    title: isId ? 'Profil Guru & PTK' : 'Teacher Profile',
    desc: isId
      ? 'Informasi detail kepegawaian dan biodata Dapodik PTK.'
      : 'Detailed employment and Dapodik PTK information.',
    back: isId ? 'Kembali ke Data Guru' : 'Back to Teachers',
    retry: isId ? 'Muat Ulang' : 'Retry',
    editBtn: isId ? 'Edit Data' : 'Edit Data',
    tabPersonal: isId ? 'Data Pribadi' : 'Personal Info',
    tabProf: isId ? 'Kepegawaian' : 'Employment',
    tabTask: isId ? 'Tugas & Lisensi' : 'Duties & Licenses',
    tabFamily: isId ? 'Keluarga & Finansial' : 'Family & Financial',
    noData: '-',
    yes: isId ? 'Ya' : 'Yes',
    no: isId ? 'Tidak' : 'No',
  };

  // Mengambil detail data guru berdasarkan ID dari URL
  const {
    data: response,
    isLoading: isDetailLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['teacher', id, activeSchoolId],
    queryFn: () => teacherService.getById(id!, activeSchoolId ?? undefined),
    enabled: Boolean(id) && !teacherScope.isLoading && !isForbiddenTeacherView,
    retry: false,
  });

  const teacher = response?.data;

  useEffect(() => {
    setAvatarLoadError(false);
  }, [teacher?.photoUrl]);

  // Guru pemilik profil ATAU pengelola administrasi/Super Admin berhak mengganti foto
  const isOwnProfile = Boolean(
    teacher &&
    ((currentUser?.id && teacher.userId && currentUser.id === teacher.userId) ||
      (teacherScope.teacherId && teacherScope.teacherId === teacher.id))
  );
  const canEditPhoto = canManageTeachers || isOwnProfile;

  // Query khusus SUPER_ADMIN: Konfigurasi masa simpan histori foto sekolah
  const { data: retentionDays = 30, isLoading: isRetentionLoading } = useQuery({
    queryKey: ['teacher-photo-retention', teacher?.schoolId],
    queryFn: () => teacherService.getPhotoRetentionDays(teacher!.schoolId),
    enabled: isSuperAdmin && Boolean(teacher?.schoolId),
    retry: false,
  });

  // Query khusus SUPER_ADMIN: Daftar histori foto lama guru ini
  const {
    data: historyResponse,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['teacher-photo-history', teacher?.id],
    queryFn: () => teacherService.getPhotoHistory(teacher!.id),
    enabled: isSuperAdmin && Boolean(teacher?.id),
    retry: false,
  });

  const photoHistory = historyResponse?.data ?? [];

  // Mutasi unggah & simpan foto profil baru
  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!teacher) throw new Error('Data guru tidak tersedia.');
      return teacherService.uploadAndSaveTeacherPhoto({
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        file,
        linkedUserId: teacher.userId,
      });
    },
    onSuccess: (res) => {
      setAvatarLoadError(false);
      queryClient.invalidateQueries({ queryKey: ['teacher', id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      if (isSuperAdmin && teacher?.id) {
        queryClient.invalidateQueries({ queryKey: ['teacher-photo-history', teacher.id] });
      }
      toast.success(res.message);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal memperbarui foto profil guru.',
        'Failed to update teacher profile photo.'
      );
      toast.error(msg, { duration: 5000 });
    },
  });

  // Mutasi hapus foto profil aktif (otomatis masuk ke histori)
  const removePhotoMutation = useMutation({
    mutationFn: async () => {
      if (!teacher) throw new Error('Data guru tidak tersedia.');
      return teacherService.updateTeacherPhoto(teacher.id, null, teacher.userId);
    },
    onSuccess: (res) => {
      setAvatarLoadError(false);
      queryClient.invalidateQueries({ queryKey: ['teacher', id] });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      if (isSuperAdmin && teacher?.id) {
        queryClient.invalidateQueries({ queryKey: ['teacher-photo-history', teacher.id] });
      }
      toast.success(res.message);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal menghapus foto profil aktif.',
        'Failed to remove active profile photo.'
      );
      toast.error(msg, { duration: 5000 });
    },
  });

  // Mutasi khusus SUPER_ADMIN: Ubah masa simpan histori (7 / 14 / 30 hari)
  const retentionMutation = useMutation({
    mutationFn: async (days: PhotoRetentionDays) => {
      if (!teacher) throw new Error('Data sekolah tidak ditemukan.');
      return teacherService.setPhotoRetentionDays(teacher.schoolId, days);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ['teacher-photo-retention', teacher?.schoolId],
      });
      queryClient.invalidateQueries({
        queryKey: ['teacher-photo-history', teacher?.id],
      });
      toast.success(res.message);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal mengubah pengaturan retensi foto.',
        'Failed to update photo retention setting.'
      );
      toast.error(msg);
    },
  });

  // Mutasi khusus SUPER_ADMIN: Hapus satu histori foto permanen
  const deleteHistoryItemMutation = useMutation({
    mutationFn: (item: TeacherPhotoHistoryItem) =>
      teacherService.deletePhotoHistoryItem(item),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ['teacher-photo-history', teacher?.id],
      });
      toast.success(res.message);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal menghapus arsip foto lama.',
        'Failed to delete archived photo.'
      );
      toast.error(msg);
    },
  });

  // Mutasi khusus SUPER_ADMIN: Bersihkan seluruh histori kedaluwarsa pada sekolah ini
  const purgeExpiredMutation = useMutation({
    mutationFn: () => teacherService.purgeExpiredPhotoHistory(teacher?.schoolId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ['teacher-photo-history', teacher?.id],
      });
      toast.success(res.message);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal membersihkan arsip foto kedaluwarsa.',
        'Failed to purge expired photo history.'
      );
      toast.error(msg);
    },
  });

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    uploadPhotoMutation.mutate(file);
  };

  const isPhotoBusy = uploadPhotoMutation.isPending || removePhotoMutation.isPending;

  // Tampilan saat data atau hak akses sedang dimuat
  if (teacherScope.isLoading || isDetailLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Blokir akses jika akun guru biasa mencoba membuka profil guru lain lewat URL
  if (isForbiddenTeacherView) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {isId ? 'Akses Profil Dibatasi' : 'Profile Access Restricted'}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {isId
            ? 'Anda hanya diperbolehkan melihat biodata kepegawaian milik Anda sendiri.'
            : 'You are only permitted to view your own employment profile.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {teacherScope.teacherId && (
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => navigate(`/teachers/${teacherScope.teacherId}`, { replace: true })}
            >
              {isId ? 'Buka Profil Saya' : 'Open My Profile'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate('/teachers')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {dict.back}
          </Button>
        </div>
      </div>
    );
  }

  // Tampilan jika data tidak ditemukan atau gagal dimuat
  if (!id || isError || !teacher) {
    const errorDescription = !id
      ? isId
        ? 'ID guru tidak ditemukan pada alamat halaman.'
        : 'Teacher ID is missing from the page URL.'
      : extractFriendlyErrorMessage(
        queryError,
        locale,
        'Data guru tidak ditemukan atau terjadi gangguan saat mengambil data dari server.',
        'Teacher record not found or an error occurred while fetching data from the server.'
      );

    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {isId ? 'Gagal Memuat Profil Guru' : 'Failed to Load Teacher Profile'}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">{errorDescription}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {Boolean(id) && isError && (
            <Button type="button" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {dict.retry}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate('/teachers')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {dict.back}
          </Button>
        </div>
      </div>
    );
  }

  const getInitials = (name?: string | null) =>
    (name || '?').trim().charAt(0).toUpperCase() || '?';

  const hasValidPhoto = Boolean(teacher.photoUrl && !avatarLoadError);

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
      {/* ================= MODAL PRATINJAU FOTO ================= */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {previewModalCaption}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewModalUrl(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <img
              src={previewModalUrl}
              alt={previewModalCaption}
              className="max-h-[75vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}

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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* KOLOM KIRI: KARTU PROFIL + PANEL RETENTION SUPER ADMIN */}
        <div className="space-y-4">
          <Card className="h-fit border-border shadow-sm">
            <CardContent className="flex flex-col items-center pt-6 text-center">
              {/* AVATAR FOTO PROFIL / INISIAL */}
              <div className="relative mb-3">
                {hasValidPhoto ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewModalUrl(teacher.photoUrl!);
                      setPreviewModalCaption(teacher.fullName);
                    }}
                    title={isId ? 'Klik untuk memperbesar foto' : 'Click to enlarge photo'}
                    className="group relative h-28 w-28 overflow-hidden rounded-full border-4 border-emerald-500/20 bg-muted shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <img
                      src={teacher.photoUrl!}
                      alt={teacher.fullName}
                      onError={() => setAvatarLoadError(true)}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-3xl font-bold text-white shadow-lg">
                    {getInitials(teacher.fullName)}
                  </div>
                )}

                {canEditPhoto && (
                  <button
                    type="button"
                    disabled={isPhotoBusy}
                    onClick={() => fileInputRef.current?.click()}
                    title={isId ? 'Ganti foto profil' : 'Change profile photo'}
                    className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-emerald-600 text-white shadow-md transition-colors hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {uploadPhotoMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoFileChange}
                />
              </div>

              {/* AKSI FOTO PROFIL */}
              {canEditPhoto && (
                <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPhotoBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 px-2.5 text-xs"
                  >
                    {uploadPhotoMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="mr-1.5 h-3 w-3 text-emerald-600" />
                    )}
                    {hasValidPhoto
                      ? isId
                        ? 'Ganti Foto'
                        : 'Change Photo'
                      : isId
                        ? 'Unggah Foto'
                        : 'Upload Photo'}
                  </Button>

                  {hasValidPhoto && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPhotoBusy}
                      onClick={() => removePhotoMutation.mutate()}
                      className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      {removePhotoMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      {isId ? 'Hapus' : 'Remove'}
                    </Button>
                  )}
                </div>
              )}

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
                    {isId ? 'Nonaktif' : 'Inactive'}
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
                    <span>{isId ? 'Guru Tersertifikasi' : 'Certified Teacher'}</span>
                  </div>
                )}
                {teacher.userId ? (
                  <div className="flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 py-1.5 px-2 text-xs font-medium text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                    <UserCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>{isId ? 'Terhubung Akun Login' : 'Login Account Linked'}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 py-1.5 px-2 text-xs font-medium text-muted-foreground">
                    <UserX className="h-3.5 w-3.5 shrink-0" />
                    <span>{isId ? 'Belum Punya Akun Login' : 'No Login Account'}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ================= PANEL KHUSUS SUPER ADMIN: RETENSI & HISTORI FOTO ================= */}
          {isSuperAdmin && (
            <Card className="border-amber-200/80 bg-amber-50/30 shadow-sm dark:border-amber-500/25 dark:bg-amber-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-300">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{isId ? 'Arsip & Retensi Foto' : 'Photo Retention'}</span>
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => refetchHistory()}
                    title={isId ? 'Segarkan histori' : 'Refresh history'}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {/* Pengaturan Masa Simpan Sekolah (7 / 14 / 30 Hari) */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {isId
                        ? 'Masa Simpan Histori Foto Sekolah'
                        : 'School Photo Retention Period'}
                    </span>
                  </label>
                  <Select
                    value={String(retentionDays)}
                    disabled={isRetentionLoading || retentionMutation.isPending}
                    onValueChange={(val) =>
                      retentionMutation.mutate(Number(val) as PhotoRetentionDays)
                    }
                  >
                    <SelectTrigger className="h-8 bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 Hari</SelectItem>
                      <SelectItem value="14">14 Hari</SelectItem>
                      <SelectItem value="30">30 Hari (Default)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tombol Bersihkan Foto Kedaluwarsa */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={purgeExpiredMutation.isPending}
                  onClick={() => purgeExpiredMutation.mutate()}
                  className="h-7 w-full justify-center bg-background text-xs"
                >
                  {purgeExpiredMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3 w-3 text-amber-600" />
                  )}
                  {isId ? 'Bersihkan Foto Kedaluwarsa' : 'Purge Expired Photos'}
                </Button>

                {/* Daftar Histori Foto Lama */}
                <div className="border-t border-border/60 pt-2.5">
                  <div className="mb-2 flex items-center justify-between font-medium text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <History className="h-3.5 w-3.5" />
                      {isId ? 'Riwayat Foto Diganti' : 'Replaced Photos'}
                    </span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {photoHistory.length}
                    </Badge>
                  </div>

                  {isHistoryLoading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : photoHistory.length === 0 ? (
                    <p className="py-2 text-center text-[11px] text-muted-foreground">
                      {isId
                        ? 'Belum ada riwayat pergantian foto.'
                        : 'No archived photos found.'}
                    </p>
                  ) : (
                    <div className="max-h-60 space-y-2 overflow-y-auto pr-0.5">
                      {photoHistory.map((item) => {
                        const isExpired = new Date(item.expiresAt).getTime() <= Date.now();
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-lg border border-border/70 bg-background p-1.5"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewModalUrl(item.photoUrl);
                                setPreviewModalCaption(
                                  `${teacher.fullName} — Diganti ${formatDateTimeShort(item.replacedAt)}`
                                );
                              }}
                              className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                              title={isId ? 'Lihat foto arsip' : 'View archived photo'}
                            >
                              <img
                                src={item.photoUrl}
                                alt="Arsip foto"
                                className="h-full w-full object-cover"
                              />
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11px] font-medium text-foreground">
                                {formatDateTimeShort(item.replacedAt)}
                              </div>
                              <div
                                className={cn(
                                  'truncate text-[10px]',
                                  isExpired
                                    ? 'font-medium text-rose-600 dark:text-rose-400'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {isExpired
                                  ? isId
                                    ? 'Kedaluwarsa'
                                    : 'Expired'
                                  : `${isId ? 'Hapus otomatis:' : 'Expires:'} ${formatDateTimeShort(item.expiresAt)}`}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={deleteHistoryItemMutation.isPending}
                              onClick={() => deleteHistoryItemMutation.mutate(item)}
                              title={isId ? 'Hapus permanen' : 'Delete permanently'}
                              className="h-7 w-7 shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

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
                  label={isId ? 'Nama Lengkap' : 'Full Name'}
                  value={teacher.fullName}
                />
                <InfoItem
                  label={isId ? 'Jenis Kelamin' : 'Gender'}
                  value={genderText}
                />
                <InfoItem label="NIK" value={teacher.nik} />
                <InfoItem label="No. KK" value={teacher.noKk} />
                <InfoItem
                  label={isId ? 'Tempat, Tanggal Lahir' : 'Birth Info'}
                  value={`${teacher.birthPlace || dict.noData}, ${teacher.birthDate ? formatDate(teacher.birthDate) : dict.noData
                    }`}
                />
                <InfoItem
                  label={isId ? 'Agama / Kepercayaan' : 'Religion'}
                  value={teacher.religion}
                />
                <InfoItem
                  label={isId ? 'Kewarganegaraan' : 'Nationality'}
                  value={teacher.kewarganegaraan}
                />
                <InfoItem
                  label={isId ? 'Nama Ibu Kandung' : 'Mother Name'}
                  value={teacher.namaIbuKandung}
                />
                <InfoItem label="No. HP / WhatsApp" value={teacher.phone} />
                <InfoItem label="Telepon Rumah" value={teacher.telepon} />
                <div className="sm:col-span-2">
                  <InfoItem
                    label={isId ? 'Alamat Lengkap' : 'Address'}
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