// supabase/functions/create-user/index.ts
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
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'BENDAHARA',
  'WALI_KELAS',
  'GURU',
  'STAFF_TU',
  'STAFF_SARPRAS',
  'STAFF_PERPUS',
  'ORANG_TUA',
  'SISWA',
] as const

const VALID_ADDITIONAL_ROLES = [
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'BENDAHARA',
  'WALI_KELAS',
  'GURU',
  'STAFF_TU',
  'STAFF_SARPRAS',
  'STAFF_PERPUS',
] as const

type AllowedRole = (typeof VALID_ROLES)[number]
type AllowedAdditionalRole = (typeof VALID_ADDITIONAL_ROLES)[number]

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

interface ExistingProfileRow {
  id: string
  schoolId: string | null
  role: string
}

interface ParentLinkInput {
  studentId: string
  relationship?: string
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

function sanitizeAdditionalRoles(
  raw: unknown,
  primaryRole: AllowedRole,
): AllowedAdditionalRole[] {
  if (
    primaryRole === 'SUPER_ADMIN' ||
    primaryRole === 'SISWA' ||
    primaryRole === 'ORANG_TUA'
  ) {
    return []
  }

  if (!Array.isArray(raw)) return []

  const unique = new Set<AllowedAdditionalRole>()
  for (const item of raw) {
    if (
      typeof item === 'string' &&
      item !== primaryRole &&
      VALID_ADDITIONAL_ROLES.includes(item as AllowedAdditionalRole)
    ) {
      unique.add(item as AllowedAdditionalRole)
    }
  }

  return Array.from(unique)
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
    const { error: profileDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) {
      console.error(
        'Gagal menghapus profil users saat rollback:',
        userId,
        profileDeleteError.message,
      )
    }

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

/**
 * Validasi ketat format UUID, kesesuaian role, dan keberadaan data master
 * pada sekolah target sebelum akun Auth dibuat atau diperbarui.
 */
async function validateMasterReferences(
  supabaseAdmin: SupabaseClient,
  params: {
    schoolId: string | null
    role: AllowedRole
    teacherId: string | null
    studentId: string | null
    studentLinks?: ParentLinkInput[]
  },
): Promise<void> {
  const { schoolId, role, teacherId, studentId, studentLinks } = params

  if (teacherId) {
    if (role === 'SUPER_ADMIN' || role === 'SISWA' || role === 'ORANG_TUA') {
      throw new HttpError(
        `teacherId tidak dapat digunakan untuk role ${role}.`,
        400,
      )
    }

    if (!isValidUuid(teacherId)) {
      throw new HttpError('Format teacherId tidak valid.', 400)
    }

    if (!schoolId) {
      throw new HttpError('schoolId wajib diisi saat menautkan data guru.', 400)
    }

    const { data: teacherRow, error: teacherCheckError } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('id', teacherId)
      .eq('schoolId', schoolId)
      .maybeSingle()

    if (teacherCheckError) {
      throw new HttpError('Gagal memverifikasi data master guru.', 500)
    }

    if (!teacherRow) {
      throw new HttpError(
        'Data guru tidak ditemukan atau tidak terdaftar pada sekolah ini.',
        404,
      )
    }
  }

  const collectedStudentIds: string[] = []

  if (studentId) {
    if (!isValidUuid(studentId)) {
      throw new HttpError('Format studentId tidak valid.', 400)
    }
    collectedStudentIds.push(studentId)
  }

  if (Array.isArray(studentLinks) && studentLinks.length > 0) {
    for (const item of studentLinks) {
      if (!item || typeof item.studentId !== 'string' || !isValidUuid(item.studentId)) {
        throw new HttpError(
          'Salah satu studentId pada daftar tautan anak tidak valid.',
          400,
        )
      }
      collectedStudentIds.push(item.studentId.trim())
    }
  }

  if (collectedStudentIds.length > 0) {
    if (role !== 'SISWA' && role !== 'ORANG_TUA') {
      throw new HttpError(
        `Data tautan siswa hanya diperbolehkan untuk role SISWA atau ORANG_TUA.`,
        400,
      )
    }

    if (!schoolId) {
      throw new HttpError('schoolId wajib diisi saat menautkan data siswa.', 400)
    }

    const uniqueStudentIds = Array.from(new Set(collectedStudentIds))

    if (role === 'SISWA' && uniqueStudentIds.length > 1) {
      throw new HttpError(
        'Akun SISWA hanya dapat ditautkan ke satu data siswa.',
        400,
      )
    }

    const { data: studentRows, error: studentCheckError } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('schoolId', schoolId)
      .in('id', uniqueStudentIds)

    if (studentCheckError) {
      throw new HttpError('Gagal memverifikasi data master siswa.', 500)
    }

    if (!studentRows || studentRows.length !== uniqueStudentIds.length) {
      throw new HttpError(
        'Data siswa tidak ditemukan atau tidak terdaftar pada sekolah ini.',
        404,
      )
    }
  }
}

/**
 * Menautkan userId ke tabel master (teachers / user_student_links) secara idempoten.
 */
async function syncMasterLink(
  supabaseAdmin: SupabaseClient,
  params: {
    userId: string
    schoolId: string | null
    role: AllowedRole
    teacherId?: string | null
    studentId?: string | null
    relationship?: string | null
    studentLinks?: ParentLinkInput[]
  },
): Promise<void> {
  const { userId, schoolId, role, teacherId, studentId, relationship, studentLinks } = params
  if (!schoolId) return

  if (teacherId) {
    const { error } = await supabaseAdmin
      .from('teachers')
      .update({ userId })
      .eq('id', teacherId)
      .eq('schoolId', schoolId)

    if (error) {
      throw new HttpError(`Gagal menautkan akun ke data guru: ${error.message}`, 500)
    }
    return
  }

  if (role === 'SISWA' && studentId) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('user_student_links')
      .select('id')
      .eq('schoolId', schoolId)
      .eq('userId', userId)
      .eq('studentId', studentId)
      .eq('relationship', 'SISWA')
      .maybeSingle()

    if (lookupError) {
      throw new HttpError(`Gagal memeriksa tautan siswa: ${lookupError.message}`, 500)
    }

    if (!existing) {
      const { error } = await supabaseAdmin
        .from('user_student_links')
        .insert({
          id: crypto.randomUUID(),
          schoolId,
          userId,
          studentId,
          relationship: 'SISWA',
          isPrimary: false,
          createdAt: new Date().toISOString(),
        })

      if (error) {
        throw new HttpError(`Gagal menautkan akun ke data siswa: ${error.message}`, 500)
      }
    }
    return
  }

  if (role === 'ORANG_TUA') {
    const rawLinks: ParentLinkInput[] = Array.isArray(studentLinks) && studentLinks.length > 0
      ? studentLinks
      : studentId
        ? [{ studentId, relationship: relationship || 'Wali' }]
        : []

    if (rawLinks.length === 0) return

    const { data: existingLinks, error: existingLinksError } = await supabaseAdmin
      .from('user_student_links')
      .select('"studentId", "isPrimary"')
      .eq('schoolId', schoolId)
      .eq('userId', userId)

    if (existingLinksError) {
      throw new HttpError(`Gagal memeriksa tautan anak: ${existingLinksError.message}`, 500)
    }

    const existingIds = new Set(
      (existingLinks || []).map((row: { studentId: string }) => String(row.studentId)),
    )
    const hasPrimary = (existingLinks || []).some(
      (row: { isPrimary?: boolean }) => row.isPrimary === true,
    )

    const seenInPayload = new Set<string>()
    const toInsert = rawLinks
      .filter((item) => {
        const cleanId = item.studentId.trim()
        if (existingIds.has(cleanId) || seenInPayload.has(cleanId)) return false
        seenInPayload.add(cleanId)
        return true
      })
      .map((item, idx) => ({
        id: crypto.randomUUID(),
        schoolId,
        userId,
        studentId: item.studentId.trim(),
        relationship: (item.relationship || 'Wali').trim() || 'Wali',
        isPrimary: !hasPrimary && idx === 0,
        createdAt: new Date().toISOString(),
      }))

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin
        .from('user_student_links')
        .insert(toInsert)

      if (error) {
        throw new HttpError(`Gagal menautkan akun ke data anak: ${error.message}`, 500)
      }
    }
  }
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
    throw new HttpError('Anda tidak memiliki izin membuat akun.', 403)
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

