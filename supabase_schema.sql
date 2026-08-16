-- =====================================================================================
-- DATABASE ERP SEKOLAH v3.1
-- FINAL FOUNDATION
-- Supabase PostgreSQL
--
-- STATUS:
--   FINAL FOUNDATION
--
-- PRINSIP:
--   1. Supabase Auth = sumber autentikasi
--   2. public.users = profile + role + tenant
--   3. SUPER_ADMIN = platform-level, schoolId NULL
--   4. Tidak ada public registration untuk user sekolah
--   5. User sekolah dibuat/dikelola administrator
--   6. Multi-tenant
--   7. RLS isolation berdasarkan schoolId
--   8. SUPER_ADMIN dapat mengelola seluruh tenant
--   9. Password TIDAK disimpan di public.users
--  10. Role authorization mengikuti hirarki aplikasi
--
-- ROLE:
--   SUPER_ADMIN
--   ADMIN
--   KEPALA_SEKOLAH
--   OPERATOR
--   BENDAHARA
--   WALI_KELAS
--   GURU
--   STAFF_TU
--   STAFF_SARPRAS
--   ORANG_TUA
--   SISWA
--
-- =====================================================================================


-- =====================================================================================
-- 0. EXTENSION
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================================================
-- 1. RESET ERP TABLES
-- =====================================================================================

DROP TABLE IF EXISTS
    "payment_transactions",
    "student_bills",
    "fee_templates",
    "scholarship_records",
    "administration_records",
    "inventory_transactions",
    "inventory_items",
    "schedule_entries",
    "subjects",
    "announcements",
    "attendances",
    "student_economics",
    "student_parents",
    "student_class_history",
    "students",
    "classes",
    "teachers",
    "audit_logs",
    "refresh_tokens",
    "users",
    "semesters",
    "academic_years",
    "schools"
CASCADE;


-- =====================================================================================
-- 2. ENUM-LIKE CHECK CONSTANTS
-- =====================================================================================


-- =====================================================================================
-- 3. SCHOOLS
-- =====================================================================================

CREATE TABLE "schools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "name" TEXT NOT NULL,
    "npsn" TEXT NOT NULL,

    "level" TEXT NOT NULL DEFAULT 'BELUM_DIATUR',
    "type" TEXT NOT NULL DEFAULT 'BELUM_DIATUR',

    "address" TEXT NOT NULL DEFAULT '-',
    "city" TEXT NOT NULL DEFAULT '-',
    "province" TEXT NOT NULL DEFAULT '-',

    "postalCode" TEXT,

    "phone" TEXT,
    "email" TEXT,

    "logoUrl" TEXT,

    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "schools_npsn_check"
        CHECK (length(trim("npsn")) >= 8)
);


CREATE UNIQUE INDEX "schools_npsn_key"
ON "schools"("npsn");


-- =====================================================================================
-- 4. ACADEMIC YEARS
-- =====================================================================================

CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "name" TEXT NOT NULL,

    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,

    "isActive" BOOLEAN NOT NULL DEFAULT false,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "academic_years_year_check"
        CHECK ("endYear" = "startYear" + 1),

    CONSTRAINT "academic_years_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


CREATE UNIQUE INDEX "academic_years_school_year_key"
ON "academic_years"
(
    "schoolId",
    "startYear",
    "endYear"
);


CREATE INDEX "academic_years_schoolId_idx"
ON "academic_years"("schoolId");


-- =====================================================================================
-- 5. SEMESTERS
-- =====================================================================================

CREATE TABLE "semesters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,

    "type" TEXT NOT NULL,

    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    "isActive" BOOLEAN NOT NULL DEFAULT false,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "semesters_type_check"
        CHECK ("type" IN ('GANJIL', 'GENAP')),

    CONSTRAINT "semesters_date_check"
        CHECK ("endDate" > "startDate"),

    CONSTRAINT "semesters_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "semesters_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "semesters_academic_year_type_key"
ON "semesters"
(
    "academicYearId",
    "type"
);


CREATE INDEX "semesters_schoolId_idx"
ON "semesters"("schoolId");

CREATE INDEX "semesters_academicYearId_idx"
ON "semesters"("academicYearId");


-- =====================================================================================
-- 6. USERS / PROFILE
--
-- ID HARUS SAMA DENGAN auth.users.id
--
-- SUPER_ADMIN:
--   schoolId = NULL
--
-- USER SEKOLAH:
--   schoolId = UUID sekolah
--
-- PASSWORD TIDAK DISIMPAN DI SINI.
-- =====================================================================================

CREATE TABLE "users" (
    "id" UUID NOT NULL,

    "schoolId" UUID,

    "email" TEXT NOT NULL,

    "fullName" TEXT NOT NULL,

    "role" TEXT NOT NULL DEFAULT 'OPERATOR',

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "avatarUrl" TEXT,

    "lastLogin" TIMESTAMPTZ,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "users_auth_fkey"
        FOREIGN KEY ("id")
        REFERENCES auth.users("id")
        ON DELETE CASCADE,

    CONSTRAINT "users_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "users_role_check"
        CHECK (
            "role" IN (
                'SUPER_ADMIN',
                'ADMIN',
                'KEPALA_SEKOLAH',
                'OPERATOR',
                'BENDAHARA',
                'WALI_KELAS',
                'GURU',
                'STAFF_TU',
                'STAFF_SARPRAS',
                'ORANG_TUA',
                'SISWA'
            )
        ),

    CONSTRAINT "users_super_admin_school_check"
        CHECK (
            ("role" = 'SUPER_ADMIN' AND "schoolId" IS NULL)
            OR
            ("role" <> 'SUPER_ADMIN' AND "schoolId" IS NOT NULL)
        )
);


CREATE UNIQUE INDEX "users_email_key"
ON "users"(lower("email"));


CREATE INDEX "users_schoolId_idx"
ON "users"("schoolId");

