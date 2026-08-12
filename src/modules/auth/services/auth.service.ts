import { supabase } from '@/services/supabase.client';
import type { User, School, AcademicYear } from '@/types/common.types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  school: School;
  academicYear: AcademicYear;
}

export interface AuthResult {
  success: boolean;
  data: LoginResponse;
  message?: string;
}

export const authService = {
  /**
   * Login via Supabase RPC function `verify_login`
   * This calls a server-side PostgreSQL function that:
   * 1. Finds the user by email
   * 2. Verifies the password using pgcrypto/bcrypt
   * 3. Returns user + school + academic year data
   */
  async login(payload: LoginPayload): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.rpc('verify_login', {
        p_email: payload.email,
        p_password: payload.password,
      });

      if (error) {
        console.error('[AuthService] Supabase RPC error:', error);
        return {
          success: false,
          data: null as unknown as LoginResponse,
          message: 'Terjadi kesalahan server. Silakan coba lagi.',
        };
      }

      // The RPC returns a JSON object with success, message, user, school, academicYear
      if (!data || !data.success) {
        return {
          success: false,
          data: null as unknown as LoginResponse,
          message: data?.message || 'Email atau kata sandi salah',
        };
      }

      return {
        success: true,
        data: {
          user: data.user as User,
          school: data.school as School,
          academicYear: data.academicYear as AcademicYear,
        },
        message: data.message || 'Login berhasil',
      };
    } catch (err) {
      console.error('[AuthService] Login error:', err);
      return {
        success: false,
        data: null as unknown as LoginResponse,
        message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
      };
    }
  },

  /**
   * Logout — clear local state only (no server-side session to invalidate)
   */
  async logout(): Promise<void> {
    // No server-side session to clear since we use custom auth
    // State cleanup is handled by the auth store
    return;
  },

  /**
   * Get user profile by ID from Supabase
   */
  async getProfile(userId: string): Promise<{ success: boolean; data: User | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, "fullName", role, "avatarUrl", "schoolId", "isActive", "lastLogin"')
        .eq('id', userId)
        .eq('isActive', true)
        .single();

      if (error || !data) {
        return { success: false, data: null };
      }

      return {
        success: true,
        data: data as User,
      };
    } catch {
      return { success: false, data: null };
    }
  },

  /**
   * Get school data by ID
   */
  async getSchool(schoolId: string): Promise<School | null> {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single();

      if (error || !data) return null;
      return data as School;
    } catch {
      return null;
    }
  },

  /**
   * Get active academic year for a school
   */
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
