// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ACCOUNTS_PER_RUN = 50
const CHUNK_SIZE = 5
const DELAY_MS = 500

const allowedGroups = ['staff', 'siswa', 'orangtua']

class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function jsonResponse(body: unknown, status = 200) {
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

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

function cleanString(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\s-]/g, '').trim()
    : ''
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function getParentPriority(relation: unknown): number {
  const rel = typeof relation === 'string'
    ? relation.trim().toLowerCase()
    : ''

  if (rel.includes('ayah')) return 1
  if (rel.includes('ibu')) return 2
  if (rel.includes('wali')) return 3

  return 4
}

function getUsername(
  primary: unknown,
  secondary: unknown,
  tertiary: unknown,
  fallbackId: unknown,
): string {
  return (
    cleanString(primary) ||
    cleanString(secondary) ||
    cleanString(tertiary) ||
    (typeof fallbackId === 'string' ? fallbackId.substring(0, 8) : '')
  )
}

function makeEmail(email: unknown, username: string): string {
  const suppliedEmail = normalizeEmail(email)

  if (suppliedEmail) return suppliedEmail

  // Email internal ini tidak dapat menerima email pemulihan.
  // Gunakan domain milik sekolah jika akun memerlukan email sungguhan.
  return `${username}@sistem.local`.toLowerCase()
}