CREATE INDEX "users_role_idx"
ON "users"("role");


-- =====================================================================================
-- 7. REFRESH TOKENS
--
-- LEGACY / INTERNAL ONLY.
-- Supabase Auth tetap menjadi pengelola session.
-- =====================================================================================

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "userId" UUID NOT NULL,

    "token" TEXT NOT NULL,

    "expiresAt" TIMESTAMPTZ NOT NULL,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "refresh_tokens_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "users"("id")
        ON DELETE CASCADE
);


CREATE UNIQUE INDEX "refresh_tokens_token_key"
ON "refresh_tokens"("token");

CREATE INDEX "refresh_tokens_userId_idx"
ON "refresh_tokens"("userId");


-- =====================================================================================
-- 8. AUDIT LOGS
-- =====================================================================================

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "userId" UUID,

    "schoolId" UUID,

    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,

    "entityType" TEXT,
    "entityId" TEXT,

    "oldValues" JSONB,
    "newValues" JSONB,

    "ipAddress" TEXT,
    "userAgent" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "audit_logs_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "users"("id")
        ON DELETE SET NULL,

    CONSTRAINT "audit_logs_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE SET NULL
);


CREATE INDEX "audit_logs_schoolId_idx"
ON "audit_logs"("schoolId");

CREATE INDEX "audit_logs_userId_idx"
ON "audit_logs"("userId");

CREATE INDEX "audit_logs_createdAt_idx"
ON "audit_logs"("createdAt");


-- =====================================================================================
-- 9. TEACHERS
-- =====================================================================================

CREATE TABLE "teachers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "nuptk" TEXT,
    "nip" TEXT,
    "nik" TEXT,

    "fullName" TEXT NOT NULL,

    "gender" TEXT NOT NULL,

    "birthDate" DATE,
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

    "joinDate" DATE,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "baseSalary" NUMERIC(15,2),

    "subjects" TEXT,

    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 24,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "teachers_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT
);


CREATE INDEX "teachers_schoolId_idx"
ON "teachers"("schoolId");

CREATE INDEX "teachers_fullName_idx"
ON "teachers"("fullName");


-- =====================================================================================
-- 10. CLASSES
-- =====================================================================================

CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,

    "name" TEXT NOT NULL,

    "gradeLevel" INTEGER NOT NULL,

    "major" TEXT,

    "homeroomTeacherId" UUID,

    "capacity" INTEGER NOT NULL DEFAULT 36,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "classes_capacity_check"
        CHECK ("capacity" > 0),

    CONSTRAINT "classes_grade_check"
        CHECK ("gradeLevel" > 0),

    CONSTRAINT "classes_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "classes_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "classes_homeroomTeacherId_fkey"
        FOREIGN KEY ("homeroomTeacherId")
        REFERENCES "teachers"("id")
        ON DELETE SET NULL
);


CREATE UNIQUE INDEX "classes_school_year_name_key"
ON "classes"
(
    "schoolId",
    "academicYearId",
    "name"
);


CREATE INDEX "classes_schoolId_idx"
ON "classes"("schoolId");

CREATE INDEX "classes_academicYearId_idx"
ON "classes"("academicYearId");

CREATE INDEX "classes_homeroomTeacherId_idx"
ON "classes"("homeroomTeacherId");


-- =====================================================================================
-- 11. STUDENTS
-- =====================================================================================

CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "nis" TEXT,
    "nisn" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "noKk" TEXT,

    "fullName" TEXT NOT NULL,
    "nickname" TEXT,

    "gender" TEXT NOT NULL,

    "birthDate" DATE NOT NULL,
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

    "status" TEXT NOT NULL DEFAULT 'AKTIF',

    "entryDate" DATE NOT NULL DEFAULT CURRENT_DATE,

    "classId" UUID,

    "skhun" TEXT,
    "noPesertaUn" TEXT,
    "noIjazah" TEXT,
    "noAktaLahir" TEXT,

    "anakKe" INTEGER,
    "jmlSaudara" INTEGER,

    "lintang" TEXT,
    "bujur" TEXT,

    "beratBadan" DOUBLE PRECISION,
    "tinggiBadan" DOUBLE PRECISION,
    "lingkarKepala" DOUBLE PRECISION,
    "jarakSekolah" DOUBLE PRECISION,

    "jenisTinggal" TEXT,
    "alatTransportasi" TEXT,
    "kebutuhanKhusus" TEXT,

    "sekolahAsal" TEXT,

    "bank" TEXT,
    "noRekening" TEXT,
    "namaRekening" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "students_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "students_classId_fkey"
        FOREIGN KEY ("classId")
        REFERENCES "classes"("id")
        ON DELETE SET NULL
);


CREATE UNIQUE INDEX "students_school_nisn_key"
ON "students"("schoolId", "nisn");

CREATE UNIQUE INDEX "students_school_nis_key"
ON "students"("schoolId", "nis")
WHERE "nis" IS NOT NULL;

CREATE UNIQUE INDEX "students_school_nik_key"
ON "students"("schoolId", "nik");


CREATE INDEX "students_schoolId_idx"
ON "students"("schoolId");

CREATE INDEX "students_classId_idx"
ON "students"("classId");

CREATE INDEX "students_fullName_idx"
ON "students"("fullName");


-- =====================================================================================
-- 12. STUDENT CLASS HISTORY
-- =====================================================================================

CREATE TABLE "student_class_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "academicYearId" UUID NOT NULL,

    "classId" UUID NOT NULL,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_class_history_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_class_history_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_class_history_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE CASCADE,

    CONSTRAINT "student_class_history_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_class_history_classId_fkey"
        FOREIGN KEY ("classId")
        REFERENCES "classes"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "student_class_history_unique"
ON "student_class_history"
(
    "studentId",
    "academicYearId"
);


CREATE INDEX "student_history_studentId_idx"
ON "student_class_history"("studentId");

