-- ============================================================
-- SekolahERP — Supabase Full Setup Script
-- ============================================================
-- INSTRUKSI:
-- 1. Buka Supabase Dashboard → SQL Editor
-- 2. Copy-paste SELURUH isi file ini
-- 3. Klik "Run" untuk mengeksekusi
-- ============================================================

-- ============================================================
-- BAGIAN 0: Enable Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BAGIAN 1: Drop existing tables (safe re-run)
-- ============================================================
DROP TABLE IF EXISTS "payment_transactions" CASCADE;
DROP TABLE IF EXISTS "student_bills" CASCADE;
DROP TABLE IF EXISTS "fee_templates" CASCADE;
DROP TABLE IF EXISTS "announcements" CASCADE;
DROP TABLE IF EXISTS "attendances" CASCADE;
DROP TABLE IF EXISTS "student_economics" CASCADE;
DROP TABLE IF EXISTS "student_parents" CASCADE;
DROP TABLE IF EXISTS "students" CASCADE;
DROP TABLE IF EXISTS "classes" CASCADE;
DROP TABLE IF EXISTS "teachers" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "semesters" CASCADE;
DROP TABLE IF EXISTS "academic_years" CASCADE;
DROP TABLE IF EXISTS "schools" CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS verify_login(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_user_with_school(TEXT);

-- ============================================================
-- BAGIAN 2: Create Tables
-- ============================================================

-- Schools
CREATE TABLE "schools" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "name" TEXT NOT NULL,
    "npsn" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "settings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- Academic Years
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- Semesters
CREATE TABLE "semesters" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "academicYearId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- Users
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Refresh Tokens
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- Audit Logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "userId" TEXT,
    "schoolId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Teachers
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "nuptk" TEXT,
    "nip" TEXT,
    "fullName" TEXT NOT NULL,
    "nik" TEXT,
    "gender" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "birthPlace" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "education" TEXT,
    "major" TEXT,
    "university" TEXT,
    "status" TEXT,
    "position" TEXT,
    "isCertified" BOOLEAN NOT NULL DEFAULT false,
    "certificationNumber" TEXT,
    "joinDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseSalary" DOUBLE PRECISION,
    "subjects" TEXT,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- Classes
CREATE TABLE "classes" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "major" TEXT,
    "homeroomTeacherId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 36,
    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- Students
CREATE TABLE "students" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "nisn" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "noKk" TEXT,
    "fullName" TEXT NOT NULL,
    "nickname" TEXT,
    "gender" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "birthPlace" TEXT NOT NULL,
    "religion" TEXT,
    "address" TEXT NOT NULL,
    "rt" TEXT,
    "rw" TEXT,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "distanceToSchool" DOUBLE PRECISION,
    "transport" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "previousSchool" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- Student Parents
CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "studentId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nik" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "education" TEXT,
    "occupation" TEXT,
    "monthlyIncome" DOUBLE PRECISION,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "address" TEXT,
    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("id")
);

-- Student Economics
CREATE TABLE "student_economics" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "studentId" TEXT NOT NULL,
    "hasKip" BOOLEAN NOT NULL DEFAULT false,
    "kipNumber" TEXT,
    "hasKks" BOOLEAN NOT NULL DEFAULT false,
    "kksNumber" TEXT,
    "hasPkh" BOOLEAN NOT NULL DEFAULT false,
    "isDtks" BOOLEAN NOT NULL DEFAULT false,
    "houseOwnership" TEXT,
    "houseCondition" TEXT,
    "dependentsCount" INTEGER,
    "isOrphan" BOOLEAN NOT NULL DEFAULT false,
    "orphanType" TEXT,
    "pipScore" DOUBLE PRECISION,
    "economicCategory" TEXT,
    "scoringDetails" TEXT,
    "scoredAt" TIMESTAMP(3),
    CONSTRAINT "student_economics_pkey" PRIMARY KEY ("id")
);

-- Attendances
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- Announcements
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'SEMUA',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- Fee Templates
CREATE TABLE "fee_templates" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_templates_pkey" PRIMARY KEY ("id")
);

-- Student Bills
CREATE TABLE "student_bills" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'BELUM_BAYAR',
    "dueDate" TIMESTAMP(3),
    "academicYearId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_bills_pkey" PRIMARY KEY ("id")
);

-- Payment Transactions
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    "billId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "recordedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BERHASIL',
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- BAGIAN 3: Indexes
-- ============================================================

CREATE UNIQUE INDEX "schools_npsn_key" ON "schools"("npsn");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE UNIQUE INDEX "students_schoolId_nisn_key" ON "students"("schoolId", "nisn");
CREATE UNIQUE INDEX "student_economics_studentId_key" ON "student_economics"("studentId");
CREATE UNIQUE INDEX "attendances_studentId_date_key" ON "attendances"("studentId", "date");