function isValidEmail(email: string): boolean {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metode request tidak diizinkan.' }, 405)
  }

  try {
    // -------------------------------------------------------------
    // 1. VALIDASI KONFIGURASI DAN AUTENTIKASI
    // -------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const initialPassword = Deno.env.get('INITIAL_ACCOUNT_PASSWORD')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Konfigurasi Supabase belum lengkap.', 500)
    }

    if (!initialPassword || initialPassword.length < 12) {
      throw new HttpError(
        'Secret INITIAL_ACCOUNT_PASSWORD belum diatur atau terlalu pendek.',
        500,
      )
    }

    const authorization = req.headers.get('Authorization') || ''
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)

    if (!tokenMatch) {
      throw new HttpError('Token login diperlukan.', 401)
    }

    const accessToken = tokenMatch[1]

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    // Validasi JWT ke Supabase Auth, bukan sekadar membaca payload token.
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !authData.user) {
      throw new HttpError('Sesi login tidak valid atau sudah berakhir.', 401)
    }

    const callerId = authData.user.id

    // Ambil role dan sekolah dari database, bukan dari request frontend.
    const {
      data: caller,
      error: callerError,
    } = await supabaseAdmin
      .from('users')
      .select('id, role, "schoolId", "isActive"')
      .eq('id', callerId)
      .maybeSingle()

    if (callerError) {
      console.error('Gagal memverifikasi profil pemanggil:', callerError.message)
      throw new HttpError('Gagal memverifikasi hak akses pengguna.', 500)
    }

    if (!caller || caller.isActive !== true) {
      throw new HttpError('Akun tidak aktif atau profil pengguna tidak ditemukan.', 403)
    }

    const isSuperAdmin =
      caller.role === 'SUPER_ADMIN' &&
      caller['schoolId'] === null

    const isSchoolAdmin =
      caller.role === 'ADMIN' &&
      typeof caller['schoolId'] === 'string'

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpError(
        'Hanya Super Admin dan Admin sekolah yang boleh menjalankan fitur ini.',
        403,
      )
    }

    // -------------------------------------------------------------
    // 2. VALIDASI PARAMETER DAN BATAS KEWENANGAN SEKOLAH
    // -------------------------------------------------------------
    let requestBody: any

    try {
      requestBody = await req.json()
    } catch {
      throw new HttpError('Body request bukan JSON yang valid.', 400)
    }

    const targetGroup = requestBody?.targetGroup
    const schoolId = requestBody?.schoolId

    if (!allowedGroups.includes(targetGroup)) {
      throw new HttpError(
        'Target kelompok harus staff, siswa, atau orangtua.',
        400,
      )
    }

    if (!isValidUuid(schoolId)) {
      throw new HttpError('School ID tidak valid.', 400)
    }

    // Admin tidak dapat mengganti schoolId di request untuk menyerang sekolah lain.
    if (isSchoolAdmin && caller['schoolId'] !== schoolId) {
      throw new HttpError(
        'Admin hanya dapat membuat akun untuk sekolahnya sendiri.',
        403,
      )
    }

    // -------------------------------------------------------------
    // 3. AMBIL DATA SUMBER SEKOLAH
    // -------------------------------------------------------------
    let masterData: Array<{
      id: string
      email: string
      fullName: string
      role: string
    }> = []

    if (targetGroup === 'staff') {
      const { data, error } = await supabaseAdmin
        .from('teachers')
        .select('id, "schoolId", email, fullName, nuptk, nip, nik')
        .eq('schoolId', schoolId)

      if (error) {
        console.error('Gagal mengambil data guru:', error.message)
        throw new HttpError('Gagal mengambil data guru.', 500)
      }

      masterData = (data || []).map((teacher) => {
        const username = getUsername(
          teacher.nuptk,
          teacher.nip,
          teacher.nik,
          teacher.id,
        )

        return {
          id: teacher.id,
          email: makeEmail(teacher.email, username),
          fullName: teacher.fullName,
          role: 'GURU',
        }
      })
    }

    if (targetGroup === 'siswa') {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('id, "schoolId", email, fullName, nisn, nis, nik')
        .eq('schoolId', schoolId)

      if (error) {
        console.error('Gagal mengambil data siswa:', error.message)
        throw new HttpError('Gagal mengambil data siswa.', 500)
      }

      masterData = (data || []).map((student) => {
        const username = getUsername(
          student.nisn,
          student.nis,
          student.nik,
          student.id,
        )

        return {
          id: student.id,
          email: makeEmail(student.email, username),
          fullName: student.fullName,
          role: 'SISWA',
        }
      })
    }

    if (targetGroup === 'orangtua') {
      const { data, error } = await supabaseAdmin
        .from('student_parents')
        .select('id, "schoolId", studentId, email, fullName, nik, relation')
        .eq('schoolId', schoolId)

      if (error) {
        console.error('Gagal mengambil data orang tua:', error.message)
        throw new HttpError('Gagal mengambil data orang tua.', 500)
      }

      // Pilih satu data orang tua per siswa:
      // Ayah > Ibu > Wali > relasi lainnya.
      const parentByStudent = new Map<string, any>()

      for (const parent of data || []) {
        if (!parent.studentId) continue

        const current = parentByStudent.get(parent.studentId)

        if (
          !current ||
          getParentPriority(parent.relation) <
            getParentPriority(current.relation)
        ) {
          parentByStudent.set(parent.studentId, parent)
        }
      }

      // Deduplikasi email untuk menangani orang tua yang memiliki beberapa anak.
      const parentByEmail = new Map<string, {
        id: string
        email: string
        fullName: string
        role: string
      }>()

      for (const parent of parentByStudent.values()) {
        const username =
          cleanString(parent.nik) ||
          `w-${String(parent.studentId).substring(0, 6)}`

        const email = makeEmail(parent.email, username)

        if (!parentByEmail.has(email)) {
          parentByEmail.set(email, {
            id: parent.id,
            email,
            fullName: parent.fullName,
            role: 'ORANG_TUA',
          })
        }
      }

      masterData = Array.from(parentByEmail.values())
    }

    if (masterData.length === 0) {
      throw new HttpError(
        `Tidak ada data ${targetGroup} untuk sekolah yang dipilih.`,
        404,
      )
    }

    // -------------------------------------------------------------
    // 4. VALIDASI EMAIL DAN DEDUPLIKASI DATA SUMBER
    // -------------------------------------------------------------
    const invalidEmails: string[] = []
    const seenEmails = new Set<string>()
    const uniqueMasterData = []

    for (const person of masterData) {
      person.email = normalizeEmail(person.email)

      if (!person.email || !isValidEmail(person.email)) {
        invalidEmails.push(person.fullName || person.id)
        continue
      }

      if (seenEmails.has(person.email)) {
        continue
      }

      seenEmails.add(person.email)
      uniqueMasterData.push(person)
    }

    if (uniqueMasterData.length === 0) {
      throw new HttpError(
        'Tidak ada data dengan format email yang dapat diproses.',
        400,
      )
    }

    // -------------------------------------------------------------
    // 5. PERIKSA PROFIL YANG SUDAH ADA
    // -------------------------------------------------------------
    // Query ini membantu mendeteksi akun yang sudah memiliki profil.
    // Constraint unik lower(email) di database tetap menjadi perlindungan akhir.
    const { data: existingUsers, error: existingUsersError } =
      await supabaseAdmin
        .from('users')
        .select('id, email, "schoolId"')
        .eq('schoolId', schoolId)

    if (existingUsersError) {
      console.error(
        'Gagal memeriksa akun yang sudah ada:',
        existingUsersError.message,
      )
      throw new HttpError('Gagal memeriksa akun yang sudah ada.', 500)
    }

    const existingEmails = new Set(
      (existingUsers || []).map((user) => normalizeEmail(user.email)),
    )

    const alreadyPresent = uniqueMasterData.filter((person) =>
      existingEmails.has(person.email)
    )

    const candidates = uniqueMasterData.filter((person) =>
      !existingEmails.has(person.email)
    )

    if (candidates.length === 0) {
      return jsonResponse({
        success: true,
        message: 'Semua data yang valid sudah memiliki profil pengguna.',
        targetGroup,
        schoolId,
        totalSource: masterData.length,
        alreadyPresent: alreadyPresent.length,
        created: 0,
        failed: 0,
        skipped: alreadyPresent.length,
        invalid: invalidEmails.length,
        invalidRecords: invalidEmails.slice(0, 20),
      })
    }

    // Batasi satu eksekusi. Sisanya diproses saat fungsi dijalankan lagi.
    const targetData = candidates.slice(0, MAX_ACCOUNTS_PER_RUN)
    const remaining = Math.max(0, candidates.length - targetData.length)

    // -------------------------------------------------------------
    // 6. BUAT AKUN AUTH DAN PROFIL DATABASE
    // -------------------------------------------------------------
    let created = 0
    let skipped = alreadyPresent.length
    const failures: Array<{ email: string; reason: string }> = []

    const chunks = chunkArray(targetData, CHUNK_SIZE)

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (person) => {
          let createdAuthUserId: string | null = null

          try {
            const {
              data: authResult,
              error: authCreateError,
            } = await supabaseAdmin.auth.admin.createUser({
              email: person.email,
              password: initialPassword,
              email_confirm: true,
              user_metadata: {
                full_name: person.fullName,
              },
            })

            if (authCreateError) {
              // Jangan menautkan akun Auth yang sudah ada secara otomatis:
              // akun tersebut mungkin milik pengguna lain atau sekolah lain.
              console.error(
                'Gagal membuat akun Auth:',
                person.email,
                authCreateError.message,
              )

              failures.push({
                email: person.email,
                reason:
                  /already|registered|exists/i.test(authCreateError.message)
                    ? 'Email sudah terdaftar di Auth; perlu pemeriksaan profil.'
                    : 'Pembuatan akun Auth gagal.',
              })

              return
            }

            const userId = authResult?.user?.id

            if (!userId) {
              failures.push({
                email: person.email,
                reason: 'Supabase Auth tidak mengembalikan ID pengguna.',
              })
              return
            }

            createdAuthUserId = userId

            const {
              error: profileError,
            } = await supabaseAdmin
              .from('users')
              .insert({
                id: userId,
                schoolId,
                email: person.email,
                fullName: person.fullName || person.email,
                role: person.role,
                isActive: true,
                isFirstLogin: true,
              })

            if (profileError) {
              console.error(
                'Gagal membuat profil pengguna:',
                person.email,
                profileError.message,
              )

              // Rollback akun Auth yang baru dibuat oleh eksekusi ini.
              // Jika rollback gagal, laporkan agar bisa direkonsiliasi manual.
              const { error: rollbackError } =
                await supabaseAdmin.auth.admin.deleteUser(userId)

              if (rollbackError) {
                console.error(
                  'Rollback Auth gagal:',
                  person.email,
                  rollbackError.message,
                )

                failures.push({
                  email: person.email,
                  reason:
                    'Profil gagal dibuat dan akun Auth gagal dihapus; perlu rekonsiliasi manual.',
                })
              } else {
                failures.push({
                  email: person.email,
                  reason:
                    'Profil gagal dibuat; akun Auth baru berhasil dibatalkan.',
                })
              }

              return
            }

            created++
          } catch (error) {
            console.error(
              'Kesalahan saat memproses akun:',
              person.email,
              error instanceof Error ? error.message : error,
            )

            // Coba bersihkan hanya akun Auth yang dibuat oleh proses ini.
            if (createdAuthUserId) {
              const { error: rollbackError } =
                await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId)

              if (rollbackError) {
                console.error(
                  'Rollback setelah exception gagal:',
                  rollbackError.message,
                )
              }
            }

            failures.push({
              email: person.email,
              reason: 'Terjadi kesalahan saat memproses akun.',
            })
          }
        }),
      )

      await delay(DELAY_MS)
    }

    // -------------------------------------------------------------
    // 7. RESPONS RINGKAS UNTUK FRONTEND
    // -------------------------------------------------------------
    const success = failures.length === 0

    let message = `Selesai. ${created} akun berhasil dibuat.`

    if (failures.length > 0) {
      message += ` ${failures.length} akun gagal diproses.`
    }

    if (remaining > 0) {
      message += ` Masih ada ${remaining} akun dalam antrean. Jalankan proses lagi untuk melanjutkan.`
    }

    return jsonResponse({
      success,
      message,
      targetGroup,
      schoolId,
      totalSource: masterData.length,
      created,
      skipped,
      invalid: invalidEmails.length,
      failed: failures.length,
      remaining,
      invalidRecords: invalidEmails.slice(0, 20),
      failures: failures.slice(0, 20),
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500

    if (!(error instanceof HttpError)) {
      console.error(
        'Kesalahan generate-accounts:',
        error instanceof Error ? error.message : error,
      )
    }

    return jsonResponse({
      success: false,
      error: error instanceof HttpError
        ? error.message
        : 'Terjadi kesalahan internal saat membuat akun.',
    }, status)
  }
})