  let createdAuthId: string | null = null

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

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const role = body.role
    const rawSchoolId =
      typeof body.schoolId === 'string' ? body.schoolId.trim() : ''
    const existingUserId =
      typeof body.existingUserId === 'string' ? body.existingUserId.trim() : body.existingUserId
    const useDefaultPassword = body.useDefaultPassword === true

    const teacherId = typeof body.teacherId === 'string' ? body.teacherId.trim() : null
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : null
    const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : null
    const studentLinks = Array.isArray(body.studentLinks)
      ? (body.studentLinks as ParentLinkInput[])
      : undefined

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

    const typedRole = role as AllowedRole
    const cleanAdditionalRoles = sanitizeAdditionalRoles(
      body.additionalRoles,
      typedRole,
    )

    if (typedRole === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new HttpError(
        'Hanya SUPER_ADMIN yang dapat membuat akun SUPER_ADMIN.',
        403,
      )
    }

    if (isSchoolAdmin && !isSuperAdmin && typedRole === 'ADMIN') {
      throw new HttpError('ADMIN tidak diizinkan membuat akun ADMIN lain.', 403)
    }

    let resolvedSchoolId: string | null = null

    if (typedRole === 'SUPER_ADMIN') {
      resolvedSchoolId = null
    } else {
      if (!rawSchoolId) {
        throw new HttpError(
          'Sekolah aktif belum dipilih. Pilih sekolah terlebih dahulu.',
          400,
        )
      }

      if (!isValidUuid(rawSchoolId)) {
        throw new HttpError(
          'schoolId wajib diisi dengan ID sekolah yang valid.',
          400,
        )
      }

      if (isSchoolAdmin && !isSuperAdmin && rawSchoolId !== caller.schoolId) {
        throw new HttpError(
          'Anda hanya dapat membuat akun untuk sekolah sendiri.',
          403,
        )
      }

      const { data: schoolData, error: schoolError } = await supabaseAdmin
        .from('schools')
        .select('id')
        .eq('id', rawSchoolId)
        .maybeSingle()

      if (schoolError) {
        throw new HttpError('Gagal memeriksa data sekolah.', 500)
      }
      if (!schoolData) {
        throw new HttpError('Satuan pendidikan tidak ditemukan.', 404)
      }

      resolvedSchoolId = rawSchoolId
    }

