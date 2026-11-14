// supabase/functions/delete-user/index.ts
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
  additionalRoles?: string[] | null
  isActive: boolean
}

interface AuthorizedCaller {
  caller: CallerRow
  isSuperAdmin: boolean
  isSchoolAdmin: boolean
}

interface TargetUserRow {
  id: string
  schoolId: string | null
  role: string
  additionalRoles?: string[] | null
  email: string
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  )
}

async function authorize(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<AuthorizedCaller> {
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
    .select('id, "schoolId", role, "additionalRoles", "isActive"')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (error) {
    throw new HttpError('Gagal memverifikasi profil pemanggil.', 500)
  }

  const caller = callerData as CallerRow | null

  if (!caller || caller.isActive !== true) {
    throw new HttpError('Akun Anda tidak aktif atau profil tidak ditemukan.', 403)
  }

  const callerRoles = new Set<string>([
    caller.role,
    ...(Array.isArray(caller.additionalRoles) ? caller.additionalRoles : []),
  ])

  const isSuperAdmin =
    callerRoles.has('SUPER_ADMIN') &&
    caller.schoolId === null

  const isSchoolAdmin =
    callerRoles.has('ADMIN') &&
    typeof caller.schoolId === 'string' &&
    caller.schoolId.trim().length > 0

  if (!isSuperAdmin && !isSchoolAdmin) {
    throw new HttpError('Anda tidak memiliki izin menghapus akun.', 403)
  }

  return { caller, isSuperAdmin, isSchoolAdmin }
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
    const { caller, isSuperAdmin, isSchoolAdmin } = await authorize(req, supabaseAdmin)

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

    const rawTargetUserId =
      typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
    const rawSchoolId =
      typeof body.schoolId === 'string' ? body.schoolId.trim() : ''

    if (!isValidUuid(rawTargetUserId)) {
      throw new HttpError('ID pengguna tidak valid.', 400)
    }

    if (rawSchoolId !== '' && !isValidUuid(rawSchoolId)) {
      throw new HttpError('School ID tidak valid.', 400)
    }

    const targetUserId = rawTargetUserId
    const schoolId = rawSchoolId || null

    if (targetUserId === caller.id) {
      throw new HttpError(
        'Anda tidak dapat menghapus akun yang sedang digunakan.',
        400,
      )
    }

    const { data: targetData, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, "schoolId", role, "additionalRoles", email')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetError) {
      throw new HttpError('Gagal memeriksa akun tujuan.', 500)
    }

    const target = targetData as TargetUserRow | null

    if (target) {
      const targetRoles = new Set<string>([
        target.role,
        ...(Array.isArray(target.additionalRoles) ? target.additionalRoles : []),
      ])

      if (targetRoles.has('SUPER_ADMIN')) {
        throw new HttpError(
          'Akun SUPER_ADMIN tidak dapat dihapus melalui fungsi ini.',
          403,
        )
      }

      if (schoolId && target.schoolId && target.schoolId !== schoolId) {
        throw new HttpError(
          'Akun tujuan tidak berada pada satuan pendidikan yang sedang aktif.',
          403,
        )
      }

      if (isSchoolAdmin && !isSuperAdmin) {
        if (target.schoolId !== caller.schoolId) {
          throw new HttpError(
            'Anda hanya dapat menghapus akun dari sekolah sendiri.',
            403,
          )
        }

        if (targetRoles.has('ADMIN')) {
          throw new HttpError(
            'ADMIN tidak diizinkan menghapus akun ADMIN lain.',
            403,
          )
        }
      }
    }

    // 1. Lepas tautan di tabel master agar tidak terblokir Foreign Key
    const { error: unlinkTeacherError } = await supabaseAdmin
      .from('teachers')
      .update({ userId: null })
      .eq('userId', targetUserId)

    if (unlinkTeacherError) {
      console.error('Unlink teacher failed:', unlinkTeacherError.message)
      throw new HttpError('Gagal melepas tautan akun pada data guru.', 500)
    }

    const { error: unlinkStudentError } = await supabaseAdmin
      .from('user_student_links')
      .delete()
      .eq('userId', targetUserId)

    if (unlinkStudentError) {
      console.error('Unlink student/parent failed:', unlinkStudentError.message)
      throw new HttpError('Gagal melepas tautan akun pada data siswa/wali.', 500)
    }

    // 2. Hapus profil di public.users terlebih dahulu
    if (target) {
      const { error: profileDeleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', targetUserId)

      if (profileDeleteError) {
        console.error('Profile delete failed:', profileDeleteError.message)
        throw new HttpError(
          'Gagal menghapus profil pengguna. Akun Auth tidak dihapus.',
          500,
        )
      }
    }

    // 3. Hapus akun dari Supabase Auth
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(targetUserId)

    if (authDeleteError) {
      const { data: authLookup, error: lookupError } =
        await supabaseAdmin.auth.admin.getUserById(targetUserId)

      if (lookupError || authLookup?.user) {
        console.error('Auth delete failed:', authDeleteError.message)
        throw new HttpError(
          'Gagal menghapus akun Auth sepenuhnya. Periksa log sistem.',
          500,
        )
      }
    }

    return jsonResponse({
      success: true,
      message: 'Penghapusan akun selesai.',
      targetUserId,
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message =
      error instanceof HttpError
        ? error.message
        : 'Terjadi kesalahan internal pada server.'

    if (!(error instanceof HttpError)) {
      console.error('Kesalahan internal delete-user:', error)
    }

    return jsonResponse({ error: message }, status)
  }
})