-- ============================================================
-- BAGIAN 4: Foreign Keys
-- ============================================================

ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "students" ADD CONSTRAINT "students_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "students" ADD CONSTRAINT "students_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_economics" ADD CONSTRAINT "student_economics_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teachers" ADD CONSTRAINT "teachers_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes" ADD CONSTRAINT "classes_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroomTeacherId_fkey"
    FOREIGN KEY ("homeroomTeacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_bills" ADD CONSTRAINT "student_bills_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_bills" ADD CONSTRAINT "student_bills_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "student_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- BAGIAN 5: Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_economics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow anon key to read/write for now (app-level auth)
-- In production, you should tighten these policies

-- Schools: Read for all, write for authenticated
CREATE POLICY "schools_read" ON "schools" FOR SELECT USING (true);
CREATE POLICY "schools_write" ON "schools" FOR ALL USING (true);

-- Academic Years
CREATE POLICY "academic_years_read" ON "academic_years" FOR SELECT USING (true);
CREATE POLICY "academic_years_write" ON "academic_years" FOR ALL USING (true);

-- Semesters
CREATE POLICY "semesters_read" ON "semesters" FOR SELECT USING (true);
CREATE POLICY "semesters_write" ON "semesters" FOR ALL USING (true);

-- Users: Allow login queries and profile access
CREATE POLICY "users_read" ON "users" FOR SELECT USING (true);
CREATE POLICY "users_write" ON "users" FOR ALL USING (true);

-- Refresh Tokens
CREATE POLICY "refresh_tokens_all" ON "refresh_tokens" FOR ALL USING (true);

-- Audit Logs
CREATE POLICY "audit_logs_all" ON "audit_logs" FOR ALL USING (true);

-- Teachers
CREATE POLICY "teachers_read" ON "teachers" FOR SELECT USING (true);
CREATE POLICY "teachers_write" ON "teachers" FOR ALL USING (true);

-- Classes
CREATE POLICY "classes_read" ON "classes" FOR SELECT USING (true);
CREATE POLICY "classes_write" ON "classes" FOR ALL USING (true);

-- Students
CREATE POLICY "students_read" ON "students" FOR SELECT USING (true);
CREATE POLICY "students_write" ON "students" FOR ALL USING (true);

-- Student Parents
CREATE POLICY "student_parents_all" ON "student_parents" FOR ALL USING (true);

-- Student Economics
CREATE POLICY "student_economics_all" ON "student_economics" FOR ALL USING (true);

-- Attendances
CREATE POLICY "attendances_all" ON "attendances" FOR ALL USING (true);

-- Announcements
CREATE POLICY "announcements_read" ON "announcements" FOR SELECT USING (true);
CREATE POLICY "announcements_write" ON "announcements" FOR ALL USING (true);

-- Fee Templates
CREATE POLICY "fee_templates_all" ON "fee_templates" FOR ALL USING (true);

-- Student Bills
CREATE POLICY "student_bills_all" ON "student_bills" FOR ALL USING (true);

-- Payment Transactions
CREATE POLICY "payment_transactions_all" ON "payment_transactions" FOR ALL USING (true);

-- ============================================================
-- BAGIAN 6: RPC Function — verify_login
-- ============================================================
-- This function verifies email + password and returns user data
-- Password is hashed using pgcrypto's crypt() with bf (bcrypt)

CREATE OR REPLACE FUNCTION verify_login(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
    v_school RECORD;
    v_academic_year RECORD;
BEGIN
    -- Find user by email
    SELECT * INTO v_user
    FROM "users"
    WHERE "email" = p_email
      AND "isActive" = true;

    -- User not found
    IF v_user IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Email atau kata sandi salah'
        );
    END IF;

    -- Verify password
    IF v_user."passwordHash" != crypt(p_password, v_user."passwordHash") THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Email atau kata sandi salah'
        );
    END IF;

    -- Get school data
    SELECT * INTO v_school
    FROM "schools"
    WHERE "id" = v_user."schoolId";

    -- Get active academic year
    SELECT * INTO v_academic_year
    FROM "academic_years"
    WHERE "schoolId" = v_user."schoolId"
      AND "isActive" = true
    LIMIT 1;

    -- Update last login
    UPDATE "users"
    SET "lastLogin" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = v_user."id";

    -- Return success with user, school, and academic year data
    RETURN json_build_object(
        'success', true,
        'message', 'Login berhasil',
        'user', json_build_object(
            'id', v_user."id",
            'email', v_user."email",
            'fullName', v_user."fullName",
            'role', v_user."role",
            'avatarUrl', v_user."avatarUrl",
            'schoolId', v_user."schoolId",
            'isActive', v_user."isActive",
            'lastLogin', v_user."lastLogin"
        ),
        'school', CASE WHEN v_school IS NOT NULL THEN json_build_object(
            'id', v_school."id",
            'name', v_school."name",
            'npsn', v_school."npsn",
            'level', v_school."level",
            'type', v_school."type",
            'address', v_school."address",
            'city', v_school."city",
            'province', v_school."province",
            'phone', v_school."phone",
            'email', v_school."email",
            'logoUrl', v_school."logoUrl"
        ) ELSE NULL END,
        'academicYear', CASE WHEN v_academic_year IS NOT NULL THEN json_build_object(
            'id', v_academic_year."id",
            'name', v_academic_year."name",
            'startYear', v_academic_year."startYear",
            'endYear', v_academic_year."endYear",
            'isActive', v_academic_year."isActive"
        ) ELSE NULL END
    );