CREATE INDEX "student_history_academicYearId_idx"
ON "student_class_history"("academicYearId");


-- =====================================================================================
-- 13. STUDENT PARENTS
-- =====================================================================================

CREATE TABLE "student_parents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "relation" TEXT NOT NULL,

    "fullName" TEXT NOT NULL,

    "nik" TEXT,

    "phone" TEXT,
    "email" TEXT,

    "education" TEXT,
    "occupation" TEXT,

    "monthlyIncome" NUMERIC(15,2),

    "isAlive" BOOLEAN NOT NULL DEFAULT true,

    "address" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_parents_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_parents_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE CASCADE
);


CREATE INDEX "parents_studentId_idx"
ON "student_parents"("studentId");

CREATE INDEX "parents_schoolId_idx"
ON "student_parents"("schoolId");


-- =====================================================================================
-- 14. STUDENT ECONOMICS
-- =====================================================================================

CREATE TABLE "student_economics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "hasKip" BOOLEAN NOT NULL DEFAULT false,
    "kipNumber" TEXT,
    "namaKip" TEXT,

    "layakPip" BOOLEAN NOT NULL DEFAULT false,
    "alasanLayakPip" TEXT,

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

    "scoringDetails" JSONB,

    "scoredAt" TIMESTAMPTZ,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_economics_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_economics_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_economics_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE CASCADE
);


CREATE UNIQUE INDEX "student_economics_studentId_key"
ON "student_economics"("studentId");


CREATE INDEX "economics_schoolId_idx"
ON "student_economics"("schoolId");


-- =====================================================================================
-- 15. ATTENDANCES
-- =====================================================================================

CREATE TABLE "attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "date" DATE NOT NULL,

    "status" TEXT NOT NULL,

    "notes" TEXT,

    "recordedBy" UUID,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "attendances_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "attendances_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE CASCADE,

    CONSTRAINT "attendances_recordedBy_fkey"
        FOREIGN KEY ("recordedBy")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);


CREATE UNIQUE INDEX "attendances_student_date_key"
ON "attendances"("studentId", "date");


CREATE INDEX "attendances_schoolId_idx"
ON "attendances"("schoolId");

CREATE INDEX "attendances_date_idx"
ON "attendances"("date");


-- =====================================================================================
-- 16. SUBJECTS
-- =====================================================================================

CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "code" TEXT,
    "name" TEXT NOT NULL,

    "description" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "subjects_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "subjects_school_code_key"
ON "subjects"("schoolId", "code")
WHERE "code" IS NOT NULL;

CREATE INDEX "subjects_schoolId_idx"
ON "subjects"("schoolId");


-- =====================================================================================
-- 17. SCHEDULES
-- =====================================================================================

CREATE TABLE "schedule_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "academicYearId" UUID NOT NULL,

    "classId" UUID NOT NULL,

    "subjectId" UUID,

    "teacherId" UUID,

    "dayOfWeek" INTEGER NOT NULL,

    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,

    "room" TEXT,

    "notes" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_entries_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "schedule_entries_day_check"
        CHECK ("dayOfWeek" BETWEEN 1 AND 7),

    CONSTRAINT "schedule_entries_time_check"
        CHECK ("endTime" > "startTime"),

    CONSTRAINT "schedule_entries_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "schedule_entries_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "schedule_entries_classId_fkey"
        FOREIGN KEY ("classId")
        REFERENCES "classes"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "schedule_entries_subjectId_fkey"
        FOREIGN KEY ("subjectId")
        REFERENCES "subjects"("id")
        ON DELETE SET NULL,

    CONSTRAINT "schedule_entries_teacherId_fkey"
        FOREIGN KEY ("teacherId")
        REFERENCES "teachers"("id")
        ON DELETE SET NULL
);


CREATE INDEX "schedule_schoolId_idx"
ON "schedule_entries"("schoolId");

CREATE INDEX "schedule_classId_idx"
ON "schedule_entries"("classId");

CREATE INDEX "schedule_teacherId_idx"
ON "schedule_entries"("teacherId");


-- =====================================================================================
-- 18. ANNOUNCEMENTS
-- =====================================================================================

CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    "target" TEXT NOT NULL DEFAULT 'SEMUA',

    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    "publishDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireDate" TIMESTAMPTZ,

    "createdBy" UUID,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "announcements_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "announcements_createdBy_fkey"
        FOREIGN KEY ("createdBy")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);


CREATE INDEX "announcements_schoolId_idx"
ON "announcements"("schoolId");


-- =====================================================================================
-- 19. INVENTORY ITEMS
-- =====================================================================================

CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "code" TEXT,
    "name" TEXT NOT NULL,

    "category" TEXT,
    "unit" TEXT,

    "quantity" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "minimumStock" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "location" TEXT,

    "condition" TEXT DEFAULT 'BAIK',

    "description" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "inventory_items_quantity_check"
        CHECK ("quantity" >= 0),

    CONSTRAINT "inventory_items_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "inventory_items_school_code_key"
ON "inventory_items"("schoolId", "code")
WHERE "code" IS NOT NULL;


CREATE INDEX "inventory_items_schoolId_idx"
ON "inventory_items"("schoolId");


-- =====================================================================================
-- 20. INVENTORY TRANSACTIONS
-- =====================================================================================

CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "itemId" UUID NOT NULL,

    "type" TEXT NOT NULL,

    "quantity" NUMERIC(15,2) NOT NULL,

    "reference" TEXT,

    "notes" TEXT,

    "recordedBy" UUID,

    "transactionDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "inventory_transactions_type_check"
        CHECK ("type" IN ('MASUK', 'KELUAR', 'PENYESUAIAN')),

    CONSTRAINT "inventory_transactions_quantity_check"
        CHECK ("quantity" > 0),

    CONSTRAINT "inventory_transactions_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "inventory_transactions_itemId_fkey"
        FOREIGN KEY ("itemId")
        REFERENCES "inventory_items"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "inventory_transactions_recordedBy_fkey"
        FOREIGN KEY ("recordedBy")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);


