import { supabase } from '@/services/supabase.client';
import type { User, School, AcademicYear } from '@/types/common.types';

export interface LoginPayload {
  identifier: string; 
  password: string;
  // PERBAIKAN: loginAs dihapus dari payload
}

export interface LoginResponse {
  user: User;
  school: School | null;
  academicYear: AcademicYear | null;
}

export interface AuthResult {
  success: boolean;
  data: LoginResponse;
  message?: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResult> {
    try {
      // 1. LOGIKA DUMMY EMAIL
      const cleanIdentifier = payload.identifier.trim().toLowerCase();
      
      // PERBAIKAN KUNCI: Ubah @sekolah.local menjadi @sistem.local sesuai Edge Function
      const loginEmail = cleanIdentifier.includes('@')
        ? cleanIdentifier
        : `${cleanIdentifier}@sistem.local`;

      // 2. Verifikasi Email & Password melalui Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: payload.password,
      });

      if (authError || !authData.user) {
        console.error('[AuthService] Auth error:', authError);
        return {
          success: false,
          data: null as unknown as LoginResponse,
          message: 'Email/Username atau kata sandi salah.',
        };
      }

      const userId = authData.user.id;

      // 3. Ambil Profil User dari public.users
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        return {
          success: false,
          data: null as unknown as LoginResponse,
          message: 'Profil pengguna tidak ditemukan di sistem.',
        };
      }

      // 4. Ambil Data Sekolah dan Tahun Ajaran Aktif
      let schoolData = null;
      let academicYearData = null;

      if (profile.schoolId) {
        const [schoolRes, ayRes] = await Promise.all([
          supabase.from('schools').select('*').eq('id', profile.schoolId).single(),
          supabase.from('academic_years').select('*').eq('schoolId', profile.schoolId).eq('isActive', true).maybeSingle()
        ]);

        schoolData = schoolRes.data || null;
        academicYearData = ayRes.data || null;
      }

      return {
        success: true,
        data: {
          user: profile as User,
          school: schoolData as School | null,
          academicYear: academicYearData as AcademicYear | null,
        },
        message: 'Login berhasil',
      };
    } catch (err) {
      console.error('[AuthService] Login Exception:', err);
      return {
        success: false,
        data: null as unknown as LoginResponse,
        message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
      };
    }
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    localStorage.removeItem('auth-storage');
    localStorage.clear();
  },

  async getProfile(userId: string): Promise<{ success: boolean; data: User | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, "fullName", role, "avatarUrl", "schoolId", "isActive", "lastLogin"')
        .eq('id', userId)
        .eq('isActive', true)
        .single();

      if (error || !data) return { success: false, data: null };
      return { success: true, data: data as User };
    } catch {
      return { success: false, data: null };
    }
  },

  async getSchool(schoolId: string): Promise<School | null> {
    try {
      const { data, error } = await supabase.from('schools').select('*').eq('id', schoolId).single();
      if (error || !data) return null;
      return data as School;
    } catch {
      return null;
    }
  },

  async getActiveAcademicYear(schoolId: string): Promise<AcademicYear | null> {
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('schoolId', schoolId)
        .eq('isActive', true)
        .single();

      if (error || !data) return null;
      return data as AcademicYear;
    } catch {
      return null;
    }
  },
};