    // Validasi referensi tabel master sebelum membuat / mengubah akun Auth
    await validateMasterReferences(supabaseAdmin, {
      schoolId: resolvedSchoolId,
      role: typedRole,
      teacherId,
      studentId,
      studentLinks,
    })

    let userId: string

    // =========================================================
    // JALUR 1: PEMBARUAN / RESET AKUN YANG SUDAH ADA (GENERATE TERPILIH)
    // =========================================================
    if (existingUserId !== undefined && existingUserId !== null && existingUserId !== '') {
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
        isSchoolAdmin &&
        !isSuperAdmin &&
        existingProfile &&
        (existingProfile.schoolId !== caller.schoolId ||
          existingProfile.role === 'ADMIN')
      ) {
        throw new HttpError('Anda tidak berwenang mengubah akun tersebut.', 403)
      }

      if (existingProfile && existingProfile.schoolId !== resolvedSchoolId) {
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
            school_id: resolvedSchoolId,
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
        role: typedRole,
        additionalRoles: cleanAdditionalRoles,
        schoolId: resolvedSchoolId,
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

      await syncMasterLink(supabaseAdmin, {
        userId,
        schoolId: resolvedSchoolId,
        role: typedRole,
        teacherId,
        studentId,
        relationship,
        studentLinks,
      })

      return jsonResponse({
        success: true,
        message: 'Profil akun yang sudah ada berhasil diperbarui.',
        userId,
      })
    }

    // =========================================================
    // JALUR 2: PEMBUATAN AKUN BARU (AUTH + PROFIL + TAUTAN)
    // =========================================================
    const { data: authData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: resolvedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          school_id: resolvedSchoolId,
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
        role: typedRole,
        additionalRoles: cleanAdditionalRoles,
        schoolId: resolvedSchoolId,
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

    await syncMasterLink(supabaseAdmin, {
      userId,
      schoolId: resolvedSchoolId,
      role: typedRole,
      teacherId,
      studentId,
      relationship,
      studentLinks,
    })

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