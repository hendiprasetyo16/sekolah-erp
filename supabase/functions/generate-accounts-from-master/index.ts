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
// PARAMETER PENGATURAN (Bisa disesuaikan sesuai kebutuhan)
// =========================================================
const MAX_ACCOUNTS_PER_RUN = 50 // Maksimal kandidat yang diproses dalam 1x klik Generate
const CHUNK_SIZE = 5            // Jumlah proses paralel dalam 1 kelompok kecil
const DELAY_MS = 500            // Jeda waktu (milidetik) antar kelompok kecil

const ALLOWED_GROUPS = ['staff', 'siswa', 'orangtua'] as const
type TargetGroup = (typeof ALLOWED_GROUPS)[number]

// =========================================================
// DEFINISI TIPE DATA
// =========================================================
interface CallerRow {
  id: string
  role: string
  schoolId: string | null
  isActive: boolean
}

interface TeacherRow {
  id: string
  schoolId: string
  userId: string | null
  email: string | null
  fullName: string | null
  nuptk: string | null
  nip: string | null
  nik: string | null
  isActive: boolean
}

interface StudentRow {
  id: string
  schoolId: string
  email: string | null
  fullName: string | null
  nisn: string | null
  nis: string | null
  nik: string | null
  status: string
}

interface StudentParentRow {
  id: string
  schoolId: string
  studentId: string | null
  email: string | null
  fullName: string | null
  nik: string | null
  relation: string | null
}

interface ExistingUserRow {
  id: string
  email: string
  role: string
  schoolId: string | null
}

interface UserStudentLinkRow {
  id?: string
  userId?: string
  studentId: string
  relationship?: string
  isPrimary?: boolean
}

interface ParentLink {
  studentId: string
  relationship: string
}

interface AccountCandidate {
  id: string
  email: string
  fullName: string
  role: 'GURU' | 'SISWA' | 'ORANG_TUA'
  studentLinks?: ParentLink[]
  alreadyLinked?: boolean
  existingUserId?: string
}

