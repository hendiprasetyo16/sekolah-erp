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

const VALID_ROLES = [
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'BENDAHARA',
  'WALI_KELAS',
  'GURU',
  'STAFF_TU',
  'STAFF_SARPRAS',
  'ORANG_TUA',
  'SISWA',
] as const

type AllowedRole = (typeof VALID_ROLES)[number]

interface CallerRow {
  id: string
  schoolId: string | null
  role: string
  isActive: boolean
}

interface ExistingProfileRow {
  id: string
  schoolId: string | null
  role: string
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

function formatAuthErrorReason(rawMessage: string): string {
  const lower = rawMessage.toLowerCase()
  if (
    lower.includes('already been registered') ||
    lower.includes('already exists') ||
    lower.includes('duplicate')
  ) {
    return 'Alamat email ini sudah terdaftar di sistem autentikasi.'
  }
  return 'Gagal membuat akun Auth. Periksa kembali format email dan kata sandi.'
}

async function rollbackAuthUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('Rollback Auth gagal:', userId, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Kesalahan saat rollback Auth:', userId, err)
    return false
  }
}

async function authorize(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<CallerRow> {
  const header = req.headers.get('Authorization') || ''
  const tokenMatch = header.match(/^Bearer\s+(.+)$/i)

  if (!tokenMatch) {
    throw new HttpError('Sesi login tidak ditemukan.', 401)
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(tokenMatch[1].trim())

  if (authError || !authData?.user) {
    throw new HttpError('Sesi login tidak valid atau telah berakhir.', 401)
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

  if (!['SUPER_ADMIN', 'ADMIN'].includes(caller.role)) {
    throw new HttpError('Anda tidak memiliki izin membuat akun.', 403)
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

  let createdAuthId: string | null = null

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

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const role = body.role
    const schoolId = body.schoolId
    const existingUserId = body.existingUserId
    const useDefaultPassword = body.useDefaultPassword === true

    // Tentukan password: dari secret server (jika useDefaultPassword) atau dari input form
    let resolvedPassword = ''
    if (useDefaultPassword) {
      const initialPassword = Deno.env.get('INITIAL_ACCOUNT_PASSWORD') || ''
      if (!initialPassword || initialPassword.length < 12) {
        throw new HttpError(
          'Secret INITIAL_ACCOUNT_PASSWORD belum diatur atau kurang dari 12 karakter.',
          500,
        )
      }
      resolvedPassword = initialPassword
    } else {
      resolvedPassword = typeof body.password === 'string' ? body.password : ''
      if (resolvedPassword.length < 8 || resolvedPassword.length > 72) {
        throw new HttpError('Kata sandi harus terdiri dari 8–72 karakter.', 400)
      }
    }

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError('Alamat email tidak valid.', 400)
    }

    if (!fullName || fullName.length > 150) {
      throw new HttpError(
        'Nama lengkap wajib diisi dan maksimal 150 karakter.',
        400,
      )
    }

    if (typeof role !== 'string' || !VALID_ROLES.includes(role as AllowedRole)) {
      throw new HttpError('Role yang diminta tidak diizinkan.', 400)
    }

    if (!isValidUuid(schoolId)) {
      throw new HttpError(
        'schoolId wajib diisi dengan ID sekolah yang valid.',
        400,
      )
    }

    if (caller.role === 'ADMIN' && role === 'ADMIN') {
      throw new HttpError('ADMIN tidak diizinkan membuat akun ADMIN lain.', 403)
    }

    if (caller.role === 'ADMIN' && schoolId !== caller.schoolId) {
      throw new HttpError(
        'Anda hanya dapat membuat akun untuk sekolah sendiri.',
        403,
      )
    }

    const { data: schoolData, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .maybeSingle()

    if (schoolError) {
      throw new HttpError('Gagal memeriksa data sekolah.', 500)
    }
    if (!schoolData) {
      throw new HttpError('Satuan pendidikan tidak ditemukan.', 404)
    }

    let userId: string

    // =========================================================
    // JALUR 1: PEMBARUAN / RESET AKUN YANG SUDAH ADA (GENERATE TERPILIH)
    // =========================================================
    if (existingUserId !== undefined && existingUserId !== null) {
      if (!isValidUuid(existingUserId)) {
        throw new HttpError('existingUserId tidak valid.', 400)
      }

      if (existingUserId === caller.id) {
        throw new HttpError(
          'Anda tidak dapat mengganti kredensial akun sendiri melalui fungsi ini.',
          400,
        )
      }

      const { data: authLookup, error: authLookupError } =
        await supabaseAdmin.auth.admin.getUserById(existingUserId)

      if (authLookupError || !authLookup?.user) {
        throw new HttpError(
          'Akun Auth yang akan dihubungkan tidak ditemukan.',
          404,
        )
      }

      userId = authLookup.user.id

      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('users')
        .select('id, "schoolId", role')
        .eq('id', userId)
        .maybeSingle()

      if (profileError) {
        throw new HttpError('Gagal memeriksa profil akun.', 500)
      }

      const existingProfile = profileData as ExistingProfileRow | null

      if (existingProfile?.role === 'SUPER_ADMIN') {
        throw new HttpError(
          'Akun SUPER_ADMIN tidak dapat diubah melalui fungsi ini.',
          403,
        )
      }

      if (
        caller.role === 'ADMIN' &&
        existingProfile &&
        (existingProfile.schoolId !== caller.schoolId ||
          existingProfile.role === 'ADMIN')
      ) {
        throw new HttpError('Anda tidak berwenang mengubah akun tersebut.', 403)
      }

      if (existingProfile && existingProfile.schoolId !== schoolId) {
        throw new HttpError(
          'Akun sudah terhubung ke sekolah lain. Pemindahan sekolah harus dilakukan melalui alur khusus.',
          409,
        )
      }

      const { error: updateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          password: resolvedPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            school_id: schoolId,
            initial_account: useDefaultPassword,
          },
        })

      if (updateAuthError) {
        console.error('Existing Auth update failed:', updateAuthError.message)
        throw new HttpError(
          'Gagal memperbarui kredensial akun yang sudah ada.',
          500,
        )
      }

      const profilePayload = {
        email,
        fullName,
        role,
        schoolId,
        isActive: true,
        isFirstLogin: true,
      }

      if (existingProfile) {
        const { data: updatedProfile, error: updateProfileError } =
          await supabaseAdmin
            .from('users')
            .update(profilePayload)
            .eq('id', userId)
            .select('id')
            .maybeSingle()

        if (updateProfileError || !updatedProfile) {
          console.error(
            'Existing profile update failed:',
            updateProfileError?.message,
          )
          return jsonResponse(
            {
              error:
                'Kredensial Auth telah diperbarui, tetapi profil gagal diperbarui. Periksa akun sebelum mencoba lagi.',
              authUpdated: true,
              userId,
            },
            500,
          )
        }
      } else {
        const { error: insertProfileError } = await supabaseAdmin
          .from('users')
          .insert({ id: userId, ...profilePayload })

        if (insertProfileError) {
          console.error('Profile insert failed:', insertProfileError.message)
          return jsonResponse(
            {
              error:
                'Kredensial Auth telah diperbarui, tetapi pembuatan profil gagal. Periksa akun sebelum mencoba lagi.',
              authUpdated: true,
              userId,
            },
            500,
          )
        }
      }

      return jsonResponse({
        success: true,
        message: 'Profil akun yang sudah ada berhasil diperbarui.',
        userId,
      })
    }

    // =========================================================
    // JALUR 2: PEMBUATAN AKUN BARU (AUTH + PROFIL)
    // =========================================================
    const { data: authData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: resolvedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          school_id: schoolId,
          initial_account: useDefaultPassword,
        },
      })

    if (createAuthError || !authData?.user) {
      console.error('Auth create failed:', createAuthError?.message)
      throw new HttpError(
        formatAuthErrorReason(createAuthError?.message || ''),
        400,
      )
    }

    userId = authData.user.id
    createdAuthId = userId

    const { error: insertProfileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        email,
        fullName,
        role,
        schoolId,
        isActive: true,
        isFirstLogin: true,
      })

    if (insertProfileError) {
      console.error('Profile insert failed:', insertProfileError.message)

      const rolledBack = await rollbackAuthUser(supabaseAdmin, userId)
      createdAuthId = null

      throw new HttpError(
        rolledBack
          ? 'Profil gagal dibuat. Akun Auth yang baru dibuat telah dibersihkan.'
          : 'Profil gagal dibuat dan pembersihan akun Auth juga gagal. Periksa akun secara manual.',
        500,
      )
    }

    createdAuthId = null

    return jsonResponse({
      success: true,
      message: 'Akun berhasil dibuat.',
      userId,
    })
  } catch (error) {
    if (createdAuthId) {
      await rollbackAuthUser(supabaseAdmin, createdAuthId)
    }

    const status = error instanceof HttpError ? error.status : 500
    const message =
      error instanceof HttpError
        ? error.message
        : 'Terjadi kesalahan internal pada server.'

    if (!(error instanceof HttpError)) {
      console.error('Kesalahan internal create-user:', error)
    }

    return jsonResponse({ error: message }, status)
  }
})