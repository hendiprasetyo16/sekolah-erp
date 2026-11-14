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

// =========================================================
// PARAMETER PENGATURAN
// =========================================================
const MAX_DELETE_PER_RUN = 100 // Batas maksimal akun yang dihapus dalam 1x klik
const CHUNK_SIZE = 5           // Jumlah penghapusan paralel dalam 1 kelompok kecil
const DELAY_MS = 300           // Jeda waktu (milidetik) antar kelompok kecil

const ROLES_BY_GROUP: Record<string, readonly string[]> = {
  staff: ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'],
  siswa: ['SISWA'],
  orangtua: ['ORANG_TUA'],
}

interface CallerRow {
  id: string
  schoolId: string | null
  role: string
  isActive: boolean
}

interface TargetBulkUserRow {
  id: string
  email: string | null
  role: string
  isActive: boolean
}

interface DeleteFailure {
  id: string
  email: string | null
  error: string
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

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    throw new HttpError('Anda tidak memiliki izin menghapus akun massal.', 403)
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

    const { targetGroup, schoolId } = body

    if (
      typeof targetGroup !== 'string' ||
      !Object.hasOwn(ROLES_BY_GROUP, targetGroup)
    ) {
      throw new HttpError(
        'targetGroup harus bernilai staff, siswa, atau orangtua.',
        400,
      )
    }

    if (!isValidUuid(schoolId)) {
      throw new HttpError('schoolId tidak valid.', 400)
    }

    if (caller.role === 'ADMIN' && schoolId !== caller.schoolId) {
      throw new HttpError(
        'ADMIN hanya dapat menghapus akun dari sekolah sendiri.',
        403,
      )
    }

    const targetRoles = ROLES_BY_GROUP[targetGroup]

    const { data: usersData, error: queryError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, "isActive"')
      .eq('schoolId', schoolId)
      .in('role', targetRoles)

    if (queryError) {
      console.error('Bulk query failed:', queryError.message)
      throw new HttpError('Gagal mengambil daftar akun yang akan dihapus.', 500)
    }

    const allMatchedUsers = ((usersData as TargetBulkUserRow[] | null) || [])
      .filter((u: TargetBulkUserRow) => u.id !== caller.id)

    if (allMatchedUsers.length === 0) {
      return jsonResponse({
        success: true,
        message: 'Tidak ada akun yang cocok untuk dihapus.',
        totalMatched: 0,
        totalProcessed: 0,
        deleted: 0,
        remaining: 0,
        failed: [],
      })
    }

    const targets = allMatchedUsers.slice(0, MAX_DELETE_PER_RUN)
    const remaining = Math.max(0, allMatchedUsers.length - targets.length)
    const deleted: string[] = []
    const failed: DeleteFailure[] = []

    const chunks = chunkArray(targets, CHUNK_SIZE)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      await Promise.all(
        chunk.map(async (user: TargetBulkUserRow) => {
          const { error: authDeleteError } =
            await supabaseAdmin.auth.admin.deleteUser(user.id)

          if (authDeleteError) {
            const { data: authLookup, error: lookupError } =
              await supabaseAdmin.auth.admin.getUserById(user.id)

            if (lookupError || authLookup?.user) {
              failed.push({
                id: user.id,
                email: user.email ?? null,
                error: authDeleteError.message,
              })
              return
            }

            // Bersihkan profil yatim jika akun Auth memang sudah tidak ada
            const { error: orphanDeleteError } = await supabaseAdmin
              .from('users')
              .delete()
              .eq('id', user.id)

            if (orphanDeleteError) {
              failed.push({
                id: user.id,
                email: user.email ?? null,
                error: orphanDeleteError.message,
              })
              return
            }
          }

          deleted.push(user.id)
        }),
      )

      if (i < chunks.length - 1) {
        await delay(DELAY_MS)
      }
    }

    let message =
      failed.length === 0
        ? `Penghapusan selesai. ${deleted.length} akun berhasil dihapus.`
        : `${deleted.length} akun dihapus, ${failed.length} akun gagal dihapus.`

    if (remaining > 0) {
      message += ` Masih ada ${remaining} akun tersisa. Jalankan kembali untuk memproses sisanya.`
    }

    return jsonResponse({
      success: failed.length === 0,
      message,
      totalMatched: allMatchedUsers.length,
      totalProcessed: targets.length,
      deleted: deleted.length,
      remaining,
      failed,
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message =
      error instanceof HttpError
        ? error.message
        : 'Terjadi kesalahan internal pada server.'

    if (!(error instanceof HttpError)) {
      console.error('Kesalahan internal delete-users-by-role:', error)
    }

    return jsonResponse({ error: message }, status)
  }
})