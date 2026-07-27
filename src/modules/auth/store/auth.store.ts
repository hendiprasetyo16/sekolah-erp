import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, School, AcademicYear } from '../../../types/common.types';

interface AuthState {
  user: User | null;
  school: School | null;
  academicYear: AcademicYear | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  setSchool: (school: School) => void;
  setAcademicYear: (year: AcademicYear) => void;
  setTokens: (token: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      school: null,
      academicYear: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setSchool: (school) => set({ school }),
      setAcademicYear: (year) => set({ academicYear: year }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setLoading: (loading) => set({ isLoading: loading }),
      logout: () =>
        set({
          user: null,
          school: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'sekolah-erp-auth',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        school: state.school,
        academicYear: state.academicYear,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