interface Failure {
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

// =========================================================
// FUNGSI BANTU (HELPERS)
// =========================================================
function jsonResponse(body: unknown, status = 200): Response {
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

function isAllowedGroup(value: unknown): value is TargetGroup {
  return (
    typeof value === 'string' &&
    (ALLOWED_GROUPS as readonly string[]).includes(value)
  )
}

/**
 * Menentukan prioritas wali utama per siswa:
 * 1. Ayah -> 2. Ibu -> 3. Wali -> 4. Lainnya
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

function formatAuthErrorReason(rawMessage: string): string {
  const lower = rawMessage.toLowerCase()

  if (
    lower.includes('already been registered') ||
    lower.includes('already exists') ||
    lower.includes('duplicate')
  ) {
    return 'Email ini sudah terdaftar di sistem autentikasi (kemungkinan dipakai akun lama atau sekolah lain).'
  }

  return 'Pembuatan akun Auth gagal. Periksa format email atau data akun pada tabel master.'
}

/**
 * Menghapus akun Auth yang baru saja dibuat jika langkah profil/tautan gagal.
 * HANYA dipanggil untuk akun baru (bukan akun lama yang sudah ada sebelumnya).
 */
async function rollbackAuthUser(
  supabaseAdmin: SupabaseClient,
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

serve(async (req: Request): Promise<Response> => {
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
    // 1. KONFIGURASI SUPABASE & SECRET PASSWORD AWAL
    // =========================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const initialPassword = Deno.env.get('INITIAL_ACCOUNT_PASSWORD')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Konfigurasi Supabase belum lengkap.', 500)
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
    // 2. VALIDASI TOKEN LOGIN PENGGUNA
    // =========================================================
    const authorization = req.headers.get('Authorization') || ''
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)

    if (!tokenMatch) {
      throw new HttpError('Token login diperlukan.', 401)
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
    // 3. VALIDASI ROLE & STATUS AKTIF PENGGUNA
    // =========================================================
    const {
      data: callerData,
      error: callerError,
    } = await supabaseAdmin
      .from('users')
      .select('id, role, "schoolId", "isActive"')
      .eq('id', callerId)
      .maybeSingle()

    if (callerError) {
      console.error('Gagal memverifikasi pengguna:', callerError.message)
      throw new HttpError('Gagal memverifikasi hak akses pengguna.', 500)
    }

    const caller = callerData as CallerRow | null

    if (!caller || caller.isActive !== true) {
      throw new HttpError('Akun tidak ditemukan atau tidak aktif.', 403)
    }

    const isSuperAdmin =
      caller.role === 'SUPER_ADMIN' &&
      caller.schoolId === null

    const isSchoolAdmin =
      caller.role === 'ADMIN' &&
      typeof caller.schoolId === 'string'

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new HttpError(
        'Akses ditolak. Hanya Super Admin dan Admin sekolah yang diizinkan.',
        403,
      )
    }

    // =========================================================
    // 4. VALIDASI INPUT REQUEST & KEBERADAAN SEKOLAH
    // =========================================================
    let requestBody: Record<string, unknown>

    try {
      const parsed: unknown = await req.json()
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON object')
      }
      requestBody = parsed as Record<string, unknown>
    } catch {
      throw new HttpError('Body request bukan JSON yang valid.', 400)
    }

    const targetGroup = requestBody.targetGroup
    const schoolId = requestBody.schoolId

    if (!isAllowedGroup(targetGroup)) {
      throw new HttpError(
        'Target kelompok tidak valid. Gunakan staff, siswa, atau orangtua.',
        400,
      )
    }

    if (!isValidUuid(schoolId)) {
      throw new HttpError('School ID tidak valid.', 400)
    }

    if (isSchoolAdmin && caller.schoolId !== schoolId) {
      throw new HttpError(
        'Admin hanya dapat membuat akun untuk sekolahnya sendiri.',
        403,
      )
    }

    const { data: schoolData, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .maybeSingle()

    if (schoolError) {
      console.error('Gagal memeriksa data sekolah:', schoolError.message)
      throw new HttpError('Gagal memverifikasi data sekolah.', 500)
    }

    const schoolRecord = schoolData as { id: string } | null

    if (!schoolRecord) {
      throw new HttpError('Satuan pendidikan tidak ditemukan.', 404)
    }

    // =========================================================
    // 5. AMBIL DATA MASTER AKTIF & CEK TAUTAN YANG SUDAH ADA
    // =========================================================
    let masterData: AccountCandidate[] = []

    // ---------------------------------------------------------
    // A. GURU / STAFF (Hanya yang isActive = true)
    // ---------------------------------------------------------
    if (targetGroup === 'staff') {
      const { data, error } = await supabaseAdmin
        .from('teachers')
        .select('id, "schoolId", "userId", email, "fullName", nuptk, nip, nik, "isActive"')
        .eq('schoolId', schoolId)
        .eq('isActive', true)

      if (error) {
        console.error('Gagal mengambil data guru:', error.message)
        throw new HttpError('Gagal mengambil data guru.', 500)
      }

      const teachers = (data as TeacherRow[] | null) || []

      masterData = teachers.map((teacher: TeacherRow) => {
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
          alreadyLinked: Boolean(teacher.userId),
        }
      })
    }

    // ---------------------------------------------------------
    // B. SISWA (Hanya yang status = 'AKTIF')
    // ---------------------------------------------------------
    if (targetGroup === 'siswa') {
      const [studentsRes, linksRes] = await Promise.all([
        supabaseAdmin
          .from('students')
          .select('id, "schoolId", email, "fullName", nisn, nis, nik, status')
          .eq('schoolId', schoolId)
          .eq('status', 'AKTIF'),
        supabaseAdmin
          .from('user_student_links')
          .select('"studentId"')
          .eq('schoolId', schoolId)
          .eq('relationship', 'SISWA'),
      ])

      if (studentsRes.error) {
        console.error('Gagal mengambil data siswa:', studentsRes.error.message)
        throw new HttpError('Gagal mengambil data siswa.', 500)
      }

      if (linksRes.error) {
        console.error('Gagal memeriksa tautan siswa:', linksRes.error.message)
        throw new HttpError('Gagal memeriksa tautan akun siswa.', 500)
      }

      const studentLinks = (linksRes.data as UserStudentLinkRow[] | null) || []
      const linkedStudentIds = new Set(
        studentLinks.map((row: UserStudentLinkRow) => String(row.studentId)),
      )

      const students = (studentsRes.data as StudentRow[] | null) || []

      masterData = students.map((student: StudentRow) => {
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
          alreadyLinked: linkedStudentIds.has(String(student.id)),
        }
      })
    }

    // ---------------------------------------------------------
    // C. ORANG TUA / WALI (Hanya dari siswa yang status = 'AKTIF')
    // ---------------------------------------------------------
    if (targetGroup === 'orangtua') {
      const [activeStudentsRes, parentsRes, parentLinksRes] = await Promise.all([
        supabaseAdmin
          .from('students')
          .select('id')
          .eq('schoolId', schoolId)
          .eq('status', 'AKTIF'),
        supabaseAdmin
          .from('student_parents')
          .select('id, "schoolId", "studentId", email, "fullName", nik, relation')
          .eq('schoolId', schoolId),
        supabaseAdmin
          .from('user_student_links')
          .select('"studentId", relationship')
          .eq('schoolId', schoolId)
          .neq('relationship', 'SISWA'),
      ])

      if (activeStudentsRes.error) {
        console.error('Gagal memeriksa status aktif siswa:', activeStudentsRes.error.message)
        throw new HttpError('Gagal memeriksa data siswa aktif.', 500)
      }

      if (parentsRes.error) {
        console.error('Gagal mengambil data orang tua:', parentsRes.error.message)
        throw new HttpError('Gagal mengambil data orang tua.', 500)
      }

      if (parentLinksRes.error) {
        console.error('Gagal memeriksa tautan orang tua:', parentLinksRes.error.message)
        throw new HttpError('Gagal memeriksa tautan akun orang tua.', 500)
      }

      const activeStudentRows = (activeStudentsRes.data as { id: string }[] | null) || []
      const activeStudentIds = new Set(
        activeStudentRows.map((row: { id: string }) => String(row.id)),
      )

      const existingParentLinkRows = (parentLinksRes.data as UserStudentLinkRow[] | null) || []
      const alreadyLinkedStudentParentIds = new Set(
        existingParentLinkRows.map((row: UserStudentLinkRow) => String(row.studentId)),
      )

      // 1) Pilih 1 wali utama per siswa aktif (Ayah -> Ibu -> Wali)
      const parentByStudent = new Map<string, StudentParentRow>()
      const parentRows = (parentsRes.data as StudentParentRow[] | null) || []

      for (const parent of parentRows) {
        if (!parent.studentId) continue
        if (!activeStudentIds.has(String(parent.studentId))) continue

        const current = parentByStudent.get(parent.studentId)

        if (
          !current ||
          getParentPriority(parent.relation) <
            getParentPriority(current.relation)
        ) {
          parentByStudent.set(parent.studentId, parent)
        }
      }

      // 2) Gabungkan jika 1 email orang tua memiliki beberapa anak
      //    Selaras dengan fungsi SQL resolve_user_email: w-xxxxxx@sistem.local (6 karakter)
      const parentByEmail = new Map<string, AccountCandidate>()

      for (const parent of parentByStudent.values()) {
        const studentId = String(parent.studentId)
        const username =
          cleanString(parent.nik) ||
          `w-${studentId.substring(0, 6)}`

        const email = makeEmail(parent.email, username)
        const isChildAlreadyLinked = alreadyLinkedStudentParentIds.has(studentId)

        const link: ParentLink = {
          studentId,
          relationship: getRelationship(parent.relation),
        }

        const existing = parentByEmail.get(email)

        if (!existing) {
          parentByEmail.set(email, {
            id: parent.id,
            email,
            fullName: parent.fullName || '',
            role: 'ORANG_TUA',
            studentLinks: isChildAlreadyLinked ? [] : [link],
            alreadyLinked: isChildAlreadyLinked,
          })
        } else {
          if (!isChildAlreadyLinked) {
            const links = existing.studentLinks ?? []
            const alreadyInList = links.some(
              (item: ParentLink) => item.studentId === studentId,
            )

            if (!alreadyInList) {
              links.push(link)
            }
            existing.studentLinks = links
            existing.alreadyLinked = false
          }

          if (!existing.fullName && parent.fullName) {
            existing.fullName = parent.fullName
          }
        }
      }

      masterData = Array.from(parentByEmail.values()).map((parent: AccountCandidate) => ({
        ...parent,
        studentLinks: [...(parent.studentLinks ?? [])].sort(
          (a: ParentLink, b: ParentLink) => a.studentId.localeCompare(b.studentId),
        ),
      }))
    }

    // =========================================================
    // 6. VALIDASI FORMAT & DEDUPLIKASI EMAIL
    // =========================================================
    if (masterData.length === 0) {
      throw new HttpError(
        `Tidak ada data ${targetGroup} aktif untuk sekolah ini.`,
        404,
      )
    }

    const invalidEmails: string[] = []
    const seenEmails = new Set<string>()
    const uniqueMasterData: AccountCandidate[] = []

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
      throw new HttpError('Tidak ada data dengan email yang valid.', 400)
    }

