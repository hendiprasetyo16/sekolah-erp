// src/modules/auth/services/auth.service.ts
import { supabase } from '@/services/supabase.client';
import type { User, School, AcademicYear, UserRole } from '@/types/common.types';

/**
 * Daftar seluruh kode role yang didukung sistem (termasuk role STAFF_PERPUS).
 */
export type EffectiveUserRole = UserRole | 'STAFF_PERPUS';

/**
 * Perluasan tipe User agar mendukung daftar tugas tambahan (`additionalRoles`)
 * serta teks tugas tambahan bawaan Dapodik (`tugasTambahan`).
 */
export interface UserWithAdditionalRoles extends Omit<User, 'role'> {
  role: EffectiveUserRole;
  additionalRoles?: EffectiveUserRole[];
  tugasTambahan?: string | null;
}

/**
 * Payload input untuk proses autentikasi pengguna.
 * `identifier` dapat berupa Email, NIP, NUPTK, NISN, atau NIK.
 */
export interface LoginPayload {
  identifier: string;
  password: string;
}

/**
 * Struktur data sesi lengkap yang dikembalikan ketika login berhasil.
 */
export interface LoginResponse {
  user: UserWithAdditionalRoles;
  school: School | null;
  academicYear: AcademicYear | null;
}

/**
 * Discriminated Union untuk hasil autentikasi.
 */
export type AuthResult =
  | { success: true; data: LoginResponse; message: string }
  | { success: false; data: null; message: string };

/**
 * Daftar key localStorage & sessionStorage yang berkaitan dengan sesi autentikasi.
 */
const AUTH_STORAGE_KEYS = ['sekolah-erp-auth', 'auth-storage'] as const;
const SESSION_ONLY_FLAG_KEY = 'sekolah-erp-session-only';

/**
 * Helper aman untuk mengekstrak pesan error dari tipe `unknown`.
 */
function extractErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallbackMessage;
}

/**
 * Menerjemahkan teks Tugas Tambahan dari Excel Dapodik menjadi kode role sistem.
 * Kata kunci di bawah ini dapat disesuaikan dengan kebutuhan penugasan sekolah.
 */
export function mapTugasTambahanToRoles(tugasTambahan?: string | null): EffectiveUserRole[] {
  if (!tugasTambahan) return [];
  const text = tugasTambahan.toLowerCase().trim();
  const mapped: EffectiveUserRole[] = [];

  if (text.includes('bendahara')) mapped.push('BENDAHARA');
  if (text.includes('sarpras') || text.includes('sarana')) mapped.push('STAFF_SARPRAS');
  if (text.includes('perpustakaan') || text.includes('perpus')) mapped.push('STAFF_PERPUS');
  if (text.includes('tata usaha') || text.includes('administrasi')) mapped.push('STAFF_TU');
  if (text.includes('wali kelas')) mapped.push('WALI_KELAS');
  if (text.includes('wakil kepala') || text.includes('wakasek') || text.includes('operator')) {
    mapped.push('OPERATOR');
  }

  return mapped;
}

/**
 * Menormalkan data profil dari database agar `additionalRoles` selalu berupa array valid.
 */
function normalizeUserProfile(rawProfile: Record<string, unknown>): UserWithAdditionalRoles {
  const baseUser = rawProfile as unknown as UserWithAdditionalRoles;
  const rawAdditional = rawProfile.additionalRoles;

  return {
    ...baseUser,
    additionalRoles: Array.isArray(rawAdditional)
      ? (rawAdditional as EffectiveUserRole[])
      : [],
  };
}

/**
 * Mengambil kolom `tugasTambahan` dari tabel `teachers` serta memanggil RPC
 * `get_user_all_roles()` agar peran efektif di frontend selaras dengan RLS server.
 */
async function enrichProfileWithTeacherDuties(
  profile: UserWithAdditionalRoles
): Promise<UserWithAdditionalRoles> {
  if (!profile.schoolId || profile.role === 'SISWA' || profile.role === 'ORANG_TUA') {
    return profile;
  }

  try {
    const [teacherRes, rpcRes] = await Promise.all([
      supabase
        .from('teachers')
        .select('tugasTambahan')
        .eq('userId', profile.id)
        .eq('schoolId', profile.schoolId)
        .maybeSingle(),
      (
        supabase.rpc as unknown as (
          fn: string
        ) => Promise<{ data: string[] | null; error: unknown }>
      )('get_user_all_roles'),
    ]);

    const tugasTambahan =
      (teacherRes.data as { tugasTambahan?: string | null } | null)?.tugasTambahan ?? null;

    const dutyRoles = mapTugasTambahanToRoles(tugasTambahan);
    const rpcRoles = Array.isArray(rpcRes.data)
      ? (rpcRes.data as EffectiveUserRole[])
      : [];

    const mergedExtras = Array.from(
      new Set<EffectiveUserRole>([
        ...(profile.additionalRoles ?? []),
        ...dutyRoles,
        ...rpcRoles,
      ])
    ).filter((r) => r !== profile.role);

    return {
      ...profile,
      tugasTambahan,
      additionalRoles: mergedExtras,
    };
  } catch {
    return profile;
  }
}

