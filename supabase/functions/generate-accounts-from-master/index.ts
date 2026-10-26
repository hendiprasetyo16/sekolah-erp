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

const ALLOWED_GROUPS = ['staff', 'siswa', 'orangtua']

type ParentLink = {
  studentId: string
  relationship: string
}

type AccountCandidate = {
  id: string
  email: string
  fullName: string
  role: 'GURU' | 'SISWA' | 'ORANG_TUA'
  studentLinks?: ParentLink[]
}

type Failure = {
  email: string
  reason: string
}

class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'HttpError'
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanString(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\s-]/g, '').trim()
    : ''
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : ''
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function isValidEmail(email: string): boolean {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
}

/**
 * Prioritas orang tua:
 * Ayah -> Ibu -> Wali -> lainnya.
 */
function getParentPriority(relation: unknown): number {
  const rel =
    typeof relation === 'string'
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
    (typeof fallbackId === 'string'
      ? fallbackId.substring(0, 8)
      : '')
  )
}

function makeEmail(email: unknown, username: string): string {
  const suppliedEmail = normalizeEmail(email)

  if (suppliedEmail) return suppliedEmail

  return `${username}@sistem.local`.toLowerCase()
}

function getRelationship(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Wali'
  }

  return value.trim()
}

/**
 * Mencoba menghapus pengguna Auth yang sudah dibuat.
 * Penghapusan Auth seharusnya ikut menghapus profil public.users
 * karena users.id memiliki FK ke auth.users dengan ON DELETE CASCADE.
 */
async function rollbackAuthUser(
  supabaseAdmin: any,
  userId: string,
): Promise<boolean> {
  try {
    const { error } =
      await supabaseAdmin.auth.admin.deleteUser(userId)

    if (error) {
      console.error(
        'Gagal membersihkan pengguna Auth:',
        userId,
        error.message,
      )
      return false
    }

    return true
  } catch (error) {
    console.error(
      'Kesalahan saat membersihkan pengguna Auth:',
      userId,
      error,
    )
    return false
  }
}