    // =========================================================
    // 7. CEK AKUN YANG SUDAH ADA (TERMASUK ORANG TUA MULTI-ANAK)
    // =========================================================
    const {
      data: existingUsers,
      error: existingUsersError,
    } = await supabaseAdmin
      .from('users')
      .select('id, email, role, "schoolId"')
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

    const existingUserRows = (existingUsers as ExistingUserRow[] | null) || []
    const existingUserMap = new Map<string, ExistingUserRow>()

    for (const user of existingUserRows) {
      existingUserMap.set(normalizeEmail(user.email), user)
    }

    let skipped = 0
    const candidates: AccountCandidate[] = []
    const preValidationFailures: Failure[] = []

    for (const person of uniqueMasterData) {
      // 1) Jika data master ini sudah tertaut seluruhnya, lewati
      if (person.alreadyLinked) {
        skipped++
        continue
      }

      const existingAccount = existingUserMap.get(person.email)

      // 2) Email belum ada di sekolah ini -> siap dibuatkan akun baru
      if (!existingAccount) {
        candidates.push(person)
        continue
      }

      // 3) Email sudah ada di sekolah ini & merupakan ORANG_TUA dengan anak baru yang belum tertaut
      if (
        person.role === 'ORANG_TUA' &&
        existingAccount.role === 'ORANG_TUA' &&
        person.studentLinks &&
        person.studentLinks.length > 0
      ) {
        candidates.push({
          ...person,
          existingUserId: existingAccount.id,
        })
        continue
      }

      // 4) Email sudah ada di sekolah ini dengan role berbeda (misal GURU/ADMIN)
      if (
        person.role === 'ORANG_TUA' &&
        existingAccount.role !== 'ORANG_TUA'
      ) {
        preValidationFailures.push({
          email: person.email,
          reason: `Email ini sudah terdaftar sebagai akun ${existingAccount.role} di sekolah ini sehingga tidak dapat digabung otomatis sebagai akun ORANG_TUA.`,
        })
        continue
      }

      // 5) Kasus lainnya: email sudah terpakai -> lewati
      skipped++
    }

