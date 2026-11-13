import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, School, AcademicYear } from '@/types/common.types';
import { authService } from '../services/auth.service';

/**
 * Kontrak hasil pemanggilan action `login` pada AuthStore.
 * Menyertakan objek `user` saat sukses agar komponen pemanggil
 * dapat menentukan rute tujuan (misalnya arahkan ke ganti sandi wajib).
 */
export interface StoreLoginResult {
  success: boolean;
  user?: User;
  message?: string;
}

/**
 * Definisi state dan aksi pada store autentikasi global.
 */
interface AuthState {
  user: User | null;
  school: School | null;
  academicYear: AcademicYear | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  setSchool: (school: School | null) => void;
  setAcademicYear: (year: AcademicYear | null) => void;
  setLoading: (loading: boolean) => void;

  login: (identifier: string, password: string) => Promise<StoreLoginResult>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      school: null,
      academicYear: null,
      isAuthenticated: false,
      isLoading: false,

      /** Memperbarui profil pengguna aktif di state global */
      setUser: (user) => set({ user, isAuthenticated: true }),

      /** Mengatur institusi sekolah aktif (digunakan saat login atau perpindahan tenant Super Admin) */
      setSchool: (school) => set({ school }),

      /** Mengatur tahun ajaran aktif yang menjadi konteks seluruh transaksi akademik & keuangan */
      setAcademicYear: (year) => set({ academicYear: year }),

      /** Mengatur status indikator pemuatan autentikasi */
      setLoading: (loading) => set({ isLoading: loading }),

      /**
       * Menjalankan proses login melalui `authService` dan menyimpan seluruh
       * konteks sesi (`user`, `school`, `academicYear`) ke dalam store.
       */
      login: async (identifier: string, password: string): Promise<StoreLoginResult> => {
        set({ isLoading: true });
        try {
          const response = await authService.login({ identifier, password });

          if (response.success) {
            set({
              user: response.data.user,
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
        set({
          user: null,
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
      // Hanya simpan data sesi penting ke localStorage (jangan simpan flag transient `isLoading`)
      partialize: (state) => ({
        user: state.user,
        school: state.school,
        academicYear: state.academicYear,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);