serve(async (req) => {
  // Menangani preflight CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Metode request tidak diizinkan.' },
      405,
    )
  }

  try {
    // =========================================================
    // 1. KONFIGURASI SUPABASE
    // =========================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY',
    )
    const initialPassword = Deno.env.get(
      'INITIAL_ACCOUNT_PASSWORD',
    )

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError(
        'Konfigurasi Supabase belum lengkap.',
        500,
      )
    }

    if (!initialPassword || initialPassword.length < 12) {
      throw new HttpError(
        'Secret INITIAL_ACCOUNT_PASSWORD belum diatur atau kurang dari 12 karakter.',
        500,
      )
    }

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

    // =========================================================
    // 2. VALIDASI TOKEN LOGIN
    // =========================================================

    const authorization =
      req.headers.get('Authorization') || ''

    const tokenMatch = authorization.match(
      /^Bearer\s+(.+)$/i,
    )

    if (!tokenMatch) {
      throw new HttpError(
        'Token login diperlukan.',
        401,
      )
    }

    const accessToken = tokenMatch[1]

    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !authData?.user) {
      throw new HttpError(
        'Sesi login tidak valid atau sudah berakhir.',
        401,
      )
    }

    const callerId = authData.user.id

    // =========================================================
    // 3. VALIDASI ROLE DAN STATUS PENGGUNA
    // =========================================================

    const {
      data: caller,
      error: callerError,
    } = await supabaseAdmin
      .from('users')
      .select('id, role, "schoolId", "isActive"')
      .eq('id', callerId)
      .maybeSingle()

    if (callerError) {
      console.error(
        'Gagal memverifikasi pengguna:',
        callerError.message,
      )

      throw new HttpError(
        'Gagal memverifikasi hak akses pengguna.',
        500,
      )
    }

    if (!caller || caller.isActive !== true) {
      throw new HttpError(
        'Akun tidak ditemukan atau tidak aktif.',
        403,
      )
    }

    const isSuperAdmin =
      caller.role === 'SUPER_ADMIN' &&
      caller['schoolId'] === null

    const isSchoolAdmin =
      caller.role === 'ADMIN' &&
      typeof caller['schoolId'] === 'string'

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpError(
        'Akses ditolak. Hanya Super Admin dan Admin sekolah yang diizinkan.',
        403,
      )
    }

    // =========================================================
    // 4. VALIDASI TARGET SEKOLAH DAN KELOMPOK AKUN
    // =========================================================

    let requestBody: any

    try {
      requestBody = await req.json()
    } catch {
      throw new HttpError(
        'Body request bukan JSON yang valid.',
        400,
      )
    }

    const targetGroup = requestBody?.targetGroup
    const schoolId = requestBody?.schoolId

    if (
      typeof targetGroup !== 'string' ||
      !ALLOWED_GROUPS.includes(targetGroup)
    ) {
      throw new HttpError(
        'Target kelompok tidak valid. Gunakan staff, siswa, atau orangtua.',
        400,
      )
    }

    if (!isValidUuid(schoolId)) {
      throw new HttpError(
        'School ID tidak valid.',
        400,
      )
    }

    // Admin sekolah hanya boleh memproses sekolahnya sendiri.
    if (
      isSchoolAdmin &&
      caller['schoolId'] !== schoolId
    ) {
      throw new HttpError(
        'Admin hanya dapat membuat akun untuk sekolahnya sendiri.',
        403,
      )
    }

    // =========================================================
    // 5. AMBIL DATA MASTER
    // =========================================================

    let masterData: AccountCandidate[] = []

    // ---------------------------------------------------------
    // A. GURU / STAFF
    // ---------------------------------------------------------

    if (targetGroup === 'staff') {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from('teachers')
        .select(
          'id, "schoolId", email, fullName, nuptk, nip, nik',
        )
        .eq('schoolId', schoolId)

      if (error) {
        console.error(
          'Gagal mengambil data guru:',
          error.message,
        )

        throw new HttpError(
          'Gagal mengambil data guru.',
          500,
        )
      }

      masterData = (data || []).map((teacher: any) => {
        const username = getUsername(
          teacher.nuptk,
          teacher.nip,
          teacher.nik,
          teacher.id,
        )

        return {
          id: teacher.id,
          email: makeEmail(teacher.email, username),
          fullName: teacher.fullName || '',
          role: 'GURU',
        }
      })
    }

    // ---------------------------------------------------------
    // B. SISWA
    // ---------------------------------------------------------

    if (targetGroup === 'siswa') {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from('students')
        .select(
          'id, "schoolId", email, fullName, nisn, nis, nik',
        )
        .eq('schoolId', schoolId)

      if (error) {
        console.error(
          'Gagal mengambil data siswa:',
          error.message,
        )

        throw new HttpError(
          'Gagal mengambil data siswa.',
          500,
        )
      }

      masterData = (data || []).map((student: any) => {
        const username = getUsername(
          student.nisn,
          student.nis,
          student.nik,
          student.id,
        )

        return {
          id: student.id,
          email: makeEmail(student.email, username),
          fullName: student.fullName || '',
          role: 'SISWA',
        }
      })
    }

    // ---------------------------------------------------------
    // C. ORANG TUA / WALI
    // ---------------------------------------------------------

    if (targetGroup === 'orangtua') {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from('student_parents')
        .select(
          'id, "schoolId", studentId, email, fullName, nik, relation',
        )
        .eq('schoolId', schoolId)

      if (error) {
        console.error(
          'Gagal mengambil data orang tua:',
          error.message,
        )

        throw new HttpError(
          'Gagal mengambil data orang tua.',
          500,
        )
      }

      /**
       * Pilih satu orang tua per anak.
       * Prioritas: Ayah -> Ibu -> Wali -> lainnya.
       */
      const parentByStudent = new Map<string, any>()

      for (const parent of data || []) {
        if (!parent.studentId) continue

        const current = parentByStudent.get(
          parent.studentId,
        )

        if (
          !current ||
          getParentPriority(parent.relation) <
            getParentPriority(current.relation)
        ) {
          parentByStudent.set(
            parent.studentId,
            parent,
          )
        }
      }

      /**
       * Gabungkan data berdasarkan email.
       * Satu email dapat terhubung ke beberapa anak.
       *
       * Relasi setiap anak disimpan masing-masing agar
       * hubungan Ayah/Ibu/Wali tidak tertukar antar-anak.
       */
      const parentByEmail = new Map<string, any>()

      for (const parent of parentByStudent.values()) {
        const username =
          cleanString(parent.nik) ||
          `w-${String(parent.studentId).substring(0, 6)}`

        const email = makeEmail(
          parent.email,
          username,
        )

        const studentId = String(parent.studentId)

        const link: ParentLink = {
          studentId,
          relationship: getRelationship(parent.relation),
        }

        if (!parentByEmail.has(email)) {
          parentByEmail.set(email, {
            id: parent.id,
            email,
            fullName: parent.fullName || '',
            role: 'ORANG_TUA',
            studentLinks: [link],
          })
        } else {
          const existing = parentByEmail.get(email)

          // Hindari relasi ganda ke anak yang sama.
          const alreadyLinked =
            existing.studentLinks.some(
              (item: ParentLink) =>
                item.studentId === studentId,
            )

          if (!alreadyLinked) {
            existing.studentLinks.push(link)
          }

          // Jika nama pertama kosong, gunakan nama yang tersedia.
          if (!existing.fullName && parent.fullName) {
            existing.fullName = parent.fullName
          }
        }
      }

      masterData = Array.from(
        parentByEmail.values(),
      ).map((parent: any) => ({
        ...parent,
        studentLinks: [...parent.studentLinks].sort(
          (a: ParentLink, b: ParentLink) =>
            a.studentId.localeCompare(b.studentId),
        ),
      }))
    }

    // =========================================================
    // 6. VALIDASI DAN DEDUPLIKASI EMAIL
    // =========================================================

    if (masterData.length === 0) {
      throw new HttpError(
        `Tidak ada data ${targetGroup} untuk sekolah ini.`,
        404,
      )
    }

    const invalidEmails: string[] = []
    const seenEmails = new Set<string>()
    const uniqueMasterData: AccountCandidate[] = []

    for (const person of masterData) {
      person.email = normalizeEmail(person.email)

      if (
        !person.email ||
        !isValidEmail(person.email)
      ) {
        invalidEmails.push(
          person.fullName || person.id,
        )
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
        'Tidak ada data dengan email yang valid.',
        400,
      )
    }

    // =========================================================
    // 7. PERIKSA PROFIL YANG SUDAH ADA
    // =========================================================

    const {
      data: existingUsers,
      error: existingUsersError,
    } = await supabaseAdmin
      .from('users')
      .select('id, email, "schoolId"')
      .eq('schoolId', schoolId)

    if (existingUsersError) {
      console.error(
        'Gagal memeriksa profil yang sudah ada:',
        existingUsersError.message,
      )

      throw new HttpError(
        'Gagal memeriksa akun yang sudah ada. Tidak ada akun baru yang diproses.',
        500,
      )
    }

    const existingEmails = new Set(
      (existingUsers || []).map(
        (user: any) => normalizeEmail(user.email),
      ),
    )

    const alreadyPresent =
      uniqueMasterData.filter(
        (person) => existingEmails.has(person.email),
      )

    const candidates =
      uniqueMasterData.filter(
        (person) => !existingEmails.has(person.email),
      )

    const skipped = alreadyPresent.length

    if (candidates.length === 0) {
      return jsonResponse({
        success: true,
        message: 'Semua data sudah memiliki profil di sekolah ini.',
        targetGroup,
        schoolId,
        totalSource: masterData.length,
        totalValid: uniqueMasterData.length,
        skipped,
        invalidEmailCount: invalidEmails.length,
        invalidEmails,
        created: 0,
        failed: 0,
        remaining: 0,
        failures: [],
      })
    }

    // =========================================================
    // 8. BATASI JUMLAH AKUN PER EKSEKUSI
    // =========================================================

    const targetData = candidates.slice(
      0,
      MAX_ACCOUNTS_PER_RUN,
    )

    const remaining = Math.max(
      0,
      candidates.length - targetData.length,
    )

    let created = 0

    const failures: Failure[] = []

    const chunks = chunkArray(
      targetData,
      CHUNK_SIZE,
    )

    // =========================================================
    // 9. BUAT AKUN AUTH, PROFIL, DAN RELASI ANAK
    // =========================================================

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (person) => {
          let createdAuthUserId: string | null = null

          try {
            // -------------------------------------------------
            // A. Buat akun Auth
            // -------------------------------------------------

            const {
              data: authResult,
              error: authCreateError,
            } = await supabaseAdmin.auth.admin.createUser({
              email: person.email,
              password: initialPassword,
              email_confirm: true,
              user_metadata: {
                full_name: person.fullName,
                school_id: schoolId,
                initial_account: true,
              },
            })

            if (authCreateError) {
              console.error(
                'Gagal membuat akun Auth:',
                person.email,
                authCreateError.message,
              )

              failures.push({
                email: person.email,
                reason:
                  'Pembuatan akun Auth gagal. Periksa apakah email sudah digunakan atau data akun tidak valid.',
              })

              return
            }

            const userId = authResult?.user?.id

            if (!userId) {
              failures.push({
                email: person.email,
                reason:
                  'Supabase tidak mengembalikan ID pengguna Auth.',
              })

              return
            }

            createdAuthUserId = userId

            // -------------------------------------------------
            // B. Buat profil public.users
            // -------------------------------------------------

            const {
              error: profileError,
            } = await supabaseAdmin
              .from('users')
              .insert({
                id: userId,
                schoolId,
                email: person.email,
                fullName:
                  person.fullName || person.email,
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

              const rolledBack =
                await rollbackAuthUser(
                  supabaseAdmin,
                  userId,
                )

              createdAuthUserId = null

              failures.push({
                email: person.email,
                reason: rolledBack
                  ? 'Profil pengguna gagal dibuat. Akun Auth sementara telah dibersihkan.'
                  : 'Profil pengguna gagal dibuat dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
              })

              return
            }

            // -------------------------------------------------
            // C. Simpan relasi orang tua dengan anak
            // -------------------------------------------------

            if (
              person.role === 'ORANG_TUA' &&
              person.studentLinks &&
              person.studentLinks.length > 0
            ) {
              /**
               * Kolom id dan createdAt diisi secara eksplisit
               * karena hasil pemeriksaan skema belum memastikan
               * adanya default pada kedua kolom tersebut.
               *
               * isPrimary dibuat deterministik berdasarkan
               * urutan studentId, bukan urutan query acak.
               */
              const sortedLinks = [
                ...person.studentLinks,
              ].sort((a, b) =>
                a.studentId.localeCompare(b.studentId),
              )

              const linksToInsert = sortedLinks.map(
                (link, index) => ({
                  id: crypto.randomUUID(),
                  schoolId,
                  userId,
                  studentId: link.studentId,
                  relationship: link.relationship,
                  isPrimary: index === 0,
                  createdAt: new Date().toISOString(),
                }),
              )

              const {
                error: linkError,
              } = await supabaseAdmin
                .from('user_student_links')
                .insert(linksToInsert)

              if (linkError) {
                console.error(
                  'Gagal menyimpan relasi orang tua-anak:',
                  person.email,
                  linkError.message,
                )

                const rolledBack =
                  await rollbackAuthUser(
                    supabaseAdmin,
                    userId,
                  )

                createdAuthUserId = null

                failures.push({
                  email: person.email,
                  reason: rolledBack
                    ? 'Relasi orang tua-anak gagal disimpan. Akun Auth dan profil terkait telah dibersihkan.'
                    : 'Relasi orang tua-anak gagal disimpan dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
                })

                return
              }
            }

            // -------------------------------------------------
            // D. Tandai berhasil hanya setelah semua tahap lolos
            // -------------------------------------------------

            created++
            createdAuthUserId = null
          } catch (error) {
            console.error(
              'Kesalahan pemrosesan akun:',
              person.email,
              error,
            )

            let cleanupSucceeded = true

            if (createdAuthUserId) {
              cleanupSucceeded =
                await rollbackAuthUser(
                  supabaseAdmin,
                  createdAuthUserId,
                )
            }

            failures.push({
              email: person.email,
              reason: cleanupSucceeded
                ? 'Terjadi kesalahan sistem saat memproses akun.'
                : 'Terjadi kesalahan sistem dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
            })
          }
        }),
      )

      // Jeda antar-kelompok untuk mengurangi beban pemrosesan.
      await delay(DELAY_MS)
    }

    // =========================================================
    // 10. HASIL AKHIR
    // =========================================================

    const success = failures.length === 0

    let message = `Selesai. ${created} akun berhasil dibuat.`

    if (skipped > 0) {
      message += ` ${skipped} data dilewati karena profil sudah ada.`
    }

    if (invalidEmails.length > 0) {
      message += ` ${invalidEmails.length} data memiliki email yang tidak valid.`
    }

    if (failures.length > 0) {
      message += ` ${failures.length} akun gagal diproses.`
    }

    if (remaining > 0) {
      message += ` Masih ada ${remaining} akun dalam antrean untuk eksekusi berikutnya.`
    }

    return jsonResponse({
      success,
      message,
      targetGroup,
      schoolId,
      totalSource: masterData.length,
      totalValid: uniqueMasterData.length,
      skipped,
      invalidEmailCount: invalidEmails.length,
      invalidEmails,
      created,
      failed: failures.length,
      remaining,
      failures,
    })
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : 500

    if (!(error instanceof HttpError)) {
      console.error(
        'Kesalahan internal Edge Function:',
        error,
      )
    }

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof HttpError
            ? error.message
            : 'Terjadi kesalahan internal.',
      },
      status,
    )
  }
})