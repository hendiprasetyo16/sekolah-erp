// @ts-nocheck
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CallerRow {
  id: string
  schoolId: string | null
  role: string
  isActive: boolean
}

interface TargetUserRow {
  id: string
  schoolId: string | null
  role: string
  isActive: boolean
}

class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

async function authorize(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<CallerRow> {
  const authorization = req.headers.get('Authorization') || ''
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)

  if (!tokenMatch) {
    throw new HttpError(
      'Sesi login tidak ditemukan. Silakan login kembali.',
      401,
    )
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(tokenMatch[1].trim())

  if (authError || !authData?.user) {
    throw new HttpError(
      'Sesi login tidak valid atau sudah kedaluwarsa.',
      401,
    )
  }

  const { data: callerData, error } = await supabaseAdmin
    .from('users')
    .select('id, "schoolId", role, "isActive"')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (error) {
    throw new HttpError('Gagal memverifikasi profil pemanggil.', 500)
  }

  const caller = callerData as CallerRow | null

  if (!caller || caller.isActive !== true) {
    throw new HttpError('Akun Anda tidak aktif atau profil tidak ditemukan.', 403)
  }

  if (caller.role !== 'SUPER_ADMIN' && caller.role !== 'ADMIN') {
    throw new HttpError(
      'Anda tidak memiliki izin untuk mereset kata sandi.',
      403,
    )
  }

  if (caller.role === 'SUPER_ADMIN' && caller.schoolId !== null) {
    throw new HttpError('Konfigurasi akun SUPER_ADMIN tidak valid.', 403)
  }

  if (caller.role === 'ADMIN' && !caller.schoolId) {
    throw new HttpError('Akun ADMIN belum terhubung ke sekolah.', 403)
  }

  return caller
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metode request tidak diizinkan.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Konfigurasi Supabase belum lengkap.' }, 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const caller = await authorize(req, supabaseAdmin)

    let body: Record<string, unknown>
    try {
      const parsed: unknown = await req.json()
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON')
      }
      body = parsed as Record<string, unknown>
    } catch {
      throw new HttpError('Body JSON tidak valid.', 400)
    }

    const { targetUserId, newPassword } = body

    if (!isValidUuid(targetUserId)) {
      throw new HttpError('ID pengguna tidak valid.', 400)
    }

    if (
      typeof newPassword !== 'string' ||
      newPassword.length < 8 ||
      newPassword.length > 72
    ) {
      throw new HttpError(
        'Kata sandi baru harus terdiri dari 8–72 karakter.',
        400,
      )
    }

    const { data: targetData, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, "schoolId", role, "isActive"')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetError) {
      throw new HttpError('Gagal memeriksa akun tujuan.', 500)
    }

    const target = targetData as TargetUserRow | null

    if (!target) {
      throw new HttpError(
        'Profil pengguna tidak ditemukan. Pastikan akun sudah dibuat.',
        404,
      )
    }

    if (target.role === 'SUPER_ADMIN') {
      throw new HttpError(
        'Kata sandi SUPER_ADMIN tidak dapat diubah melalui fungsi ini.',
        403,
      )
    }

    if (caller.role === 'ADMIN') {
      if (target.schoolId !== caller.schoolId) {
        throw new HttpError(
          'Anda hanya dapat mengelola pengguna dari sekolah sendiri.',
          403,
        )
      }

      if (target.role === 'ADMIN') {
        throw new HttpError(
          'ADMIN tidak diizinkan mereset kata sandi akun ADMIN lain.',
          403,
        )
      }
    }

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      })

    if (updateError) {
      console.error('Reset password failed:', updateError.message)
      throw new HttpError('Gagal memperbarui kata sandi akun.', 500)
    }

    // OPSIONAL: Aktifkan blok di bawah ini jika pengguna wajib mengganti sandi saat login berikutnya
    // await supabaseAdmin
    //   .from('users')
    //   .update({ isFirstLogin: true, updatedAt: new Date().toISOString() })
    //   .eq('id', targetUserId)

    return jsonResponse({
      success: true,
      message: 'Kata sandi berhasil direset.',
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message =
      error instanceof HttpError
        ? error.message
        : 'Terjadi kesalahan internal pada server.'

    if (!(error instanceof HttpError)) {
      console.error('Kesalahan internal reset-password:', error)
    }

    return jsonResponse({ error: message }, status)
  }
})