END;
$$;

-- ============================================================
-- BAGIAN 7: Seed Data
-- ============================================================

-- 7.1: Insert School
INSERT INTO "schools" ("id", "name", "npsn", "level", "type", "address", "city", "province", "phone", "email", "updatedAt")
VALUES (
    'school-001',
    'SMK Nusantara Informatika',
    '20512345',
    'SMK',
    'SWASTA',
    'Jl. Pendidikan No. 123, Kel. Sukamaju',
    'Bandung',
    'Jawa Barat',
    '022-1234567',
    'info@smknusantara.sch.id',
    CURRENT_TIMESTAMP
);

-- 7.2: Insert Academic Year
INSERT INTO "academic_years" ("id", "schoolId", "name", "startYear", "endYear", "isActive")
VALUES (
    'ay-2025-2026',
    'school-001',
    '2025/2026',
    2025,
    2026,
    true
);

-- 7.3: Insert Semesters
INSERT INTO "semesters" ("id", "academicYearId", "type", "startDate", "endDate", "isActive")
VALUES
    ('sem-ganjil-2025', 'ay-2025-2026', 'GANJIL', '2025-07-14', '2025-12-20', false),
    ('sem-genap-2026', 'ay-2025-2026', 'GENAP', '2026-01-05', '2026-06-30', true);

-- 7.4: Insert Users (password: Admin123!)
-- Using pgcrypto crypt() with blowfish (bf)
INSERT INTO "users" ("id", "schoolId", "email", "passwordHash", "fullName", "role", "isActive", "updatedAt")
VALUES
    ('user-001', 'school-001', 'admin@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Ahmad Suryadi', 'SUPER_ADMIN', true, CURRENT_TIMESTAMP),

    ('user-002', 'school-001', 'kepsek@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Dr. Hj. Siti Rahmawati, M.Pd.', 'KEPALA_SEKOLAH', true, CURRENT_TIMESTAMP),

    ('user-003', 'school-001', 'bendahara@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Rina Kurniawan', 'BENDAHARA', true, CURRENT_TIMESTAMP),

    ('user-004', 'school-001', 'operator@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Budi Santoso', 'OPERATOR', true, CURRENT_TIMESTAMP),

    ('user-005', 'school-001', 'guru@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Dewi Anggraeni, S.Pd.', 'GURU', true, CURRENT_TIMESTAMP),

    ('user-006', 'school-001', 'walikelas@smknusantara.sch.id',
     crypt('Admin123!', gen_salt('bf')),
     'Ir. Hendra Wijaya', 'WALI_KELAS', true, CURRENT_TIMESTAMP);

-- 7.5: Insert sample announcements
INSERT INTO "announcements" ("id", "schoolId", "title", "content", "target", "isPinned", "createdBy")
VALUES
    ('ann-001', 'school-001', 'Ujian Akhir Semester Genap 2025/2026',
     'Ujian Akhir Semester Genap akan dilaksanakan pada tanggal 16-27 Juni 2026. Pastikan semua siswa sudah melunasi administrasi.',
     'SEMUA', true, 'user-001'),
    ('ann-002', 'school-001', 'Rapat Guru & Pegawai',
     'Rapat bulanan guru dan pegawai akan dilaksanakan Jumat, 13 Juni 2026 pukul 13:00 di Aula Sekolah.',
     'GURU', false, 'user-002'),
    ('ann-003', 'school-001', 'Pembayaran SPP Bulan Juni',
     'Batas akhir pembayaran SPP bulan Juni 2026 adalah tanggal 15 Juni 2026.',
     'ORANG_TUA', false, 'user-003');

-- ============================================================
-- SELESAI! 🎉
-- ============================================================
-- Tabel yang dibuat: 16
-- User yang dibuat: 6
-- Password untuk semua user: Admin123!
--
-- Akun login:
-- ┌─────────────────────────────────────┬──────────────────┐
-- │ Email                               │ Role             │
-- ├─────────────────────────────────────┼──────────────────┤
-- │ admin@smknusantara.sch.id           │ Super Admin      │
-- │ kepsek@smknusantara.sch.id          │ Kepala Sekolah   │
-- │ bendahara@smknusantara.sch.id       │ Bendahara        │
-- │ operator@smknusantara.sch.id        │ Operator         │
-- │ guru@smknusantara.sch.id            │ Guru             │
-- │ walikelas@smknusantara.sch.id       │ Wali Kelas       │
-- └─────────────────────────────────────┴──────────────────┘