/**
 * Mengubah identifier non-email (NIP, NUPTK, NISN, NIK) menjadi alamat email
 * yang terdaftar di Supabase Auth melalui fungsi RPC `resolve_user_email`.
 */
async function resolveLoginEmail(rawIdentifier: string): Promise<string> {
  const cleaned = rawIdentifier.trim().toLowerCase();

  if (cleaned.includes('@')) {
    return cleaned;
  }

  const { data, error } = await supabase.rpc('resolve_user_email', {
    identifier: cleaned,
  });

  if (!error && typeof data === 'string' && data.trim().length > 0) {
    return data.trim().toLowerCase();
  }

  return `${cleaned}@sistem.local`;
}

export const authService = {
  /**
   * Menjalankan alur login lengkap beserta pemuatan peran utama dan tugas tambahan.
   */
  async login(payload: LoginPayload): Promise<AuthResult> {
    try {
      const loginEmail = await resolveLoginEmail(payload.identifier);

      // 1. Verifikasi email & kata sandi ke layanan Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: payload.password,
      });

      if (authError || !authData.user) {
        return {
          success: false,
          data: null,
          message: 'Identitas pengguna atau kata sandi tidak sesuai.',
        };
      }

      const userId = authData.user.id;

      // 2. Ambil profil lengkap pengguna dari tabel public.users
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        await supabase.auth.signOut();
        return {
          success: false,
          data: null,
          message: 'Profil akun tidak ditemukan di database sekolah.',
        };
      }

      const baseProfile = normalizeUserProfile(profileData as Record<string, unknown>);

      // 3. Blokir akses apabila akun berstatus nonaktif (isActive = false)
      if (!baseProfile.isActive) {
        await supabase.auth.signOut();
        return {
          success: false,
          data: null,
          message: 'Akun Anda telah dinonaktifkan. Silakan hubungi Administrator Sekolah.',
        };
      }

      // 4. Catat waktu login terakhir dengan aman tanpa menggagalkan proses login
      try {
        await supabase
          .from('users')
          .update({ lastLogin: new Date().toISOString() })
          .eq('id', userId);
      } catch {
        // Abaikan jika gagal memperbarui stempel waktu login terakhir
      }

      // 5. Muat tugas tambahan guru, data sekolah, dan tahun ajaran aktif secara paralel
      const [enrichedProfile, schoolData, academicYearData] = await Promise.all([
        enrichProfileWithTeacherDuties(baseProfile),
        baseProfile.schoolId ? this.getSchool(baseProfile.schoolId) : Promise.resolve(null),
        baseProfile.schoolId
          ? this.getActiveAcademicYear(baseProfile.schoolId)
          : Promise.resolve(null),
      ]);

      return {
        success: true,
        data: {
          user: enrichedProfile,
          school: schoolData,
          academicYear: academicYearData,
        },
        message: 'Autentikasi berhasil.',
      };
    } catch (error: unknown) {
      return {
        success: false,
        data: null,
        message: extractErrorMessage(
          error,
          'Tidak dapat terhubung ke server autentikasi. Periksa koneksi jaringan Anda.'
        ),
      };
    }
  },

  /**
   * Mengakhiri sesi Supabase Auth dan membersihkan penyimpanan sesi lokal.
   */
  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } finally {
      AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem(SESSION_ONLY_FLAG_KEY);
    }
  },

  /**
   * Mengambil ulang data profil aktif beserta tugas tambahannya berdasarkan UUID pengguna.
   */
  async getProfile(
    userId: string
  ): Promise<{ success: boolean; data: UserWithAdditionalRoles | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('isActive', true)
        .single();

      if (error || !data) {
        return { success: false, data: null };
      }

      const normalized = normalizeUserProfile(data as Record<string, unknown>);
      const enriched = await enrichProfileWithTeacherDuties(normalized);

      return {
        success: true,
        data: enriched,
      };
    } catch {
      return { success: false, data: null };
    }
  },

  /**
   * Mengambil detail data sekolah berdasarkan ID sekolah.
   */
  async getSchool(schoolId: string): Promise<School | null> {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .maybeSingle();

      if (error || !data) return null;
      return data as School;
    } catch {
      return null;
    }
  },

  /**
   * Mengambil tahun ajaran aktif (`isActive = true`) atau tahun terbaru untuk sekolah tertentu.
   * Menggunakan `.limit(1)` agar aman dari error PGRST116 jika terdapat lebih dari satu baris aktif.
   */
  async getActiveAcademicYear(schoolId: string): Promise<AcademicYear | null> {
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('schoolId', schoolId)
        .order('isActive', { ascending: false })
        .order('startYear', { ascending: false })
        .limit(1);

      if (error || !Array.isArray(data) || data.length === 0) return null;
      return data[0] as AcademicYear;
    } catch {
      return null;
    }
  },
};