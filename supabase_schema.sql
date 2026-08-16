Library
/
ERP_SEKOLAH_v4.0_FINAL_PRODUCTION_FOUNDATION.sql


-- =====================================================================================
-- ERP SEKOLAH v4.0
-- FINAL PRODUCTION FOUNDATION
-- Supabase PostgreSQL
--
-- ONE-SHOT SCRIPT
-- Run this entire file in Supabase SQL Editor.
--
-- DESIGN
--   1. Supabase Auth is the authentication/session authority.
--   2. public.users is the application profile/authorization authority.
--   3. SUPER_ADMIN is platform-level and has schoolId = NULL.
--   4. Every school user has schoolId = the tenant school.
--   5. Passwords are NEVER stored in public.users.
--   6. Multi-tenant isolation is enforced by RLS.
--   7. SECURITY DEFINER helper functions avoid recursive RLS checks.
--   8. Financial totals/statuses are maintained by database triggers.
--   9. Student bulk import is transactional.
--  10. Parent/student self-service is supported through user_student_links.
--
-- ROLES
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
-- IMPORTANT
--   This script does NOT create Auth accounts. Auth accounts must be created
--   through Supabase Auth/Admin API. public.users is the application profile.
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- 0. EXTENSIONS
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================================
-- 1. RESET
-- =====================================================================================