CREATE INDEX "inventory_transactions_schoolId_idx"
ON "inventory_transactions"("schoolId");

CREATE INDEX "inventory_transactions_itemId_idx"
ON "inventory_transactions"("itemId");


-- =====================================================================================
-- 21. ADMINISTRATION
-- =====================================================================================

CREATE TABLE "administration_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "category" TEXT NOT NULL,

    "title" TEXT NOT NULL,

    "documentNumber" TEXT,

    "description" TEXT,

    "documentUrl" TEXT,

    "documentDate" DATE,

    "status" TEXT NOT NULL DEFAULT 'AKTIF',

    "createdBy" UUID,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administration_records_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "administration_records_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "administration_records_createdBy_fkey"
        FOREIGN KEY ("createdBy")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);


CREATE INDEX "administration_schoolId_idx"
ON "administration_records"("schoolId");


-- =====================================================================================
-- 22. SCHOLARSHIPS
-- =====================================================================================

CREATE TABLE "scholarship_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "type" TEXT NOT NULL,

    "name" TEXT NOT NULL,

    "provider" TEXT,

    "amount" NUMERIC(15,2),

    "startDate" DATE,
    "endDate" DATE,

    "status" TEXT NOT NULL DEFAULT 'AKTIF',

    "notes" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarship_records_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "scholarship_records_amount_check"
        CHECK ("amount" IS NULL OR "amount" >= 0),

    CONSTRAINT "scholarship_records_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "scholarship_records_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE CASCADE
);


CREATE INDEX "scholarships_schoolId_idx"
ON "scholarship_records"("schoolId");

CREATE INDEX "scholarships_studentId_idx"
ON "scholarship_records"("studentId");


-- =====================================================================================
-- 23. FEE TEMPLATES
-- =====================================================================================

CREATE TABLE "fee_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "academicYearId" UUID NOT NULL,

    "name" TEXT NOT NULL,

    "category" TEXT NOT NULL,

    "gradeLevel" INTEGER,

    "amount" NUMERIC(15,2) NOT NULL,

    "periodType" TEXT NOT NULL DEFAULT 'BULANAN',

    "description" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_templates_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "fee_templates_amount_check"
        CHECK ("amount" >= 0),

    CONSTRAINT "fee_templates_period_check"
        CHECK (
            "periodType"
            IN ('BULANAN', 'TAHUNAN', 'SEKALI_BAYAR')
        ),

    CONSTRAINT "fee_templates_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "fee_templates_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "fee_templates_unique"
ON "fee_templates"
(
    "schoolId",
    "academicYearId",
    "name",
    "gradeLevel"
);


CREATE INDEX "fee_templates_schoolId_idx"
ON "fee_templates"("schoolId");


-- =====================================================================================
-- 24. STUDENT BILLS
-- =====================================================================================

CREATE TABLE "student_bills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "feeTemplateId" UUID NOT NULL,

    "academicYearId" UUID NOT NULL,

    "title" TEXT NOT NULL,

    "periodMonth" INTEGER,

    "periodYear" INTEGER,

    "totalAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "paidAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "status" TEXT NOT NULL DEFAULT 'BELUM_BAYAR',

    "dueDate" DATE,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_bills_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_bills_amount_check"
        CHECK (
            "totalAmount" >= 0
            AND "paidAmount" >= 0
            AND "paidAmount" <= "totalAmount"
        ),

    CONSTRAINT "student_bills_month_check"
        CHECK (
            "periodMonth" IS NULL
            OR "periodMonth" BETWEEN 1 AND 12
        ),

    CONSTRAINT "student_bills_status_check"
        CHECK (
            "status" IN (
                'BELUM_BAYAR',
                'CICILAN',
                'LUNAS',
                'DIBATALKAN'
            )
        ),

    CONSTRAINT "student_bills_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_bills_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_bills_feeTemplateId_fkey"
        FOREIGN KEY ("feeTemplateId")
        REFERENCES "fee_templates"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "student_bills_academicYearId_fkey"
        FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id")
        ON DELETE RESTRICT
);


CREATE UNIQUE INDEX "student_bills_unique_period"
ON "student_bills"
(
    "studentId",
    "feeTemplateId",
    "academicYearId",
    "periodMonth",
    "periodYear"
);


CREATE INDEX "bills_schoolId_idx"
ON "student_bills"("schoolId");

CREATE INDEX "bills_studentId_idx"
ON "student_bills"("studentId");

CREATE INDEX "bills_academicYearId_idx"
ON "student_bills"("academicYearId");

CREATE INDEX "bills_status_idx"
ON "student_bills"("status");


-- =====================================================================================
-- 25. PAYMENT TRANSACTIONS
-- =====================================================================================

CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    "schoolId" UUID NOT NULL,

    "billId" UUID NOT NULL,

    "studentId" UUID NOT NULL,

    "amount" NUMERIC(15,2) NOT NULL,

    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',

    "paymentDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "reference" TEXT,

    "recordedBy" UUID,

    "status" TEXT NOT NULL DEFAULT 'BERHASIL',

    "notes" TEXT,

    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "payment_transactions_amount_check"
        CHECK ("amount" > 0),

    CONSTRAINT "payment_transactions_status_check"
        CHECK (
            "status" IN ('BERHASIL', 'DIBATALKAN')
        ),

    CONSTRAINT "payment_transactions_schoolId_fkey"
        FOREIGN KEY ("schoolId")
        REFERENCES "schools"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "payment_transactions_billId_fkey"
        FOREIGN KEY ("billId")
        REFERENCES "student_bills"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "payment_transactions_studentId_fkey"
        FOREIGN KEY ("studentId")
        REFERENCES "students"("id")
        ON DELETE RESTRICT,

    CONSTRAINT "payment_transactions_recordedBy_fkey"
        FOREIGN KEY ("recordedBy")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);


