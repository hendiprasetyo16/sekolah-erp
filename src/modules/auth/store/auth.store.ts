// src/modules/auth/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { School, AcademicYear } from '@/types/common.types';
import {
  authService,
  mapTugasTambahanToRoles,
  type EffectiveUserRole,
  type UserWithAdditionalRoles,
} from '../services/auth.service';

const SESSION_ONLY_MODE_KEY = 'sekolah-erp-session-only-mode';
const SESSION_ALIVE_TAB_KEY = 'sekolah-erp-tab-alive';

/**
 * Kontrak hasil pemanggilan action `login` pada AuthStore.
 */
export interface StoreLoginResult {
  success: boolean;
  user?: UserWithAdditionalRoles;
  message?: string;
}

/**
 * Definisi state dan aksi pada store autentikasi global.
 */
interface AuthState {
  user: UserWithAdditionalRoles | null;
  activeRole: EffectiveUserRole | null;
  school: School | null;
  academicYear: AcademicYear | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: UserWithAdditionalRoles) => void;
  setSchool: (school: School | null) => void;
  setAcademicYear: (year: AcademicYear | null) => void;
  setLoading: (loading: boolean) => void;
  switchRole: (role: EffectiveUserRole) => void;

  getEffectiveRoles: () => EffectiveUserRole[];
  hasAnyRole: (allowedRoles: readonly string[]) => boolean;

  login: (
    identifier: string,
    password: string,
    rememberSession?: boolean
  ) => Promise<StoreLoginResult>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      activeRole: null,
      school: null,
      academicYear: null,
      isAuthenticated: false,
      isLoading: false,

      /** Memperbarui profil pengguna aktif di state global */
      setUser: (user) =>
        set((state) => ({
          user,
          activeRole: state.activeRole ?? user.role,
          isAuthenticated: true,
        })),

      /** Mengatur institusi sekolah aktif */
      setSchool: (school) => set({ school }),

      /** Mengatur tahun ajaran aktif */
      setAcademicYear: (year) => set({ academicYear: year }),

      /** Mengatur status indikator pemuatan autentikasi */
      setLoading: (loading) => set({ isLoading: loading }),

      /**
       * Mengganti peran aktif pengguna (opsional, untuk kompatibilitas).
       */
      switchRole: (role) => {
        const effectiveRoles = get().getEffectiveRoles();
        if (effectiveRoles.includes(role)) {
          set({ activeRole: role });
        }
      },

      /**
       * Mengembalikan daftar seluruh peran yang dimiliki pengguna
       * (Peran Utama + Additional Roles + Tugas Tambahan Dapodik).
       */
      getEffectiveRoles: (): EffectiveUserRole[] => {
        const currentUser = get().user;
        if (!currentUser) return [];

        const extras = Array.isArray(currentUser.additionalRoles)
          ? currentUser.additionalRoles
          : [];

        const dutyRoles = mapTugasTambahanToRoles(currentUser.tugasTambahan);

        return Array.from(
          new Set<EffectiveUserRole>([currentUser.role, ...extras, ...dutyRoles])
        );
      },

      /**
       * Mengecek apakah pengguna memiliki minimal satu peran dari daftar `allowedRoles`.
       */
      hasAnyRole: (allowedRoles: readonly string[]): boolean => {
        const effectiveRoles = get().getEffectiveRoles();
        return effectiveRoles.some((role) => allowedRoles.includes(role));
      },

      /**
       * Menjalankan proses login melalui `authService` dan menyimpan seluruh
       * konteks sesi (`user`, `activeRole`, `school`, `academicYear`) ke dalam store.
       */
      login: async (
        identifier: string,
        password: string,
        rememberSession = true
      ): Promise<StoreLoginResult> => {
        set({ isLoading: true });
        try {
          const response = await authService.login({ identifier, password });

          if (response.success) {
            if (rememberSession) {
              localStorage.removeItem(SESSION_ONLY_MODE_KEY);
              sessionStorage.removeItem(SESSION_ALIVE_TAB_KEY);
            } else {
              localStorage.setItem(SESSION_ONLY_MODE_KEY, '1');
              sessionStorage.setItem(SESSION_ALIVE_TAB_KEY, '1');
            }

            set({
              user: response.data.user,
              activeRole: response.data.user.role,
              school: response.data.school,
              academicYear: response.data.academicYear,
              isAuthenticated: true,
              isLoading: false,
            });

            return {
              success: true,
              user: response.data.user,
              message: response.message,
            };
          }

          set({ isLoading: false });
          return {
            success: false,
            message: response.message,
          };
        } catch {
          set({ isLoading: false });
          return {
            success: false,
            message: 'Terjadi gangguan sistem saat memproses login. Silakan coba kembali.',
          };
        }
      },

      /**
       * Menghapus sesi lokal terlebih dahulu agar transisi UI ke halaman login instan,
       * sekaligus mengakhiri sesi di server Supabase Auth.
       */
      logout: async (): Promise<void> => {
        localStorage.removeItem(SESSION_ONLY_MODE_KEY);
        sessionStorage.removeItem(SESSION_ALIVE_TAB_KEY);
        set({
          user: null,
          activeRole: null,
          school: null,
          academicYear: null,
          isAuthenticated: false,
          isLoading: false,
        });
        await authService.logout();
      },
    }),
    {
      name: 'sekolah-erp-auth',
      partialize: (state) => ({
        user: state.user,
        activeRole: state.activeRole,
        school: state.school,
        academicYear: state.academicYear,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Jika pengguna memilih tidak menyimpan sesi ("Ingat Saya" tidak dicentang)
        // dan browser baru dibuka kembali, bersihkan sesi secara otomatis.
        if (
          typeof window !== 'undefined' &&
          localStorage.getItem(SESSION_ONLY_MODE_KEY) === '1' &&
          sessionStorage.getItem(SESSION_ALIVE_TAB_KEY) !== '1' &&
          state?.isAuthenticated
        ) {
          void state.logout();
        }
      },
    }
  )
);