DROP FUNCTION IF EXISTS public.payment_change_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_student_bill(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.inventory_transaction_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_inventory_quantity(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.protect_user_security_fields() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_user_active() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_school_admin() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_students() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_academic() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_finance() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_inventory() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_administration() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_users() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_is_parent_or_student() CASCADE;
DROP FUNCTION IF EXISTS public.setup_new_tenant(TEXT,TEXT,TEXT,INTEGER,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_import_students(JSONB) CASCADE;

DROP TABLE IF EXISTS
    public.payment_transactions,
    public.student_bills,
    public.fee_templates,
    public.scholarship_records,
    public.administration_records,
    public.inventory_transactions,
    public.inventory_items,
    public.schedule_entries,
    public.subjects,
    public.announcements,
    public.attendances,
    public.student_economics,
    public.student_parents,
    public.user_student_links,
    public.student_class_history,
    public.students,
    public.classes,
    public.teachers,
    public.audit_logs,
    public.refresh_tokens,
    public.users,
    public.semesters,
    public.academic_years,
    public.schools
CASCADE;

-- =====================================================================================
-- 2. SCHOOLS
-- =====================================================================================

CREATE TABLE public.schools (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schools_pkey PRIMARY KEY ("id"),
    CONSTRAINT schools_npsn_check CHECK (length(trim("npsn")) >= 8)
);

CREATE UNIQUE INDEX schools_npsn_key ON public.schools ("npsn");

-- =====================================================================================
-- 3. ACADEMIC YEARS
-- =====================================================================================

CREATE TABLE public.academic_years (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT academic_years_pkey PRIMARY KEY ("id"),
    CONSTRAINT academic_years_year_check CHECK ("endYear" = "startYear" + 1),
    CONSTRAINT academic_years_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX academic_years_school_year_key
    ON public.academic_years ("schoolId","startYear","endYear");
CREATE UNIQUE INDEX academic_years_school_id_key
    ON public.academic_years ("schoolId","id");
CREATE INDEX academic_years_school_idx ON public.academic_years ("schoolId");

-- =====================================================================================
-- 4. SEMESTERS
-- =====================================================================================

CREATE TABLE public.semesters (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT semesters_pkey PRIMARY KEY ("id"),
    CONSTRAINT semesters_type_check CHECK ("type" IN ('GANJIL','GENAP')),
    CONSTRAINT semesters_date_check CHECK ("endDate" > "startDate"),
    CONSTRAINT semesters_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT semesters_academic_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX semesters_academic_year_type_key
    ON public.semesters ("academicYearId","type");
CREATE UNIQUE INDEX semesters_school_id_key
    ON public.semesters ("schoolId","id");
CREATE INDEX semesters_school_idx ON public.semesters ("schoolId");
CREATE INDEX semesters_academic_year_idx ON public.semesters ("academicYearId");

-- =====================================================================================
-- 5. USERS / PROFILE
-- =====================================================================================

CREATE TABLE public.users (
    "id" UUID NOT NULL,
    "schoolId" UUID,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "lastLogin" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY ("id"),
    CONSTRAINT users_auth_fkey
        FOREIGN KEY ("id") REFERENCES auth.users("id")
        ON DELETE CASCADE,
    CONSTRAINT users_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT users_role_check CHECK (
        "role" IN (
            'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','BENDAHARA',
            'WALI_KELAS','GURU','STAFF_TU','STAFF_SARPRAS','ORANG_TUA','SISWA'
        )
    ),
    CONSTRAINT users_scope_check CHECK (
        ("role" = 'SUPER_ADMIN' AND "schoolId" IS NULL)
        OR
        ("role" <> 'SUPER_ADMIN' AND "schoolId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX users_email_key ON public.users (lower("email"));
CREATE INDEX users_school_idx ON public.users ("schoolId");
CREATE INDEX users_role_idx ON public.users ("role");

-- =====================================================================================
-- 6. LEGACY REFRESH TOKENS
-- =====================================================================================

CREATE TABLE public.refresh_tokens (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY ("id"),
    CONSTRAINT refresh_tokens_user_fkey
        FOREIGN KEY ("userId") REFERENCES public.users("id")
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens ("token");
CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens ("userId");

-- =====================================================================================
-- 7. AUDIT LOGS
-- =====================================================================================

CREATE TABLE public.audit_logs (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY ("id"),
    CONSTRAINT audit_logs_user_fkey
        FOREIGN KEY ("userId") REFERENCES public.users("id")
        ON DELETE SET NULL,
    CONSTRAINT audit_logs_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE SET NULL
);

CREATE INDEX audit_logs_school_idx ON public.audit_logs ("schoolId");
CREATE INDEX audit_logs_user_idx ON public.audit_logs ("userId");
CREATE INDEX audit_logs_created_idx ON public.audit_logs ("createdAt");

-- =====================================================================================
-- 8. TEACHERS
-- =====================================================================================

CREATE TABLE public.teachers (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT teachers_pkey PRIMARY KEY ("id"),
    CONSTRAINT teachers_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT teachers_salary_check CHECK ("baseSalary" IS NULL OR "baseSalary" >= 0),
    CONSTRAINT teachers_hours_check CHECK ("maxHoursPerWeek" > 0)
);

CREATE UNIQUE INDEX teachers_school_id_key ON public.teachers ("schoolId","id");
CREATE UNIQUE INDEX teachers_school_nuptk_key
    ON public.teachers ("schoolId","nuptk") WHERE "nuptk" IS NOT NULL;
CREATE UNIQUE INDEX teachers_school_nip_key
    ON public.teachers ("schoolId","nip") WHERE "nip" IS NOT NULL;
CREATE UNIQUE INDEX teachers_school_nik_key
    ON public.teachers ("schoolId","nik") WHERE "nik" IS NOT NULL;
CREATE INDEX teachers_school_idx ON public.teachers ("schoolId");
CREATE INDEX teachers_name_idx ON public.teachers ("fullName");

-- =====================================================================================
-- 9. CLASSES
-- =====================================================================================

CREATE TABLE public.classes (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "major" TEXT,
    "homeroomTeacherId" UUID,
    "capacity" INTEGER NOT NULL DEFAULT 36,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT classes_pkey PRIMARY KEY ("id"),
    CONSTRAINT classes_capacity_check CHECK ("capacity" > 0),
    CONSTRAINT classes_grade_check CHECK ("gradeLevel" > 0),
    CONSTRAINT classes_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT classes_academic_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT classes_homeroom_teacher_fkey
        FOREIGN KEY ("schoolId","homeroomTeacherId")
        REFERENCES public.teachers("schoolId","id")
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX classes_school_id_key ON public.classes ("schoolId","id");
CREATE UNIQUE INDEX classes_school_year_name_key
    ON public.classes ("schoolId","academicYearId","name");
CREATE INDEX classes_school_idx ON public.classes ("schoolId");
CREATE INDEX classes_year_idx ON public.classes ("academicYearId");
CREATE INDEX classes_homeroom_idx ON public.classes ("homeroomTeacherId");

-- =====================================================================================
-- 10. STUDENTS
-- =====================================================================================

CREATE TABLE public.students (
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
    "beratBadan" NUMERIC(8,2),
    "tinggiBadan" NUMERIC(8,2),
    "lingkarKepala" NUMERIC(8,2),
    "jarakSekolah" NUMERIC(10,2),
    "jenisTinggal" TEXT,
    "alatTransportasi" TEXT,
    "kebutuhanKhusus" TEXT,
    "sekolahAsal" TEXT,
    "bank" TEXT,
    "noRekening" TEXT,
    "namaRekening" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT students_pkey PRIMARY KEY ("id"),
    CONSTRAINT students_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT students_class_fkey
        FOREIGN KEY ("schoolId","classId")
        REFERENCES public.classes("schoolId","id")
        ON DELETE SET NULL,
    CONSTRAINT students_sibling_check
        CHECK ("anakKe" IS NULL OR "anakKe" > 0),
    CONSTRAINT students_siblings_count_check
        CHECK ("jmlSaudara" IS NULL OR "jmlSaudara" >= 0)
);

CREATE UNIQUE INDEX students_school_id_key ON public.students ("schoolId","id");
CREATE UNIQUE INDEX students_school_nisn_key ON public.students ("schoolId","nisn");
CREATE UNIQUE INDEX students_school_nis_key
    ON public.students ("schoolId","nis") WHERE "nis" IS NOT NULL;
CREATE UNIQUE INDEX students_school_nik_key ON public.students ("schoolId","nik");
CREATE INDEX students_school_idx ON public.students ("schoolId");
CREATE INDEX students_class_idx ON public.students ("classId");
CREATE INDEX students_name_idx ON public.students ("fullName");

-- =====================================================================================
-- 11. STUDENT CLASS HISTORY
-- =====================================================================================

CREATE TABLE public.student_class_history (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_class_history_pkey PRIMARY KEY ("id"),
    CONSTRAINT student_history_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT student_history_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE,
    CONSTRAINT student_history_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT student_history_class_fkey
        FOREIGN KEY ("schoolId","classId")
        REFERENCES public.classes("schoolId","id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX student_history_unique
    ON public.student_class_history ("studentId","academicYearId");
CREATE INDEX student_history_school_idx ON public.student_class_history ("schoolId");
CREATE INDEX student_history_student_idx ON public.student_class_history ("studentId");
CREATE INDEX student_history_year_idx ON public.student_class_history ("academicYearId");

-- =====================================================================================
-- 12. USER <-> STUDENT LINKS
-- =====================================================================================

CREATE TABLE public.user_student_links (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_student_links_pkey PRIMARY KEY ("id"),
    CONSTRAINT user_student_links_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT user_student_links_user_fkey
        FOREIGN KEY ("userId") REFERENCES public.users("id")
        ON DELETE CASCADE,
    CONSTRAINT user_student_links_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX user_student_links_unique
    ON public.user_student_links ("userId","studentId");
CREATE INDEX user_student_links_school_idx ON public.user_student_links ("schoolId");
CREATE INDEX user_student_links_student_idx ON public.user_student_links ("studentId");

-- =====================================================================================
-- 13. STUDENT PARENTS
-- =====================================================================================

CREATE TABLE public.student_parents (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_parents_pkey PRIMARY KEY ("id"),
    CONSTRAINT student_parents_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT student_parents_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE,
    CONSTRAINT student_parents_income_check
        CHECK ("monthlyIncome" IS NULL OR "monthlyIncome" >= 0)
);

CREATE INDEX parents_school_idx ON public.student_parents ("schoolId");
CREATE INDEX parents_student_idx ON public.student_parents ("studentId");

-- =====================================================================================
-- 14. STUDENT ECONOMICS
-- =====================================================================================

CREATE TABLE public.student_economics (
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
    "pipScore" NUMERIC(8,2),
    "economicCategory" TEXT,
    "scoringDetails" JSONB,
    "scoredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_economics_pkey PRIMARY KEY ("id"),
    CONSTRAINT student_economics_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT student_economics_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE,
    CONSTRAINT student_economics_dependents_check
        CHECK ("dependentsCount" IS NULL OR "dependentsCount" >= 0)
);

CREATE UNIQUE INDEX student_economics_student_key ON public.student_economics ("studentId");
CREATE INDEX economics_school_idx ON public.student_economics ("schoolId");

-- =====================================================================================
-- 15. ATTENDANCES
-- =====================================================================================

CREATE TABLE public.attendances (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "recordedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendances_pkey PRIMARY KEY ("id"),
    CONSTRAINT attendances_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT attendances_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE,
    CONSTRAINT attendances_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX attendances_student_date_key
    ON public.attendances ("studentId","date");
CREATE INDEX attendances_school_idx ON public.attendances ("schoolId");
CREATE INDEX attendances_date_idx ON public.attendances ("date");

-- =====================================================================================
-- 16. SUBJECTS
-- =====================================================================================

CREATE TABLE public.subjects (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT subjects_pkey PRIMARY KEY ("id"),
    CONSTRAINT subjects_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX subjects_school_id_key ON public.subjects ("schoolId","id");
CREATE UNIQUE INDEX subjects_school_code_key
    ON public.subjects ("schoolId","code") WHERE "code" IS NOT NULL;
CREATE INDEX subjects_school_idx ON public.subjects ("schoolId");

-- =====================================================================================
-- 17. SCHEDULES
-- =====================================================================================

CREATE TABLE public.schedule_entries (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schedule_entries_pkey PRIMARY KEY ("id"),
    CONSTRAINT schedule_day_check CHECK ("dayOfWeek" BETWEEN 1 AND 7),
    CONSTRAINT schedule_time_check CHECK ("endTime" > "startTime"),
    CONSTRAINT schedule_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT schedule_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT schedule_class_fkey
        FOREIGN KEY ("schoolId","classId")
        REFERENCES public.classes("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT schedule_subject_fkey
        FOREIGN KEY ("schoolId","subjectId")
        REFERENCES public.subjects("schoolId","id")
        ON DELETE SET NULL,
    CONSTRAINT schedule_teacher_fkey
        FOREIGN KEY ("schoolId","teacherId")
        REFERENCES public.teachers("schoolId","id")
        ON DELETE SET NULL
);

CREATE INDEX schedule_school_idx ON public.schedule_entries ("schoolId");
CREATE INDEX schedule_class_idx ON public.schedule_entries ("classId");
CREATE INDEX schedule_teacher_idx ON public.schedule_entries ("teacherId");
CREATE INDEX schedule_day_time_idx
    ON public.schedule_entries ("schoolId","dayOfWeek","startTime");

-- =====================================================================================
-- 18. ANNOUNCEMENTS
-- =====================================================================================

CREATE TABLE public.announcements (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'SEMUA',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expireDate" TIMESTAMPTZ,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT announcements_pkey PRIMARY KEY ("id"),
    CONSTRAINT announcements_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT announcements_created_by_fkey
        FOREIGN KEY ("createdBy") REFERENCES public.users("id")
        ON DELETE SET NULL,
    CONSTRAINT announcements_date_check
        CHECK ("expireDate" IS NULL OR "expireDate" > "publishDate")
);

CREATE INDEX announcements_school_idx ON public.announcements ("schoolId");
CREATE INDEX announcements_publish_idx
    ON public.announcements ("schoolId","publishDate");

-- =====================================================================================
-- 19. INVENTORY ITEMS
-- =====================================================================================

CREATE TABLE public.inventory_items (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_items_pkey PRIMARY KEY ("id"),
    CONSTRAINT inventory_quantity_check CHECK ("quantity" >= 0),
    CONSTRAINT inventory_minimum_check CHECK ("minimumStock" >= 0),
    CONSTRAINT inventory_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX inventory_items_school_id_key
    ON public.inventory_items ("schoolId","id");
CREATE UNIQUE INDEX inventory_items_school_code_key
    ON public.inventory_items ("schoolId","code")
    WHERE "code" IS NOT NULL;
CREATE INDEX inventory_items_school_idx ON public.inventory_items ("schoolId");

-- =====================================================================================
-- 20. INVENTORY TRANSACTIONS
-- =====================================================================================

CREATE TABLE public.inventory_transactions (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" NUMERIC(15,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" UUID,
    "transactionDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_transactions_pkey PRIMARY KEY ("id"),
    CONSTRAINT inventory_transaction_type_check
        CHECK ("type" IN ('MASUK','KELUAR','PENYESUAIAN')),
    CONSTRAINT inventory_transaction_quantity_check
        CHECK ("quantity" > 0),
    CONSTRAINT inventory_transaction_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT inventory_transaction_item_fkey
        FOREIGN KEY ("schoolId","itemId")
        REFERENCES public.inventory_items("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT inventory_transaction_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX inventory_transactions_school_idx
    ON public.inventory_transactions ("schoolId");
CREATE INDEX inventory_transactions_item_idx
    ON public.inventory_transactions ("itemId");
CREATE INDEX inventory_transactions_date_idx
    ON public.inventory_transactions ("transactionDate");

-- =====================================================================================
-- 21. ADMINISTRATION
-- =====================================================================================

CREATE TABLE public.administration_records (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT administration_records_pkey PRIMARY KEY ("id"),
    CONSTRAINT administration_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT administration_created_by_fkey
        FOREIGN KEY ("createdBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX administration_school_idx
    ON public.administration_records ("schoolId");

-- =====================================================================================
-- 22. SCHOLARSHIPS
-- =====================================================================================

CREATE TABLE public.scholarship_records (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT scholarship_records_pkey PRIMARY KEY ("id"),
    CONSTRAINT scholarship_amount_check
        CHECK ("amount" IS NULL OR "amount" >= 0),
    CONSTRAINT scholarship_date_check
        CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate"),
    CONSTRAINT scholarship_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT scholarship_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE CASCADE
);

CREATE INDEX scholarships_school_idx ON public.scholarship_records ("schoolId");
CREATE INDEX scholarships_student_idx ON public.scholarship_records ("studentId");

-- =====================================================================================
-- 23. FEE TEMPLATES
-- =====================================================================================

CREATE TABLE public.fee_templates (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fee_templates_pkey PRIMARY KEY ("id"),
    CONSTRAINT fee_amount_check CHECK ("amount" >= 0),
    CONSTRAINT fee_period_check
        CHECK ("periodType" IN ('BULANAN','TAHUNAN','SEKALI_BAYAR')),
    CONSTRAINT fee_grade_check
        CHECK ("gradeLevel" IS NULL OR "gradeLevel" > 0),
    CONSTRAINT fee_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT fee_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX fee_templates_unique
    ON public.fee_templates ("schoolId","academicYearId","name","gradeLevel");
CREATE UNIQUE INDEX fee_templates_school_id_key
    ON public.fee_templates ("schoolId","id");
CREATE INDEX fee_templates_school_idx ON public.fee_templates ("schoolId");

-- =====================================================================================
-- 24. STUDENT BILLS
-- =====================================================================================

CREATE TABLE public.student_bills (
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
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_bills_pkey PRIMARY KEY ("id"),
    CONSTRAINT bills_amount_check
        CHECK (
            "totalAmount" >= 0
            AND "paidAmount" >= 0
            AND "paidAmount" <= "totalAmount"
        ),
    CONSTRAINT bills_month_check
        CHECK ("periodMonth" IS NULL OR "periodMonth" BETWEEN 1 AND 12),
    CONSTRAINT bills_year_check
        CHECK ("periodYear" IS NULL OR "periodYear" BETWEEN 2000 AND 2200),
    CONSTRAINT bills_status_check
        CHECK ("status" IN ('BELUM_BAYAR','CICILAN','LUNAS','DIBATALKAN')),
    CONSTRAINT bills_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_fee_fkey
        FOREIGN KEY ("schoolId","feeTemplateId")
        REFERENCES public.fee_templates("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_year_fkey
        FOREIGN KEY ("schoolId","academicYearId")
        REFERENCES public.academic_years("schoolId","id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX student_bills_unique_period
    ON public.student_bills (
        "studentId","feeTemplateId","academicYearId","periodMonth","periodYear"
    );
CREATE INDEX bills_school_idx ON public.student_bills ("schoolId");
CREATE INDEX bills_student_idx ON public.student_bills ("studentId");
CREATE INDEX bills_year_idx ON public.student_bills ("academicYearId");
CREATE INDEX bills_status_idx ON public.student_bills ("status");

-- =====================================================================================
-- 25. PAYMENT TRANSACTIONS
-- =====================================================================================

CREATE TABLE public.payment_transactions (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "amount" NUMERIC(15,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',
    "paymentDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "reference" TEXT,
    "recordedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'BERHASIL',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_transactions_pkey PRIMARY KEY ("id"),
    CONSTRAINT payment_amount_check CHECK ("amount" > 0),
    CONSTRAINT payment_status_check CHECK ("status" IN ('BERHASIL','DIBATALKAN')),
    CONSTRAINT payment_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT payment_bill_fkey
        FOREIGN KEY ("schoolId","billId")
        REFERENCES public.student_bills("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT payment_student_fkey
        FOREIGN KEY ("schoolId","studentId")
        REFERENCES public.students("schoolId","id")
        ON DELETE RESTRICT,
    CONSTRAINT payment_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX payments_school_idx ON public.payment_transactions ("schoolId");
CREATE INDEX payments_bill_idx ON public.payment_transactions ("billId");
CREATE INDEX payments_student_idx ON public.payment_transactions ("studentId");
CREATE INDEX payments_date_idx ON public.payment_transactions ("paymentDate");

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
    SELECT u."schoolId"
    FROM public.users u
    WHERE u."id" = auth.uid()
      AND u."isActive" = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u."role"
    FROM public.users u
    WHERE u."id" = auth.uid()
      AND u."isActive" = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u."id" = auth.uid()
          AND u."isActive" = true
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
        FROM public.users u
        WHERE u."id" = auth.uid()
          AND u."role" = 'SUPER_ADMIN'
          AND u."isActive" = true
          AND u."schoolId" IS NULL
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
        FROM public.users u
        WHERE u."id" = auth.uid()
          AND u."role" IN ('SUPER_ADMIN','ADMIN')
          AND u."isActive" = true
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_users()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_super_admin()
        OR public.get_user_role() = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_academic()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','WALI_KELAS','GURU'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_students()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR',
        'WALI_KELAS','GURU','STAFF_TU'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_finance()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','BENDAHARA'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_inventory()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','STAFF_SARPRAS'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_administration()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_parent_or_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.get_user_role() IN ('ORANG_TUA','SISWA');
$$;

REVOKE ALL ON FUNCTION public.get_user_school_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_school_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_academic() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_finance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_administration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_parent_or_student() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_academic() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_finance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_administration() TO authenticated;

-- =====================================================================================
-- 27. UPDATED-AT + USER SECURITY TRIGGERS
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER schools_updated_at BEFORE UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER academic_years_updated_at BEFORE UPDATE ON public.academic_years
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER semesters_updated_at BEFORE UPDATE ON public.semesters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER teachers_updated_at BEFORE UPDATE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER classes_updated_at BEFORE UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER students_updated_at BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER student_parents_updated_at BEFORE UPDATE ON public.student_parents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER student_economics_updated_at BEFORE UPDATE ON public.student_economics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON public.schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER administration_updated_at BEFORE UPDATE ON public.administration_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER scholarships_updated_at BEFORE UPDATE ON public.scholarship_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER fee_templates_updated_at BEFORE UPDATE ON public.fee_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER student_bills_updated_at BEFORE UPDATE ON public.student_bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.protect_user_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF public.is_super_admin() OR public.get_user_role() = 'ADMIN' THEN
        RETURN NEW;
    END IF;

    IF NEW."role" IS DISTINCT FROM OLD."role"
       OR NEW."schoolId" IS DISTINCT FROM OLD."schoolId"
       OR NEW."isActive" IS DISTINCT FROM OLD."isActive"
    THEN
        RAISE EXCEPTION
            'Anda tidak memiliki hak untuk mengubah role, sekolah, atau status akun.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER users_security_fields
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_security_fields();

-- =====================================================================================
-- 28. INVENTORY BALANCE
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.sync_inventory_quantity(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_balance NUMERIC(15,2);
BEGIN
    SELECT i."schoolId"
      INTO v_school_id
    FROM public.inventory_items i
    WHERE i."id" = p_item_id
    FOR UPDATE;

    IF v_school_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN t."type" = 'MASUK' THEN t."quantity"
                WHEN t."type" = 'KELUAR' THEN -t."quantity"
                WHEN t."type" = 'PENYESUAIAN' THEN t."quantity"
                ELSE 0
            END
        ), 0
    )
    INTO v_balance
    FROM public.inventory_transactions t
    WHERE t."itemId" = p_item_id;

    IF v_balance < 0 THEN
        RAISE EXCEPTION 'Stok tidak boleh menjadi negatif.';
    END IF;

    UPDATE public.inventory_items
    SET "quantity" = v_balance,
        "updatedAt" = now()
    WHERE "id" = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_transaction_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.sync_inventory_quantity(OLD."itemId");
        RETURN OLD;
    END IF;

    PERFORM public.sync_inventory_quantity(NEW."itemId");

    IF TG_OP = 'UPDATE'
       AND OLD."itemId" IS DISTINCT FROM NEW."itemId"
    THEN
        PERFORM public.sync_inventory_quantity(OLD."itemId");
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_quantity_trigger
AFTER INSERT OR UPDATE OR DELETE
ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.inventory_transaction_trigger();

-- =====================================================================================
-- 29. PAYMENT BALANCE
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.recalculate_student_bill(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total NUMERIC(15,2);
    v_paid NUMERIC(15,2);
    v_status TEXT;
BEGIN
    SELECT "totalAmount"
      INTO v_total
    FROM public.student_bills
    WHERE "id" = p_bill_id
    FOR UPDATE;

    IF v_total IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN "status" = 'BERHASIL' THEN "amount"
                ELSE 0
            END
        ), 0
    )
    INTO v_paid
    FROM public.payment_transactions
    WHERE "billId" = p_bill_id;

    IF v_paid <= 0 THEN
        v_status := 'BELUM_BAYAR';
    ELSIF v_paid >= v_total THEN
        v_status := 'LUNAS';
    ELSE
        v_status := 'CICILAN';
    END IF;

    UPDATE public.student_bills
    SET "paidAmount" = LEAST(v_paid, v_total),
        "status" =
            CASE
                WHEN "status" = 'DIBATALKAN' THEN 'DIBATALKAN'
                ELSE v_status
            END,
        "updatedAt" = now()
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
        PERFORM public.recalculate_student_bill(OLD."billId");
        RETURN OLD;
    END IF;

    PERFORM public.recalculate_student_bill(NEW."billId");

    IF TG_OP = 'UPDATE'
       AND OLD."billId" IS DISTINCT FROM NEW."billId"
    THEN
        PERFORM public.recalculate_student_bill(OLD."billId");
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER payment_status_trigger
AFTER INSERT OR UPDATE OR DELETE
ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.payment_change_trigger();

-- =====================================================================================
-- 30. RLS ENABLE
-- =====================================================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_class_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_economics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarship_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================================================
-- 31. REFRESH TOKENS RLS
-- =====================================================================================

CREATE POLICY refresh_tokens_deny_client
ON public.refresh_tokens
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- =====================================================================================
-- 32. SCHOOLS RLS
-- =====================================================================================

CREATE POLICY schools_select ON public.schools
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "id" = public.get_user_school_id())
);

CREATE POLICY schools_insert ON public.schools
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY schools_update ON public.schools
FOR UPDATE TO authenticated
USING (public.is_super_admin() OR "id" = public.get_user_school_id())
WITH CHECK (public.is_super_admin() OR "id" = public.get_user_school_id());

CREATE POLICY schools_delete ON public.schools
FOR DELETE TO authenticated
USING (public.is_super_admin());

-- =====================================================================================
-- 33. ACADEMIC YEARS / SEMESTERS
-- =====================================================================================

CREATE POLICY academic_years_select ON public.academic_years
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY academic_years_manage ON public.academic_years
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY semesters_select ON public.semesters
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY semesters_manage ON public.semesters
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 34. USERS RLS
-- =====================================================================================

CREATE POLICY users_select ON public.users
FOR SELECT TO authenticated
USING (
    public.is_super_admin()
    OR "id" = auth.uid()
    OR (
        public.get_user_role() IN ('ADMIN','KEPALA_SEKOLAH')
        AND "schoolId" = public.get_user_school_id()
    )
);

CREATE POLICY users_insert ON public.users
FOR INSERT TO authenticated
WITH CHECK (
    (
        public.is_super_admin()
        AND (
            ("role" = 'SUPER_ADMIN' AND "schoolId" IS NULL)
            OR
            ("role" <> 'SUPER_ADMIN' AND "schoolId" IS NOT NULL)
        )
    )
    OR
    (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);

CREATE POLICY users_update ON public.users
FOR UPDATE TO authenticated
USING (
    public.is_super_admin()
    OR "id" = auth.uid()
    OR (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        "id" = auth.uid()
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
    OR (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);

CREATE POLICY users_delete ON public.users
FOR DELETE TO authenticated
USING (
    public.is_super_admin()
    OR (
        public.get_user_role() = 'ADMIN'
        AND "schoolId" = public.get_user_school_id()
        AND "role" <> 'SUPER_ADMIN'
    )
);

-- =====================================================================================
-- 35. TEACHERS
-- =====================================================================================

CREATE POLICY teachers_select ON public.teachers
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY teachers_manage ON public.teachers
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 36. CLASSES
-- =====================================================================================

CREATE POLICY classes_select ON public.classes
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY classes_manage ON public.classes
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 37. STUDENTS
-- =====================================================================================

CREATE POLICY students_select ON public.students
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
        OR "id" IN (
            SELECT l."studentId"
            FROM public.user_student_links l
            WHERE l."userId" = auth.uid()
              AND l."schoolId" = public.get_user_school_id()
        )
    )
);

CREATE POLICY students_manage ON public.students
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 38. STUDENT HISTORY
-- =====================================================================================

CREATE POLICY student_history_select ON public.student_class_history
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY student_history_manage ON public.student_class_history
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 39. USER-STUDENT LINKS
-- =====================================================================================

CREATE POLICY user_student_links_select ON public.user_student_links
FOR SELECT TO authenticated
USING (
    public.is_super_admin()
    OR "userId" = auth.uid()
    OR (
        public.get_user_role() IN ('ADMIN','KEPALA_SEKOLAH')
        AND "schoolId" = public.get_user_school_id()
    )
);

CREATE POLICY user_student_links_manage ON public.user_student_links
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 40. PARENTS
-- =====================================================================================

CREATE POLICY parents_select ON public.student_parents
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
        OR "studentId" IN (
            SELECT l."studentId"
            FROM public.user_student_links l
            WHERE l."userId" = auth.uid()
              AND l."schoolId" = public.get_user_school_id()
        )
    )
);

CREATE POLICY parents_manage ON public.student_parents
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 41. ECONOMICS
-- =====================================================================================

CREATE POLICY economics_select ON public.student_economics
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
    )
);

CREATE POLICY economics_manage ON public.student_economics
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 42. ATTENDANCES
-- =====================================================================================

CREATE POLICY attendances_select ON public.attendances
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
        OR "studentId" IN (
            SELECT l."studentId"
            FROM public.user_student_links l
            WHERE l."userId" = auth.uid()
              AND l."schoolId" = public.get_user_school_id()
        )
    )
);

CREATE POLICY attendances_manage ON public.attendances
FOR ALL TO authenticated
USING (
    public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','WALI_KELAS','GURU'
    )
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','WALI_KELAS','GURU'
    )
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 43. SUBJECTS / SCHEDULES
-- =====================================================================================

CREATE POLICY subjects_select ON public.subjects
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY subjects_manage ON public.subjects
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY schedules_select ON public.schedule_entries
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY schedules_manage ON public.schedule_entries
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_academic()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 44. ANNOUNCEMENTS
-- =====================================================================================

CREATE POLICY announcements_select ON public.announcements
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY announcements_manage ON public.announcements
FOR ALL TO authenticated
USING (
    public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU'
    )
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.get_user_role() IN (
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU'
    )
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 45. INVENTORY
-- =====================================================================================

CREATE POLICY inventory_items_select ON public.inventory_items
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY inventory_items_manage ON public.inventory_items
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_inventory()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_inventory()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY inventory_transactions_select ON public.inventory_transactions
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY inventory_transactions_manage ON public.inventory_transactions
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_inventory()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_inventory()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 46. ADMINISTRATION
-- =====================================================================================

CREATE POLICY administration_select ON public.administration_records
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY administration_manage ON public.administration_records
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_administration()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_administration()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 47. SCHOLARSHIPS
-- =====================================================================================

CREATE POLICY scholarships_select ON public.scholarship_records
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
    )
);

CREATE POLICY scholarships_manage ON public.scholarship_records
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_students()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 48. FINANCE
-- =====================================================================================

CREATE POLICY fee_templates_select ON public.fee_templates
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY fee_templates_manage ON public.fee_templates
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY student_bills_select ON public.student_bills
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
        OR "studentId" IN (
            SELECT l."studentId"
            FROM public.user_student_links l
            WHERE l."userId" = auth.uid()
              AND l."schoolId" = public.get_user_school_id()
        )
    )
);

CREATE POLICY student_bills_manage ON public.student_bills
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

CREATE POLICY payments_select ON public.payment_transactions
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() NOT IN ('ORANG_TUA','SISWA')
        )
        OR "studentId" IN (
            SELECT l."studentId"
            FROM public.user_student_links l
            WHERE l."userId" = auth.uid()
              AND l."schoolId" = public.get_user_school_id()
        )
    )
);

CREATE POLICY payments_manage ON public.payment_transactions
FOR ALL TO authenticated
USING (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
)
WITH CHECK (
    public.current_user_can_manage_finance()
    AND (public.is_super_admin() OR "schoolId" = public.get_user_school_id())
);

-- =====================================================================================
-- 49. AUDIT LOGS
-- =====================================================================================

CREATE POLICY audit_logs_select ON public.audit_logs
FOR SELECT TO authenticated
USING (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR (
            "schoolId" = public.get_user_school_id()
            AND public.get_user_role() IN ('ADMIN','KEPALA_SEKOLAH')
        )
    )
);

CREATE POLICY audit_logs_insert ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
    public.is_user_active()
    AND (
        public.is_super_admin()
        OR "schoolId" = public.get_user_school_id()
    )
);

-- No UPDATE/DELETE policy: audit records are immutable to authenticated users.

-- =====================================================================================
-- 50. TENANT SETUP
-- =====================================================================================

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
        RAISE EXCEPTION 'Akses ditolak. Hanya SUPER_ADMIN yang dapat membuat sekolah.';
    END IF;

    IF p_school_name IS NULL OR trim(p_school_name) = '' THEN
        RAISE EXCEPTION 'Nama sekolah wajib diisi.';
    END IF;

    IF p_npsn IS NULL OR trim(p_npsn) = '' THEN
        RAISE EXCEPTION 'NPSN wajib diisi.';
    END IF;

    IF length(trim(p_npsn)) < 8 THEN
        RAISE EXCEPTION 'NPSN minimal 8 karakter.';
    END IF;

    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Nama administrator wajib diisi.';
    END IF;

    IF p_start_year IS NULL OR p_end_year IS NULL
       OR p_end_year <> p_start_year + 1
    THEN
        RAISE EXCEPTION 'Tahun ajaran tidak valid.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.schools
        WHERE "npsn" = trim(p_npsn)
    ) THEN
        RAISE EXCEPTION 'NPSN tersebut sudah terdaftar.';
    END IF;

    INSERT INTO public.schools
    ("name","npsn","level","type","address","city","province")
    VALUES
    (trim(p_school_name),trim(p_npsn),'BELUM_DIATUR','BELUM_DIATUR','-','-','-')
    RETURNING "id" INTO v_school_id;

    INSERT INTO public.academic_years
    ("schoolId","name","startYear","endYear","isActive")
    VALUES
    (v_school_id,p_start_year || '/' || p_end_year,
     p_start_year,p_end_year,true)
    RETURNING "id" INTO v_academic_year_id;

    RETURN jsonb_build_object(
        'success',true,
        'schoolId',v_school_id,
        'academicYearId',v_academic_year_id,
        'adminFullName',trim(p_full_name),
        'message','Sekolah dan tahun ajaran awal berhasil dibuat. Akun administrator dibuat melalui Supabase Auth.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.setup_new_tenant(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setup_new_tenant(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.setup_new_tenant(TEXT,TEXT,TEXT,INTEGER,INTEGER)
TO authenticated;

-- =====================================================================================
-- 51. BULK IMPORT STUDENTS
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_students(batch_data JSONB)
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
    v_index INTEGER := 0;
BEGIN
    v_school_id := public.get_user_school_id();

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User tidak terafiliasi dengan sekolah.';
    END IF;

    IF public.get_user_role() NOT IN (
        'SUPER_ADMIN','ADMIN','OPERATOR','STAFF_TU'
    ) THEN
        RAISE EXCEPTION 'Role Anda tidak memiliki hak import siswa.';
    END IF;

    IF batch_data IS NULL OR jsonb_typeof(batch_data) <> 'array' THEN
        RAISE EXCEPTION 'batch_data harus berupa JSON array.';
    END IF;

    IF jsonb_array_length(batch_data) = 0 THEN
        RETURN jsonb_build_object(
            'success',true,
            'count',0,
            'message','Tidak ada data siswa untuk diimport.'
        );
    END IF;

    FOR student_record IN
        SELECT value
        FROM jsonb_array_elements(batch_data)
    LOOP
        v_index := v_index + 1;

        IF jsonb_typeof(student_record) <> 'object' THEN
            RAISE EXCEPTION 'Data siswa pada index % bukan object JSON.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'nisn'),'') IS NULL THEN
            RAISE EXCEPTION 'NISN wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'nik'),'') IS NULL THEN
            RAISE EXCEPTION 'NIK wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'fullName'),'') IS NULL THEN
            RAISE EXCEPTION 'Nama siswa wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'birthDate'),'') IS NULL THEN
            RAISE EXCEPTION 'Tanggal lahir wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'birthPlace'),'') IS NULL THEN
            RAISE EXCEPTION 'Tempat lahir wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'gender'),'') IS NULL THEN
            RAISE EXCEPTION 'Jenis kelamin wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'address'),'') IS NULL THEN
            RAISE EXCEPTION 'Alamat wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'city'),'') IS NULL THEN
            RAISE EXCEPTION 'Kota wajib diisi pada data index %.', v_index;
        END IF;

        IF NULLIF(trim(student_record->>'province'),'') IS NULL THEN
            RAISE EXCEPTION 'Provinsi wajib diisi pada data index %.', v_index;
        END IF;

        INSERT INTO public.students (
            "schoolId","nis","nisn","nik","noKk",
            "fullName","nickname","gender","birthDate","birthPlace",
            "religion","address","rt","rw","kelurahan","kecamatan",
            "city","province","postalCode","phone","email",
            "status","entryDate","classId",
            "anakKe","jmlSaudara","lintang","bujur",
            "beratBadan","tinggiBadan","lingkarKepala","jarakSekolah",
            "jenisTinggal","alatTransportasi","sekolahAsal","kebutuhanKhusus"
        )
        VALUES (
            v_school_id,
            NULLIF(trim(student_record->>'nis'),''),
            trim(student_record->>'nisn'),
            trim(student_record->>'nik'),
            NULLIF(trim(student_record->>'noKk'),''),
            trim(student_record->>'fullName'),
            NULLIF(trim(student_record->>'nickname'),''),
            trim(student_record->>'gender'),
            (student_record->>'birthDate')::DATE,
            trim(student_record->>'birthPlace'),
            NULLIF(trim(student_record->>'religion'),''),
            trim(student_record->>'address'),
            NULLIF(trim(student_record->>'rt'),''),
            NULLIF(trim(student_record->>'rw'),''),
            COALESCE(
                NULLIF(trim(student_record->>'village'),''),
                NULLIF(trim(student_record->>'kelurahan'),'')
            ),
            COALESCE(
                NULLIF(trim(student_record->>'district'),''),
                NULLIF(trim(student_record->>'kecamatan'),'')
            ),
            trim(student_record->>'city'),
            trim(student_record->>'province'),
            NULLIF(trim(student_record->>'postalCode'),''),
            NULLIF(trim(student_record->>'phone'),''),
            NULLIF(trim(student_record->>'email'),''),
            COALESCE(NULLIF(trim(student_record->>'status'),''),'AKTIF'),
            COALESCE(
                NULLIF(trim(student_record->>'entryDate'),'')::DATE,
                CURRENT_DATE
            ),
            CASE
                WHEN NULLIF(trim(student_record->>'classId'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'classId'))::UUID
            END,
            CASE
                WHEN NULLIF(trim(student_record->>'anakKe'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'anakKe'))::INTEGER
            END,
            CASE
                WHEN NULLIF(trim(student_record->>'jmlSaudara'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'jmlSaudara'))::INTEGER
            END,
            NULLIF(trim(student_record->>'lintang'),''),
            NULLIF(trim(student_record->>'bujur'),''),
            CASE
                WHEN NULLIF(trim(student_record->>'beratBadan'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'beratBadan'))::NUMERIC(8,2)
            END,
            CASE
                WHEN NULLIF(trim(student_record->>'tinggiBadan'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'tinggiBadan'))::NUMERIC(8,2)
            END,
            CASE
                WHEN NULLIF(trim(student_record->>'lingkarKepala'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'lingkarKepala'))::NUMERIC(8,2)
            END,
            CASE
                WHEN NULLIF(trim(student_record->>'jarakSekolah'),'') IS NULL
                THEN NULL
                ELSE (trim(student_record->>'jarakSekolah'))::NUMERIC(10,2)
            END,
            NULLIF(trim(student_record->>'jenisTinggal'),''),
            NULLIF(trim(student_record->>'alatTransportasi'),''),
            NULLIF(trim(student_record->>'sekolahAsal'),''),
            NULLIF(trim(student_record->>'kebutuhanKhusus'),'')
        )
        RETURNING "id" INTO v_student_id;

        IF student_record ? 'parents'
           AND jsonb_typeof(student_record->'parents') = 'array'
        THEN
            FOR parent_record IN
                SELECT value
                FROM jsonb_array_elements(student_record->'parents')
            LOOP
                INSERT INTO public.student_parents (
                    "schoolId","studentId","relation","fullName","nik",
                    "phone","email","education","occupation",
                    "monthlyIncome","isAlive","address"
                )
                VALUES (
                    v_school_id,
                    v_student_id,
                    COALESCE(NULLIF(trim(parent_record->>'relation'),''),'WALI'),
                    NULLIF(trim(parent_record->>'fullName'),''),
                    NULLIF(trim(parent_record->>'nik'),''),
                    NULLIF(trim(parent_record->>'phone'),''),
                    NULLIF(trim(parent_record->>'email'),''),
                    NULLIF(trim(parent_record->>'education'),''),
                    COALESCE(
                        NULLIF(trim(parent_record->>'job'),''),
                        NULLIF(trim(parent_record->>'occupation'),'')
                    ),
                    CASE
                        WHEN NULLIF(
                            regexp_replace(
                                COALESCE(parent_record->>'income',''),
                                '\D','','g'
                            ),''
                        ) IS NULL
                        THEN NULL
                        ELSE regexp_replace(
                            parent_record->>'income','\D','','g'
                        )::NUMERIC(15,2)
                    END,
                    COALESCE(
                        NULLIF(trim(parent_record->>'isAlive'),'')::BOOLEAN,
                        true
                    ),
                    NULLIF(trim(parent_record->>'address'),'')
                );
            END LOOP;
        END IF;

        IF student_record ? 'economic'
           AND jsonb_typeof(student_record->'economic') = 'object'
        THEN
            economic_record := student_record->'economic';

            INSERT INTO public.student_economics (
                "schoolId","studentId","hasKip","kipNumber","namaKip",
                "layakPip","alasanLayakPip","hasKks","kksNumber",
                "hasPkh","isDtks"
            )
            VALUES (
                v_school_id,
                v_student_id,
                COALESCE(NULLIF(trim(economic_record->>'hasKip'),'')::BOOLEAN,false),
                NULLIF(trim(economic_record->>'kipNumber'),''),
                NULLIF(trim(economic_record->>'namaKip'),''),
                COALESCE(NULLIF(trim(economic_record->>'layakPip'),'')::BOOLEAN,false),
                NULLIF(trim(economic_record->>'alasanLayakPip'),''),
                COALESCE(NULLIF(trim(economic_record->>'hasKks'),'')::BOOLEAN,false),
                NULLIF(trim(economic_record->>'kksNumber'),''),
                COALESCE(NULLIF(trim(economic_record->>'hasPkh'),'')::BOOLEAN,false),
                COALESCE(NULLIF(trim(economic_record->>'isDtks'),'')::BOOLEAN,false)
            );
        END IF;

        v_success_count := v_success_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success',true,
        'count',v_success_count,
        'message',v_success_count || ' siswa berhasil diimport.'
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION
            'Import siswa gagal pada data index %: %',
            v_index, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_students(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_import_students(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_students(JSONB) TO authenticated;

-- =====================================================================================
-- 52. COMMENTS
-- =====================================================================================

COMMENT ON TABLE public.schools IS 'Master sekolah / tenant aplikasi ERP.';
COMMENT ON TABLE public.users IS 'Profile pengguna terhubung ke auth.users. Password dikelola Supabase Auth.';
COMMENT ON TABLE public.academic_years IS 'Master tahun ajaran per sekolah.';
COMMENT ON TABLE public.semesters IS 'Semester dalam tahun ajaran.';
COMMENT ON TABLE public.teachers IS 'Master guru dan tenaga pendidik.';
COMMENT ON TABLE public.classes IS 'Master kelas berdasarkan tahun ajaran.';
COMMENT ON TABLE public.students IS 'Master data siswa.';
COMMENT ON TABLE public.student_class_history IS 'Riwayat kelas siswa berdasarkan tahun ajaran.';
COMMENT ON TABLE public.user_student_links IS 'Relasi akun ORANG_TUA/SISWA dengan siswa.';
COMMENT ON TABLE public.student_parents IS 'Data orang tua/wali siswa.';
COMMENT ON TABLE public.student_economics IS 'Data ekonomi siswa termasuk KIP, KKS, PKH, DTKS dan PIP.';
COMMENT ON TABLE public.attendances IS 'Data absensi siswa.';
COMMENT ON TABLE public.subjects IS 'Master mata pelajaran.';
COMMENT ON TABLE public.schedule_entries IS 'Jadwal pelajaran sekolah.';
COMMENT ON TABLE public.announcements IS 'Pengumuman sekolah.';
COMMENT ON TABLE public.inventory_items IS 'Master sarana dan prasarana/barang sekolah.';
COMMENT ON TABLE public.inventory_transactions IS 'Transaksi stok inventaris.';
COMMENT ON TABLE public.administration_records IS 'Administrasi dan dokumen sekolah.';
COMMENT ON TABLE public.scholarship_records IS 'Data beasiswa siswa.';
COMMENT ON TABLE public.fee_templates IS 'Template jenis pembayaran sekolah.';
COMMENT ON TABLE public.student_bills IS 'Tagihan individual siswa.';
COMMENT ON TABLE public.payment_transactions IS 'Transaksi pembayaran siswa.';
COMMENT ON TABLE public.audit_logs IS 'Audit trail aktivitas pengguna.';

-- =====================================================================================
-- 53. SUPER ADMIN PROFILE
-- =====================================================================================

INSERT INTO public.users
(
    "id","schoolId","email","fullName","role","isActive"
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
    "updatedAt" = now();

-- =====================================================================================
-- 54. GRANTS
-- =====================================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO authenticated;

-- RLS is the authorization boundary.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- =====================================================================================
-- 55. FINAL VERIFICATION
-- =====================================================================================

DO $$
DECLARE
    v_count INTEGER;
    v_expected INTEGER := 24;
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
          'refresh_tokens',
          'teachers',
          'classes',
          'students',
          'student_class_history',
          'user_student_links',
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

    IF v_count <> v_expected THEN
        RAISE EXCEPTION
            'VERIFIKASI GAGAL: % dari % tabel foundation ditemukan.',
            v_count, v_expected;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE "id" = 'f26eccdf-c806-474e-a8d6-0cf94c4941b0'
          AND "role" = 'SUPER_ADMIN'
          AND "schoolId" IS NULL
          AND "isActive" = true
    ) THEN
        RAISE EXCEPTION
            'VERIFIKASI GAGAL: profile SUPER_ADMIN tidak ditemukan.';
    END IF;

    RAISE NOTICE 'ERP SEKOLAH v4.0 FINAL PRODUCTION FOUNDATION berhasil dibuat.';
END;
$$;

COMMIT;

-- =====================================================================================
-- SELESAI
-- ERP SEKOLAH v4.0 FINAL PRODUCTION FOUNDATION
-- =====================================================================================