import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, School, AcademicYear } from '../../../types/common.types';
import { authService } from '../services/auth.service';

interface AuthState {
  user: User | null;
  school: School | null;
  academicYear: AcademicYear | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  setSchool: (school: School) => void;
  setAcademicYear: (year: AcademicYear) => void;
  setLoading: (loading: boolean) => void;

  // PERBAIKAN: Menghapus parameter loginAs karena sistem username sudah unik
  login: (identifier: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      school: null,
      academicYear: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setSchool: (school) => set({ school }),
      setAcademicYear: (year) => set({ academicYear: year }),
      setLoading: (loading) => set({ isLoading: loading }),

      login: async (identifier: string, password: string) => {
        set({ isLoading: true });
        try {
          // PERBAIKAN: Hanya mengirimkan identifier dan password ke service
          const response = await authService.login({ identifier, password });

          if (response.success && response.data) {
            set({
              user: response.data.user,
              school: response.data.school,
              academicYear: response.data.academicYear,
              isAuthenticated: true,
              isLoading: false,
            });
            return { success: true, message: response.message };
          }

          set({ isLoading: false });
          return { success: false, message: response.message };
        } catch (err) {
          console.error('[AuthStore] Login error:', err);
          set({ isLoading: false });
          return {
            success: false,
            message: 'Terjadi kesalahan. Silakan coba lagi.',
          };
        }
      },

      logout: () => {
        authService.logout();
        set({
          user: null,
          school: null,
          academicYear: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'sekolah-erp-auth',
      partialize: (state) => ({
        user: state.user,
        school: state.school,
        academicYear: state.academicYear,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);