CREATE INDEX "payments_billId_idx"
ON "payment_transactions"("billId");

CREATE INDEX "payments_studentId_idx"
ON "payment_transactions"("studentId");

CREATE INDEX "payments_schoolId_idx"
ON "payment_transactions"("schoolId");


-- =====================================================================================
-- 26. SECURITY FUNCTIONS
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "schoolId"
    FROM public.users
    WHERE "id" = auth.uid()
    LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "role"
    FROM public.users
    WHERE "id" = auth.uid()
    LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT "isActive"
            FROM public.users
            WHERE "id" = auth.uid()
        ),
        false
    );
$$;


CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE "id" = auth.uid()
          AND "role" = 'SUPER_ADMIN'
          AND "isActive" = true
          AND "schoolId" IS NULL
    );
$$;


CREATE OR REPLACE FUNCTION public.is_school_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE "id" = auth.uid()
          AND "role" IN (
              'SUPER_ADMIN',
              'ADMIN'
          )
          AND "isActive" = true
    );
$$;


-- =====================================================================================
-- 27. UPDATE TIMESTAMP FUNCTION
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


-- =====================================================================================
-- 28. UPDATED AT TRIGGERS
-- =====================================================================================

CREATE TRIGGER "schools_updatedAt"
BEFORE UPDATE ON "schools"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "academic_years_updatedAt"
BEFORE UPDATE ON "academic_years"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "semesters_updatedAt"
BEFORE UPDATE ON "semesters"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "users_updatedAt"
BEFORE UPDATE ON "users"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "teachers_updatedAt"
BEFORE UPDATE ON "teachers"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "classes_updatedAt"
BEFORE UPDATE ON "classes"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "students_updatedAt"
BEFORE UPDATE ON "students"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_parents_updatedAt"
BEFORE UPDATE ON "student_parents"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_economics_updatedAt"
BEFORE UPDATE ON "student_economics"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "subjects_updatedAt"
BEFORE UPDATE ON "subjects"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "schedule_entries_updatedAt"
BEFORE UPDATE ON "schedule_entries"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "announcements_updatedAt"
BEFORE UPDATE ON "announcements"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "inventory_items_updatedAt"
BEFORE UPDATE ON "inventory_items"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "administration_records_updatedAt"
BEFORE UPDATE ON "administration_records"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "scholarship_records_updatedAt"
BEFORE UPDATE ON "scholarship_records"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "fee_templates_updatedAt"
BEFORE UPDATE ON "fee_templates"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_bills_updatedAt"
BEFORE UPDATE ON "student_bills"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- =====================================================================================
-- 29. PAYMENT STATUS RECALCULATION
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.recalculate_student_bill(
    p_bill_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total NUMERIC(15,2);
    v_paid NUMERIC(15,2);
BEGIN

    SELECT "totalAmount"
    INTO v_total
    FROM public.student_bills
    WHERE "id" = p_bill_id;

    IF v_total IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN "status" = 'BERHASIL'
                THEN "amount"
                ELSE 0
            END
        ),
        0
    )
    INTO v_paid
    FROM public.payment_transactions
    WHERE "billId" = p_bill_id;

    UPDATE public.student_bills
    SET
        "paidAmount" = LEAST(v_paid, v_total),
        "status" =
            CASE
                WHEN v_paid <= 0
                    THEN 'BELUM_BAYAR'
                WHEN v_paid >= v_total
                    THEN 'LUNAS'
                ELSE 'CICILAN'
            END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_bill_id;

END;
$$;


CREATE OR REPLACE FUNCTION public.payment_change_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    IF TG_OP = 'DELETE' THEN

        PERFORM public.recalculate_student_bill(
            OLD."billId"
        );

        RETURN OLD;

    END IF;


    PERFORM public.recalculate_student_bill(
        NEW."billId"
    );


    IF TG_OP = 'UPDATE'
       AND OLD."billId" IS DISTINCT FROM NEW."billId"
    THEN

        PERFORM public.recalculate_student_bill(
            OLD."billId"
        );

    END IF;


    RETURN NEW;

END;
$$;


CREATE TRIGGER "payment_status_trigger"
AFTER INSERT OR UPDATE OR DELETE
ON "payment_transactions"
FOR EACH ROW
EXECUTE FUNCTION public.payment_change_trigger();


-- =====================================================================================
-- 30. RLS ENABLE
-- =====================================================================================

ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_class_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_economics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "administration_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scholarship_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;


-- =====================================================================================
-- 31. SCHOOLS RLS
-- =====================================================================================

CREATE POLICY "schools_select"
ON "schools"
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR
    "id" = public.get_user_school_id()
);


CREATE POLICY "schools_insert"
ON "schools"
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
);


CREATE POLICY "schools_update"
ON "schools"
FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR
    "id" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR
    "id" = public.get_user_school_id()
);


CREATE POLICY "schools_delete"
ON "schools"
FOR DELETE
TO authenticated
USING (
    public.is_super_admin()
);


-- =====================================================================================
-- 32. ACADEMIC YEARS RLS
-- =====================================================================================

CREATE POLICY "academic_years_select"
ON "academic_years"
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_insert"
ON "academic_years"
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_update"
ON "academic_years"
FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_delete"
ON "academic_years"
FOR DELETE
TO authenticated
USING (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
);


-- =====================================================================================
-- 33. SEMESTERS RLS
-- =====================================================================================

CREATE POLICY "semesters_all"
ON "semesters"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR
    "schoolId" = public.get_user_school_id()
);


-- =====================================================================================
-- 34. USERS RLS
--
-- SUPER_ADMIN:
--   dapat melihat/mengelola semua user
--
-- ADMIN:
--   hanya user dalam sekolahnya
--
-- USER BIASA:
--   hanya profile dirinya sendiri
--
-- SUPER_ADMIN tidak boleh dibuat melalui INSERT biasa oleh ADMIN.
-- =====================================================================================