    if (candidates.length === 0) {
      return jsonResponse({
        success: preValidationFailures.length === 0,
        message:
          preValidationFailures.length === 0
            ? 'Semua data aktif sudah memiliki akun di sekolah ini.'
            : `Tidak ada akun baru dibuat. ${skipped} data dilewati dan ${preValidationFailures.length} data memerlukan perhatian.`,
        targetGroup,
        schoolId,
        totalSource: masterData.length,
        totalValid: uniqueMasterData.length,
        skipped,
        invalidEmailCount: invalidEmails.length,
        invalidEmails,
        created: 0,
        linked: 0,
        failed: preValidationFailures.length,
        remaining: 0,
        failures: preValidationFailures,
      })
    }

    // =========================================================
    // 8. BATASI JUMLAH PROSES PER EKSEKUSI (MAKSIMAL 50)
    // =========================================================
    const targetData = candidates.slice(0, MAX_ACCOUNTS_PER_RUN)
    const remaining = Math.max(0, candidates.length - targetData.length)

    let created = 0
    let linked = 0
    const failures: Failure[] = [...preValidationFailures]
    const chunks = chunkArray(targetData, CHUNK_SIZE)

    // =========================================================
    // 9. PROSES PEMBUATAN AKUN BARU & PENAUTAN ANAK TAMBAHAN
    // =========================================================
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      await Promise.all(
        chunk.map(async (person: AccountCandidate) => {
          let newlyCreatedAuthUserId: string | null = null

          try {
            // Pastikan kandidat ORANG_TUA memiliki minimal 1 anak yang perlu ditautkan
            if (
              person.role === 'ORANG_TUA' &&
              (!person.studentLinks || person.studentLinks.length === 0)
            ) {
              return
            }

            // =================================================
            // JALUR 1: ORANG TUA SUDAH PUNYA AKUN (TAMBAH ANAK)
            // =================================================
            if (person.role === 'ORANG_TUA' && person.existingUserId && person.studentLinks) {
              const { data: existingLinks, error: checkPrimaryError } = await supabaseAdmin
                .from('user_student_links')
                .select('"studentId", "isPrimary"')
                .eq('schoolId', schoolId)
                .eq('userId', person.existingUserId)

              if (checkPrimaryError) {
                console.error(
                  'Gagal memeriksa tautan anak sebelumnya:',
                  person.email,
                  checkPrimaryError.message,
                )
                failures.push({
                  email: person.email,
                  reason: 'Gagal memeriksa daftar anak yang sudah tertaut pada akun orang tua.',
                })
                return
              }

              const typedExistingLinks = (existingLinks as UserStudentLinkRow[] | null) || []

              const alreadyLinkedIds = new Set(
                typedExistingLinks.map((row: UserStudentLinkRow) => String(row.studentId)),
              )
              const hasPrimaryChild = typedExistingLinks.some(
                (row: UserStudentLinkRow) => row.isPrimary === true,
              )

              const newLinks = person.studentLinks
                .filter((item: ParentLink) => !alreadyLinkedIds.has(item.studentId))
                .sort((a: ParentLink, b: ParentLink) => a.studentId.localeCompare(b.studentId))

              if (newLinks.length === 0) {
                skipped++
                return
              }

              const linksToInsert = newLinks.map((link: ParentLink, index: number) => ({
                id: crypto.randomUUID(),
                schoolId,
                userId: person.existingUserId,
                studentId: link.studentId,
                relationship: link.relationship,
                isPrimary: !hasPrimaryChild && index === 0,
                createdAt: new Date().toISOString(),
              }))

              const { error: appendLinkError } = await supabaseAdmin
                .from('user_student_links')
                .insert(linksToInsert)

              if (appendLinkError) {
                console.error(
                  'Gagal menambahkan tautan anak ke akun orang tua:',
                  person.email,
                  appendLinkError.message,
                )
                failures.push({
                  email: person.email,
                  reason: 'Gagal menambahkan tautan anak baru ke akun orang tua yang sudah ada.',
                })
                return
              }

              linked += newLinks.length
              return
            }

            // =================================================
            // JALUR 2: BUAT AKUN BARU (AUTH + PROFIL + TAUTAN)
            // =================================================
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
                reason: formatAuthErrorReason(authCreateError.message || ''),
              })
              return
            }

            const userId = authResult?.user?.id

            if (!userId) {
              failures.push({
                email: person.email,
                reason: 'Supabase tidak mengembalikan ID pengguna Auth.',
              })
              return
            }

            newlyCreatedAuthUserId = userId

            // B. Buat profil aplikasi di tabel public.users
            const { error: profileError } = await supabaseAdmin
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

              const rolledBack = await rollbackAuthUser(
                supabaseAdmin,
                userId,
              )
              newlyCreatedAuthUserId = null

              failures.push({
                email: person.email,
                reason: rolledBack
                  ? 'Profil pengguna gagal dibuat. Akun Auth sementara telah dibersihkan.'
                  : 'Profil pengguna gagal dibuat dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
              })
              return
            }

