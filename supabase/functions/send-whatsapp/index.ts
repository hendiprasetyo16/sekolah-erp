// supabase/functions/send-whatsapp/index.ts
// @ts-nocheck
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendWaPayload {
  schoolId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'TEST';
  recipientPhone: string;
  studentId?: string;
  variables?: {
    nama_siswa?: string;
    kelas?: string;
    waktu?: string;
    status?: string;
    nama_sekolah?: string;
  };
  customTestMessage?: string;
}

/**
 * Helper pembantu untuk membuat respons JSON dengan header CORS standar
 */
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Normalisasi nomor HP Indonesia ke format internasional 628xxx
 */
function normalizeIndonesianPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

/**
 * Mengganti placeholder {variabel} pada template pesan WhatsApp
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return (template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '-');
}

serve(async (req: Request): Promise<Response> => {
  // 1. Tangani preflight request CORS dari browser / APK
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metode request tidak diizinkan.' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized: Token tidak ditemukan.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { error: 'Konfigurasi environment Supabase belum lengkap.' },
        500
      );
    }

    // 2. Verifikasi sesi JWT pengguna yang memanggil fungsi
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Sesi pengguna tidak valid.' }, 401);
    }

    const body = (await req.json()) as SendWaPayload;
    if (!body.schoolId) {
      return jsonResponse({ error: 'Parameter schoolId wajib disertakan.' }, 400);
    }
    if (!body.recipientPhone || !body.recipientPhone.trim()) {
      return jsonResponse(
        { error: 'Parameter recipientPhone wajib disertakan.' },
        400
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2b. Validasi isolasi tenant pada tabel public.users
    const { data: callerProfile, error: profError } = await adminClient
      .from('users')
      .select('schoolId, role, isActive')
      .eq('id', user.id)
      .single();

    if (
      profError ||
      !callerProfile ||
      !callerProfile.isActive ||
      (callerProfile.role !== 'SUPER_ADMIN' &&
        callerProfile.schoolId !== body.schoolId)
    ) {
      return jsonResponse(
        { error: 'Forbidden: Anda tidak memiliki akses ke sekolah ini.' },
        403
      );
    }

    // 3. Ambil konfigurasi WhatsApp Gateway sekolah dari database
    const { data: config, error: cfgError } = await adminClient
      .from('school_wa_configs')
      .select('*')
      .eq('schoolId', body.schoolId)
      .single();

    if (cfgError || !config) {
      return jsonResponse({
        skipped: true,
        reason: 'Konfigurasi WA belum diatur untuk sekolah ini.',
      });
    }

    if (!config.isEnabled && body.eventType !== 'TEST') {
      return jsonResponse({
        skipped: true,
        reason: 'Integrasi WA sedang dinonaktifkan.',
      });
    }

    if (!config.apiUrl || !config.apiToken) {
      return jsonResponse({
        skipped: true,
        reason: 'API URL atau API Token WhatsApp Gateway belum diisi.',
      });
    }

    // 4. Filter pengiriman berdasarkan jenis event presensi
    if (body.eventType === 'CHECK_IN') {
      const isLate = body.variables?.status === 'TERLAMBAT';
      if (!config.notifyOnCheckIn && !(isLate && config.notifyOnLate)) {
        return jsonResponse({
          skipped: true,
          reason: 'Notifikasi presensi datang dimatikan.',
        });
      }
    }

    if (body.eventType === 'CHECK_OUT' && !config.notifyOnCheckOut) {
      return jsonResponse({
        skipped: true,
        reason: 'Notifikasi presensi pulang dimatikan.',
      });
    }

    // 5. Susun nomor tujuan & isi pesan dari template
    const phone = normalizeIndonesianPhone(body.recipientPhone);
    if (phone.length < 9) {
      return jsonResponse({ error: 'Format nomor HP penerima tidak valid.' }, 400);
    }

    const defaultTemplateCheckIn =
      'Yth. Orang Tua/Wali, ananda {nama_siswa} ({kelas}) tercatat {status} pada pukul {waktu} di {nama_sekolah}.';
    const defaultTemplateCheckOut =
      'Yth. Orang Tua/Wali, ananda {nama_siswa} ({kelas}) telah presensi PULANG pada pukul {waktu} di {nama_sekolah}.';

    const message =
      body.eventType === 'TEST'
        ? body.customTestMessage ||
          'Uji coba koneksi WhatsApp Gateway ERP Sekolah berhasil!'
        : renderTemplate(
            body.eventType === 'CHECK_OUT'
              ? config.templateCheckOut || defaultTemplateCheckOut
              : config.templateCheckIn || defaultTemplateCheckIn,
            {
              nama_siswa: body.variables?.nama_siswa || '-',
              kelas: body.variables?.kelas || '-',
              waktu: body.variables?.waktu || '-',
              status: body.variables?.status || 'HADIR',
              nama_sekolah: body.variables?.nama_sekolah || 'Sekolah',
            }
          );

    // 6. Adaptor Multi-Provider Dinamis (Fonnte, Wablas, WooWA, Custom)
    let providerRes: Response;
    const customHeaders = (config.customHeaders as Record<string, string>) || {};

    switch (config.provider) {
      case 'FONNTE': {
        const form = new URLSearchParams();
        form.append('target', phone);
        form.append('message', message);
        providerRes = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: config.apiToken,
            ...customHeaders,
          },
          body: form,
        });
        break;
      }
      case 'WABLAS': {
        providerRes = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: config.apiToken,
            'Content-Type': 'application/json',
            ...customHeaders,
          },
          body: JSON.stringify({ phone, message }),
        });
        break;
      }
      case 'WOOWA': {
        providerRes = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...customHeaders,
          },
          body: JSON.stringify({
            key: config.apiToken,
            phone_no: phone,
            message,
          }),
        });
        break;
      }
      case 'CUSTOM':
      default: {
        providerRes = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
            ...customHeaders,
          },
          body: JSON.stringify({
            to: phone,
            phone,
            message,
            sender: config.senderNumber,
            eventType: body.eventType,
          }),
        });
        break;
      }
    }

    const rawText = await providerRes.text();
    let parsedJson: Record<string, unknown> = { raw: rawText };
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      // Tetap simpan raw text jika provider membalas non-JSON
    }

    const isSuccess = providerRes.ok && parsedJson?.status !== false;

    // 7. Simpan riwayat pengiriman ke tabel log database
    await adminClient.from('wa_notification_logs').insert({
      schoolId: body.schoolId,
      studentId: body.studentId || null,
      recipientPhone: phone,
      eventType: body.eventType,
      messageBody: message,
      status: isSuccess ? 'SENT' : 'FAILED',
      providerResponse: parsedJson,
      errorMessage: isSuccess
        ? null
        : `HTTP ${providerRes.status}: ${rawText.slice(0, 250)}`,
    });

    return jsonResponse(
      { success: isSuccess, providerResponse: parsedJson },
      isSuccess ? 200 : 502
    );
  } catch (err: unknown) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Terjadi kesalahan internal.',
      },
      500
    );
  }
});