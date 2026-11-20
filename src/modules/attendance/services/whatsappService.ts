// src/modules/attendance/services/whatsappService.ts
import { supabase } from '@/services/supabase.client';
import type {
  SchoolWaConfig,
  StudentWaRecipientResult,
  WaGatewayProvider,
} from '../types/attendance.types';

export type { SchoolWaConfig, WaGatewayProvider };

export const WA_PROVIDER_PRESETS: Record<
  WaGatewayProvider,
  { label: string; defaultUrl: string; tokenHint: string }
> = {
  FONNTE: {
    label: 'Fonnte (Rekomendasi)',
    defaultUrl: 'https://api.fonnte.com/send',
    tokenHint: 'Masukkan Device Token dari dashboard Fonnte',
  },
  WABLAS: {
    label: 'Wablas',
    defaultUrl: 'https://pati.wablas.com/api/send-message',
    tokenHint: 'Masukkan Token API dari dashboard Wablas',
  },
  WOOWA: {
    label: 'WooWA / NotifWA',
    defaultUrl: 'http://116.203.191.58/api/send_message',
    tokenHint: 'Masukkan License Key WooWA',
  },
  CUSTOM: {
    label: 'Custom Webhook / Gateway Mandiri',
    defaultUrl: 'https://gateway-sekolah.anda/api/whatsapp/send',
    tokenHint: 'Bearer Token otorisasi endpoint mandiri',
  },
};

export async function getSchoolWaConfig(
  schoolId: string
): Promise<SchoolWaConfig> {
  const { data, error } = await supabase
    .from('school_wa_configs')
    .select('*')
    .eq('schoolId', schoolId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return data as SchoolWaConfig;
  }

  return {
    schoolId,
    isEnabled: false,
    provider: 'FONNTE',
    apiUrl: WA_PROVIDER_PRESETS.FONNTE.defaultUrl,
    apiToken: '',
    senderNumber: '',
    customHeaders: {},
    notifyOnCheckIn: true,
    notifyOnLate: true,
    notifyOnCheckOut: true,
    templateCheckIn:
      "Assalamu'alaikum Bapak/Ibu, ananda *{nama_siswa}* ({kelas}) telah tiba di *{nama_sekolah}* pada pukul *{waktu}* WIB (Status: *{status}*). Terima kasih.",
    templateCheckOut:
      "Assalamu'alaikum Bapak/Ibu, ananda *{nama_siswa}* ({kelas}) telah melakukan presensi pulang dari *{nama_sekolah}* pada pukul *{waktu}* WIB. Terima kasih.",
  };
}

export async function saveSchoolWaConfig(
  config: SchoolWaConfig
): Promise<void> {
  const { error } = await supabase.from('school_wa_configs').upsert(
    {
      schoolId: config.schoolId,
      isEnabled: config.isEnabled,
      provider: config.provider,
      apiUrl: config.apiUrl.trim(),
      apiToken: config.apiToken.trim(),
      senderNumber: config.senderNumber?.trim() || null,
      customHeaders: config.customHeaders || {},
      notifyOnCheckIn: config.notifyOnCheckIn,
      notifyOnLate: config.notifyOnLate,
      notifyOnCheckOut: config.notifyOnCheckOut,
      templateCheckIn: config.templateCheckIn,
      templateCheckOut: config.templateCheckOut,
    },
    { onConflict: 'schoolId' }
  );

  if (error) throw error;
}

/**
 * Mengirim notifikasi WA presensi siswa secara asynchronous (non-blocking)
 * agar tidak memperlambat antrean scan kartu pelajar di layar Kiosk / APK.
 */
export async function dispatchStudentAttendanceWhatsApp(params: {
  studentId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  timeFormatted: string;
  status: string;
}): Promise<void> {
  try {
    const { data, error: rpcError } = await supabase.rpc(
      'get_student_wa_recipient',
      {
        p_student_id: params.studentId,
      }
    );

    const target = data as StudentWaRecipientResult | null;
    if (rpcError || !target?.eligible) return;

    await supabase.functions.invoke('send-whatsapp', {
      body: {
        schoolId: target.schoolId,
        eventType: params.eventType,
        recipientPhone: target.phone,
        studentId: params.studentId,
        variables: {
          nama_siswa: target.studentName,
          kelas: target.className,
          waktu: params.timeFormatted,
          status: params.status,
          nama_sekolah: target.schoolName,
        },
      },
    });
  } catch (err) {
    console.warn('[WA Gateway] Notifikasi dilewati:', err);
  }
}

export async function sendTestWhatsAppMessage(
  schoolId: string,
  testPhone: string
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: {
      schoolId,
      eventType: 'TEST',
      recipientPhone: testPhone,
      customTestMessage:
        '✅ *Tes Koneksi Berhasil!* Sistem Presensi Sekolah telah terhubung dengan WhatsApp Gateway Anda.',
    },
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: Boolean(data?.success),
    message: data?.success
      ? 'Pesan uji coba berhasil dikirim ke nomor tujuan.'
      : 'Gateway merespons gagal. Periksa kembali API URL dan Token Anda.',
  };
}