            // C. Tautkan akun ke tabel master masing-masing role
            if (person.role === 'GURU') {
              const { error: teacherLinkError } = await supabaseAdmin
                .from('teachers')
                .update({ userId })
                .eq('id', person.id)
                .eq('schoolId', schoolId)

              if (teacherLinkError) {
                console.error(
                  'Gagal menautkan akun ke data master guru:',
                  person.email,
                  teacherLinkError.message,
                )

                const rolledBack = await rollbackAuthUser(
                  supabaseAdmin,
                  userId,
                )
                newlyCreatedAuthUserId = null

                failures.push({
                  email: person.email,
                  reason: rolledBack
                    ? 'Gagal menautkan akun ke data master guru. Akun Auth dan profil telah dibersihkan.'
                    : 'Gagal menautkan akun ke data master guru dan pembersihan Auth gagal. Perlu pemeriksaan manual.',
                })
                return
              }
            } else if (
              person.role === 'ORANG_TUA' &&
              person.studentLinks &&
              person.studentLinks.length > 0
            ) {
              const sortedLinks = [...person.studentLinks].sort(
                (a: ParentLink, b: ParentLink) => a.studentId.localeCompare(b.studentId),
              )

              const linksToInsert = sortedLinks.map((link: ParentLink, index: number) => ({
                id: crypto.randomUUID(),
                schoolId,
                userId,
                studentId: link.studentId,
                relationship: link.relationship,
                isPrimary: index === 0,
                createdAt: new Date().toISOString(),
              }))

              const { error: linkError } = await supabaseAdmin
                .from('user_student_links')
                .insert(linksToInsert)

              if (linkError) {
                console.error(
                  'Gagal menyimpan relasi orang tua-anak:',
                  person.email,
                  linkError.message,
                )

                const rolledBack = await rollbackAuthUser(
                  supabaseAdmin,
                  userId,
                )
                newlyCreatedAuthUserId = null

                failures.push({
                  email: person.email,
                  reason: rolledBack
                    ? 'Relasi orang tua-anak gagal disimpan. Akun Auth dan profil terkait telah dibersihkan.'
                    : 'Relasi orang tua-anak gagal disimpan dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
                })
                return
              }
            } else if (person.role === 'SISWA') {
              const { error: studentLinkError } = await supabaseAdmin
                .from('user_student_links')
                .insert({
                  id: crypto.randomUUID(),
                  schoolId,
                  userId,
                  studentId: person.id,
                  relationship: 'SISWA',
                  isPrimary: false,
                  createdAt: new Date().toISOString(),
                })

              if (studentLinkError) {
                console.error(
                  'Gagal menyimpan relasi akun siswa:',
                  person.email,
                  studentLinkError.message,
                )

                const rolledBack = await rollbackAuthUser(
                  supabaseAdmin,
                  userId,
                )
                newlyCreatedAuthUserId = null

                failures.push({
                  email: person.email,
                  reason: rolledBack
                    ? 'Relasi akun siswa gagal disimpan. Akun Auth dan profil terkait telah dibersihkan.'
                    : 'Relasi akun siswa gagal disimpan dan pembersihan akun Auth gagal. Perlu pemeriksaan manual.',
                })
                return
              }
            }

