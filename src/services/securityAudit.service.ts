// src/services/securityAudit.service.ts
import { supabase } from '@/services/supabase.client';

const LOGIN_RECORDED_SESSION_KEY = 'erp_last_recorded_login_uid';

/**
 * Mencatat waktu login terakhir, alamat IP, dan info perangkat pengguna ke database.
 * Aman dipanggil saat proses login maupun saat inisialisasi sesi terautentikasi.
 */
export async function recordCurrentUserLoginActivity(options?: {
  force?: boolean;
}): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    if (!options?.force && typeof sessionStorage !== 'undefined') {
      const recordedUid = sessionStorage.getItem(LOGIN_RECORDED_SESSION_KEY);
      if (recordedUid === user.id) {
        return;
      }
    }

    const { error } = await supabase.rpc('record_user_login_activity', {
      p_client_ip: null,
    });

    if (!error && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(LOGIN_RECORDED_SESSION_KEY, user.id);
    }
  } catch {
    // Best-effort audit logging: jangan menghambat proses login pengguna
  }
}

/**
 * Menghapus penanda sesi login saat logout agar login berikutnya tercatat ulang.
 */
export function clearLoginActivitySessionMarker(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LOGIN_RECORDED_SESSION_KEY);
    }
  } catch {
    // Abaikan jika storage dibatasi
  }
}

/**
 * Mencatat aktivitas penggantian password (oleh pengguna sendiri atau reset oleh Admin/Super Admin)
 * lengkap dengan waktu, metode, dan alamat IP ke tabel users & audit_logs.
 */
export async function recordPasswordChangeActivity(params?: {
  targetUserId?: string | null;
  method?: 'SELF_CHANGE' | 'ADMIN_RESET';
}): Promise<void> {
  try {
    await supabase.rpc('record_password_change_activity', {
      p_target_user_id: params?.targetUserId ?? null,
      p_method: params?.method ?? 'SELF_CHANGE',
      p_client_ip: null,
    });
  } catch {
    // Fallback tetap terlindungi oleh trigger database pada auth.users
  }
}