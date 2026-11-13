import { supabase } from '@/services/supabase.client';
import type { User, School, AcademicYear } from '@/types/common.types';

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
  user: User;
  school: School | null;
  academicYear: AcademicYear | null;
}

/**
 * Discriminated Union untuk hasil autentikasi.
 * Memastikan TypeScript mengenali bahwa `data` selalu tersedia jika `success === true`,
 * dan selalu `null` jika `success === false` tanpa perlu type-casting paksa.
 */
export type AuthResult =
  | { success: true; data: LoginResponse; message: string }
  | { success: false; data: null; message: string };

/**
 * Daftar key localStorage yang berkaitan dengan sesi autentikasi.
 * Digunakan saat logout agar preferensi UI (tema & bahasa) tidak ikut terhapus.
 */
const AUTH_STORAGE_KEYS = ['sekolah-erp-auth', 'auth-storage'] as const;

/**
 * Helper aman untuk mengekstrak pesan error dari tipe `unknown`
 * tanpa menggunakan tipe `any`.
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
 * Mengubah identifier non-email (NIP, NUPTK, NISN, NIK) menjadi alamat email
 * yang terdaftar di Supabase Auth melalui fungsi RPC `resolve_user_email`.
 *
 * @param rawIdentifier - Teks yang diketik pengguna pada kolom login
 * @returns Alamat email valid untuk proses `signInWithPassword`
 */
async function resolveLoginEmail(rawIdentifier: string): Promise<string> {
  const cleaned = rawIdentifier.trim().toLowerCase();

  // Jika input sudah mengandung '@', perlakukan langsung sebagai email
  if (cleaned.includes('@')) {
    return cleaned;
  }

  // Panggil fungsi RPC PostgreSQL untuk mencari email asli dari tabel teachers/students
  const { data, error } = await supabase.rpc('resolve_user_email', {
    identifier: cleaned,
  });

  if (!error && typeof data === 'string' && data.trim().length > 0) {
    return data.trim().toLowerCase();
  }

  // Fallback standar untuk akun hasil generate massal yang belum memiliki email pribadi
  return `${cleaned}@sistem.local`;
}

export const authService = {
  /**
   * Menjalankan alur login lengkap:
   * 1. Resolusi identifier menjadi email.
   * 2. Verifikasi kredensial ke Supabase Auth.
   * 3. Validasi profil & status aktif (`isActive`) pada tabel `public.users`.
   * 4. Pembaruan stempel waktu `lastLogin`.
   * 5. Pengambilan data sekolah & tahun ajaran aktif (jika terikat ke sekolah).
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

      const profile = profileData as User;

      // 3. Blokir akses apabila akun berstatus nonaktif (isActive = false)
      if (!profile.isActive) {
        await supabase.auth.signOut();
        return {
          success: false,
          data: null,
          message: 'Akun Anda telah dinonaktifkan. Silakan hubungi Administrator Sekolah.',
        };
      }

      // 4. Catat waktu login terakhir secara non-blocking (tidak menggagalkan login jika gagal)
      void supabase
        .from('users')
        .update({ lastLogin: new Date().toISOString() })
        .eq('id', userId);

      // 5. Muat data sekolah & tahun ajaran aktif secara paralel (kecuali SUPER_ADMIN)
      let schoolData: School | null = null;
      let academicYearData: AcademicYear | null = null;

      if (profile.schoolId) {
        const [schoolRes, academicYearRes] = await Promise.all([
          supabase.from('schools').select('*').eq('id', profile.schoolId).maybeSingle(),
          supabase
            .from('academic_years')
            .select('*')
            .eq('schoolId', profile.schoolId)
            .eq('isActive', true)
            .maybeSingle(),
        ]);

        schoolData = (schoolRes.data as School | null) ?? null;
        academicYearData = (academicYearRes.data as AcademicYear | null) ?? null;
      }

      return {
        success: true,
        data: {
          user: profile,
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
   * Mengakhiri sesi Supabase Auth dan membersihkan penyimpanan sesi lokal
   * tanpa menghapus pengaturan tema/bahasa pengguna.
   */
  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } finally {
      AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    }
  },

  /**
   * Mengambil ulang data profil aktif berdasarkan UUID pengguna.
   */
  async getProfile(userId: string): Promise<{ success: boolean; data: User | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, "fullName", role, "avatarUrl", "schoolId", "isActive", "isFirstLogin", "lastLogin"')
        .eq('id', userId)
        .eq('isActive', true)
        .single();

      if (error || !data) {
        return { success: false, data: null };
      }

      return { success: true, data: data as User };
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
   * Mengambil tahun ajaran yang sedang aktif (`isActive = true`) untuk sekolah tertentu.
   */
  async getActiveAcademicYear(schoolId: string): Promise<AcademicYear | null> {
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('schoolId', schoolId)
        .eq('isActive', true)
        .maybeSingle();

      if (error || !data) return null;
      return data as AcademicYear;
    } catch {
      return null;
    }
  },
};