            created++
            newlyCreatedAuthUserId = null
          } catch (error) {
            console.error(
              'Kesalahan pemrosesan akun:',
              person.email,
              error,
            )

            let cleanupSucceeded = true

            if (newlyCreatedAuthUserId) {
              cleanupSucceeded = await rollbackAuthUser(
                supabaseAdmin,
                newlyCreatedAuthUserId,
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

      if (i < chunks.length - 1) {
        await delay(DELAY_MS)
      }
    }

    // =========================================================
    // 10. KIRIM LAPORAN HASIL AKHIR
    // =========================================================
    const success = failures.length === 0
    let message = `Selesai. ${created} akun baru dibuat.`

    if (linked > 0) {
      message += ` ${linked} tautan anak ditambahkan ke akun orang tua yang sudah ada.`
    }

    if (skipped > 0) {
      message += ` ${skipped} data dilewati karena akun sudah ada.`
    }

    if (invalidEmails.length > 0) {
      message += ` ${invalidEmails.length} data memiliki email yang tidak valid.`
    }

    if (failures.length > 0) {
      message += ` ${failures.length} data gagal diproses.`
    }

    if (remaining > 0) {
      message += ` Masih ada ${remaining} antrean untuk eksekusi berikutnya.`
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
      linked,
      failed: failures.length,
      remaining,
      failures,
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500

    if (!(error instanceof HttpError)) {
      console.error('Kesalahan internal Edge Function:', error)
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