CREATE POLICY "users_select"
ON "users"
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR
    "id" = auth.uid()
    OR
    (
        "schoolId" = public.get_user_school_id()
        AND public.get_user_role() = 'ADMIN'
    )
);


CREATE POLICY "users_insert"
ON "users"
FOR INSERT
TO authenticated
WITH CHECK (
    (
        public.is_super_admin()
        AND (
            "role" = 'SUPER_ADMIN'
            OR "schoolId" IS NOT NULL
        )
    )
    OR
    (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);


CREATE POLICY "users_update"
ON "users"
FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR
    "id" = auth.uid()
    OR
    (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
    )
)
WITH CHECK (
    (
        public.is_super_admin()
    )
    OR
    (
        "id" = auth.uid()
        AND "schoolId" = public.get_user_school_id()
    )
    OR
    (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);


CREATE POLICY "users_delete"
ON "users"
FOR DELETE
TO authenticated
USING (
    public.is_super_admin()
    OR
    (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);


-- =====================================================================================
-- 35. GENERIC SCHOOL RLS
-- =====================================================================================


-- TEACHERS

CREATE POLICY "teachers_all"
ON "teachers"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- CLASSES

CREATE POLICY "classes_all"
ON "classes"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- STUDENTS

CREATE POLICY "students_all"
ON "students"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- STUDENT HISTORY

CREATE POLICY "student_history_all"
ON "student_class_history"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- PARENTS

CREATE POLICY "parents_all"
ON "student_parents"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- ECONOMICS

CREATE POLICY "economics_all"
ON "student_economics"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- ATTENDANCES

CREATE POLICY "attendances_all"
ON "attendances"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- SUBJECTS

CREATE POLICY "subjects_all"
ON "subjects"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- SCHEDULES

CREATE POLICY "schedule_entries_all"
ON "schedule_entries"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- ANNOUNCEMENTS

CREATE POLICY "announcements_all"
ON "announcements"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- INVENTORY

CREATE POLICY "inventory_items_all"
ON "inventory_items"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


CREATE POLICY "inventory_transactions_all"
ON "inventory_transactions"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- ADMINISTRATION

CREATE POLICY "administration_all"
ON "administration_records"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- SCHOLARSHIPS

CREATE POLICY "scholarships_all"
ON "scholarship_records"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- FEE TEMPLATES

CREATE POLICY "fee_templates_all"
ON "fee_templates"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- STUDENT BILLS

CREATE POLICY "student_bills_all"
ON "student_bills"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- PAYMENTS

CREATE POLICY "payments_all"
ON "payment_transactions"
FOR ALL
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- AUDIT

CREATE POLICY "audit_logs_select"
ON "audit_logs"
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


CREATE POLICY "audit_logs_insert"
ON "audit_logs"
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_super_admin()
    OR "schoolId" = public.get_user_school_id()
);


-- =====================================================================================
-- 36. TENANT SETUP
--
-- HANYA SUPER_ADMIN.
--
-- Fungsi ini:
--   1. Membuat sekolah
--   2. Membuat tahun ajaran awal
--
-- TIDAK membuat akun user baru.
--
-- Akun ADMIN dibuat melalui Supabase Auth oleh sistem/admin.
-- =====================================================================================

DROP FUNCTION IF EXISTS public.setup_new_tenant(
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER
);


CREATE OR REPLACE FUNCTION public.setup_new_tenant(
    p_school_name TEXT,
    p_npsn TEXT,
    p_full_name TEXT,
    p_start_year INTEGER,
    p_end_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_academic_year_id UUID;
BEGIN

    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION
            'Akses ditolak. Hanya SUPER_ADMIN yang dapat membuat sekolah.';
    END IF;


    IF p_school_name IS NULL
       OR trim(p_school_name) = ''
    THEN
        RAISE EXCEPTION
            'Nama sekolah wajib diisi.';
    END IF;


    IF p_npsn IS NULL
       OR trim(p_npsn) = ''
    THEN
        RAISE EXCEPTION
            'NPSN wajib diisi.';
    END IF;


    IF p_start_year IS NULL
       OR p_end_year IS NULL
       OR p_end_year <> p_start_year + 1
    THEN
        RAISE EXCEPTION
            'Tahun ajaran tidak valid.';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM public.schools
        WHERE "npsn" = trim(p_npsn)
    )
    THEN
        RAISE EXCEPTION
            'NPSN tersebut sudah terdaftar.';
    END IF;


    INSERT INTO public.schools
    (
        "name",
        "npsn",
        "level",
        "type",
        "address",
        "city",
        "province"
    )
    VALUES
    (
        trim(p_school_name),
        trim(p_npsn),
        'BELUM_DIATUR',
        'BELUM_DIATUR',
        '-',
        '-',
        '-'
    )
    RETURNING "id"
    INTO v_school_id;


    INSERT INTO public.academic_years
    (
        "schoolId",
        "name",
        "startYear",
        "endYear",
        "isActive"
    )
    VALUES
    (
        v_school_id,
        p_start_year || '/' || p_end_year,
        p_start_year,
        p_end_year,
        true
    )
    RETURNING "id"
    INTO v_academic_year_id;


    RETURN jsonb_build_object(
        'success', true,
        'schoolId', v_school_id,
        'academicYearId', v_academic_year_id,
        'message', 'Sekolah berhasil dibuat.'
    );

END;
$$;


REVOKE EXECUTE
ON FUNCTION public.setup_new_tenant(
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER
)
FROM PUBLIC;


REVOKE EXECUTE
ON FUNCTION public.setup_new_tenant(
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER
)
FROM anon;


GRANT EXECUTE
ON FUNCTION public.setup_new_tenant(
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER
)
TO authenticated;


-- =====================================================================================
-- 37. BULK IMPORT STUDENTS
-- =====================================================================================

DROP FUNCTION IF EXISTS public.bulk_import_students(JSONB);


CREATE OR REPLACE FUNCTION public.bulk_import_students(
    batch_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;

    student_record JSONB;
    parent_record JSONB;
    economic_record JSONB;

    v_student_id UUID;

    v_success_count INTEGER := 0;
BEGIN

    v_school_id := public.get_user_school_id();


    IF v_school_id IS NULL THEN
        RAISE EXCEPTION
            'User tidak terafiliasi dengan sekolah.';
    END IF;


    IF batch_data IS NULL
       OR jsonb_typeof(batch_data) <> 'array'
    THEN
        RAISE EXCEPTION
            'batch_data harus berupa JSON array.';
    END IF;


    FOR student_record IN
        SELECT *
        FROM jsonb_array_elements(batch_data)
    LOOP

        INSERT INTO public.students
        (
            "schoolId",

            "nis",
            "nisn",
            "nik",
            "noKk",

            "fullName",
            "nickname",

            "gender",

            "birthDate",
            "birthPlace",

            "religion",

            "address",
            "rt",
            "rw",

            "kelurahan",
            "kecamatan",

            "city",
            "province",
            "postalCode",

            "phone",
            "email",

            "status",
            "entryDate",

            "classId",

            "anakKe",
            "jmlSaudara",

            "lintang",
            "bujur",

            "beratBadan",
            "tinggiBadan",
            "lingkarKepala",

            "jarakSekolah",

            "jenisTinggal",
            "alatTransportasi",

            "sekolahAsal",
            "kebutuhanKhusus"
        )
        VALUES
        (
            v_school_id,

            NULLIF(student_record->>'nis', ''),
            student_record->>'nisn',
            student_record->>'nik',
            NULLIF(student_record->>'noKk', ''),

            student_record->>'fullName',
            NULLIF(student_record->>'nickname', ''),

            student_record->>'gender',

            (student_record->>'birthDate')::DATE,
            student_record->>'birthPlace',

            NULLIF(student_record->>'religion', ''),

            student_record->>'address',
            NULLIF(student_record->>'rt', ''),
            NULLIF(student_record->>'rw', ''),

            COALESCE(
                NULLIF(student_record->>'village', ''),
                NULLIF(student_record->>'kelurahan', '')
            ),

            COALESCE(
                NULLIF(student_record->>'district', ''),
                NULLIF(student_record->>'kecamatan', '')
            ),

            student_record->>'city',
            student_record->>'province',
            NULLIF(student_record->>'postalCode', ''),

            NULLIF(student_record->>'phone', ''),
            NULLIF(student_record->>'email', ''),

            COALESCE(
                NULLIF(student_record->>'status', ''),
                'AKTIF'
            ),

            COALESCE(
                NULLIF(student_record->>'entryDate', '')::DATE,
                CURRENT_DATE
            ),

            NULLIF(student_record->>'classId', '')::UUID,

            NULLIF(student_record->>'anakKe', '')::INTEGER,
            NULLIF(student_record->>'jmlSaudara', '')::INTEGER,

            NULLIF(student_record->>'lintang', ''),
            NULLIF(student_record->>'bujur', ''),

            NULLIF(student_record->>'beratBadan', '')::DOUBLE PRECISION,
            NULLIF(student_record->>'tinggiBadan', '')::DOUBLE PRECISION,
            NULLIF(student_record->>'lingkarKepala', '')::DOUBLE PRECISION,

            NULLIF(student_record->>'jarakSekolah', '')::DOUBLE PRECISION,

            NULLIF(student_record->>'jenisTinggal', ''),
            NULLIF(student_record->>'alatTransportasi', ''),

            NULLIF(student_record->>'sekolahAsal', ''),
            NULLIF(student_record->>'kebutuhanKhusus', '')
        )
        RETURNING "id"
        INTO v_student_id;


        IF student_record ? 'parents'
           AND jsonb_typeof(student_record->'parents') = 'array'
        THEN

            FOR parent_record IN
                SELECT *
                FROM jsonb_array_elements(
                    student_record->'parents'
                )
            LOOP

                INSERT INTO public.student_parents
                (
                    "schoolId",
                    "studentId",

                    "relation",
                    "fullName",
                    "nik",

                    "phone",
                    "email",

                    "education",
                    "occupation",

                    "monthlyIncome",

                    "isAlive",
                    "address"
                )
                VALUES
                (
                    v_school_id,
                    v_student_id,

                    parent_record->>'relation',
                    parent_record->>'fullName',
                    NULLIF(parent_record->>'nik', ''),

                    NULLIF(parent_record->>'phone', ''),
                    NULLIF(parent_record->>'email', ''),

                    NULLIF(parent_record->>'education', ''),

                    COALESCE(
                        NULLIF(parent_record->>'job', ''),
                        NULLIF(parent_record->>'occupation', '')
                    ),

                    CASE
                        WHEN NULLIF(
                            regexp_replace(
                                COALESCE(
                                    parent_record->>'income',
                                    ''
                                ),
                                '\D',
                                '',
                                'g'
                            ),
                            ''
                        ) IS NULL
                        THEN NULL
                        ELSE
                            regexp_replace(
                                parent_record->>'income',
                                '\D',
                                '',
                                'g'
                            )::NUMERIC(15,2)
                    END,

                    COALESCE(
                        (parent_record->>'isAlive')::BOOLEAN,
                        true
                    ),

                    NULLIF(parent_record->>'address', '')
                );

            END LOOP;

        END IF;


        IF student_record ? 'economic' THEN

            economic_record := student_record->'economic';


            INSERT INTO public.student_economics
            (
                "schoolId",
                "studentId",

                "hasKip",
                "kipNumber",
                "namaKip",

                "layakPip",
                "alasanLayakPip",

                "hasKks",
                "kksNumber",

                "hasPkh",

                "isDtks"
            )
            VALUES
            (
                v_school_id,
                v_student_id,

                COALESCE(
                    (economic_record->>'hasKip')::BOOLEAN,
                    false
                ),

                NULLIF(
                    economic_record->>'kipNumber',
                    ''
                ),

                NULLIF(
                    economic_record->>'namaKip',
                    ''
                ),

                COALESCE(
                    (economic_record->>'layakPip')::BOOLEAN,
                    false
                ),

                NULLIF(
                    economic_record->>'alasanLayakPip',
                    ''
                ),

                COALESCE(
                    (economic_record->>'hasKks')::BOOLEAN,
                    false
                ),

                NULLIF(
                    economic_record->>'kksNumber',
                    ''
                ),

                COALESCE(
                    (economic_record->>'hasPkh')::BOOLEAN,
                    false
                ),

                COALESCE(
                    (economic_record->>'isDtks')::BOOLEAN,
                    false
                )
            );

        END IF;


        v_success_count := v_success_count + 1;

    END LOOP;


    RETURN jsonb_build_object(
        'success', true,
        'count', v_success_count,
        'message',
        v_success_count || ' siswa berhasil diimport.'
    );


EXCEPTION
    WHEN OTHERS THEN

        RETURN jsonb_build_object(
            'success', false,
            'count', v_success_count,
            'message', SQLERRM
        );

END;
$$;


-- =====================================================================================
-- 38. FUNCTION GRANTS
-- =====================================================================================

REVOKE ALL
ON FUNCTION public.get_user_school_id()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_user_role()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.is_user_active()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.is_super_admin()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.is_school_admin()
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION public.get_user_school_id()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.get_user_role()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.is_user_active()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.is_super_admin()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.is_school_admin()
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.bulk_import_students(JSONB)
TO authenticated;


-- =====================================================================================
-- 39. COMMENTS
-- =====================================================================================

COMMENT ON TABLE "schools"
IS 'Master sekolah / tenant aplikasi ERP.';


COMMENT ON TABLE "users"
IS 'Profile pengguna yang terhubung langsung dengan auth.users. Password dikelola Supabase Auth.';


COMMENT ON TABLE "academic_years"
IS 'Master tahun ajaran per sekolah.';


COMMENT ON TABLE "semesters"
IS 'Semester dalam tahun ajaran.';


COMMENT ON TABLE "teachers"
IS 'Master guru dan tenaga pendidik.';


COMMENT ON TABLE "classes"
IS 'Master kelas berdasarkan tahun ajaran.';


COMMENT ON TABLE "students"
IS 'Master data siswa.';


COMMENT ON TABLE "student_class_history"
IS 'Riwayat kelas siswa berdasarkan tahun ajaran.';


COMMENT ON TABLE "student_parents"
IS 'Data orang tua/wali siswa.';


COMMENT ON TABLE "student_economics"
IS 'Data ekonomi siswa termasuk KIP, KKS, PKH, DTKS dan PIP.';


COMMENT ON TABLE "attendances"
IS 'Data absensi siswa.';


COMMENT ON TABLE "subjects"
IS 'Master mata pelajaran.';


COMMENT ON TABLE "schedule_entries"
IS 'Jadwal pelajaran sekolah.';


COMMENT ON TABLE "inventory_items"
IS 'Master sarana dan prasarana/barang sekolah.';


COMMENT ON TABLE "inventory_transactions"
IS 'Transaksi keluar masuk dan penyesuaian inventaris.';


COMMENT ON TABLE "administration_records"
IS 'Administrasi dan dokumen sekolah.';


COMMENT ON TABLE "scholarship_records"
IS 'Data beasiswa siswa.';


COMMENT ON TABLE "fee_templates"
IS 'Template jenis pembayaran sekolah.';


COMMENT ON TABLE "student_bills"
IS 'Tagihan individual siswa.';


COMMENT ON TABLE "payment_transactions"
IS 'Transaksi pembayaran siswa.';


COMMENT ON TABLE "audit_logs"
IS 'Audit trail aktivitas pengguna.';


-- =====================================================================================
-- 40. SUPER ADMIN PROFILE
--
-- AKUN SUPABASE AUTH:
--   f26eccdf-c806-474e-a8d6-0cf94c4941b0
--
-- schoolId NULL = PLATFORM SUPER ADMIN
--
-- Jika profile sudah ada, gunakan UPDATE.
-- Jika belum ada, INSERT.
-- =====================================================================================

INSERT INTO public.users
(
    "id",
    "schoolId",
    "email",
    "fullName",
    "role",
    "isActive"
)
VALUES
(
    'f26eccdf-c806-474e-a8d6-0cf94c4941b0',
    NULL,
    'hendiprasetyo192@gmail.com',
    'Hendi Prasetyo',
    'SUPER_ADMIN',
    true
)
ON CONFLICT ("id")
DO UPDATE SET
    "schoolId" = NULL,
    "email" = EXCLUDED."email",
    "fullName" = EXCLUDED."fullName",
    "role" = 'SUPER_ADMIN',
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;


-- =====================================================================================
-- 41. FINAL VERIFICATION
-- =====================================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    SELECT COUNT(*)
    INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
          'schools',
          'academic_years',
          'semesters',
          'users',
          'teachers',
          'classes',
          'students',
          'student_class_history',
          'student_parents',
          'student_economics',
          'attendances',
          'subjects',
          'schedule_entries',
          'announcements',
          'inventory_items',
          'inventory_transactions',
          'administration_records',
          'scholarship_records',
          'fee_templates',
          'student_bills',
          'payment_transactions',
          'audit_logs'
      );

    IF v_count <> 22 THEN
        RAISE EXCEPTION
            'VERIFIKASI GAGAL: hanya % dari 22 tabel utama ditemukan.',
            v_count;
    END IF;

END;
$$;


-- =====================================================================================
-- SELESAI
--
-- DATABASE ERP SEKOLAH v3.1 FINAL FOUNDATION
-- =====================================================================================