-- ============================================================================
-- ERP SEKOLAH v20 — HARDENED PRODUCTION FOUNDATION (CLEAN CONSOLIDATED)
-- Versi: BERSIH / SCHEMA-ONLY (Tanpa Seed Data Sekolah, Super Admin & Admin)
-- Penyempurnaan & Perapian v20:
--   1. Konsolidasi penuh skema v19 + seluruh patch absensi GPS, selfie & mode desktop
--   2. Penyatuan kolom tambahan langsung ke definisi tabel (schools, teachers, attendances)
--   3. Penghapusan duplikasi fungsi & policy (attendances_manage & submit_teacher_gps_attendance)
--   4. Penambahan DROP FUNCTION idempoten untuk seluruh fungsi baru di Bagian 01
--   5. Penyeragaman SECURITY DEFINER, search_path (public, pg_temp), REVOKE/GRANT,
--      serta dukungan multi-role pada set_school_desktop_attendance_global
--   6. Siap untuk instalasi multi-tenant bersih (tanpa data sekolah/akun bawaan)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 01. EXTENSIONS & RESET OBJEK LAMA (100% IDEMPOTENT)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger & Ledger Functions
DROP FUNCTION IF EXISTS public.library_loan_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_library_book_copies(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.library_book_total_copies_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.payment_change_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_student_bill(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.student_bill_amount_change_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.inventory_transaction_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_inventory_quantity(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.protect_user_security_fields() CASCADE;
DROP FUNCTION IF EXISTS public.protect_attendance_approval() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.erp_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.auto_delete_auth_on_student_delete() CASCADE;
DROP FUNCTION IF EXISTS public.auto_delete_auth_on_teacher_delete() CASCADE;
DROP FUNCTION IF EXISTS public.sync_new_teacher_desktop_attendance() CASCADE;

-- RPC & Business Logic Functions
DROP FUNCTION IF EXISTS public.resolve_user_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.set_active_academic_year(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.set_active_semester(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.erp_set_active_academic_year(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_school_for_current_user(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.setup_new_tenant(TEXT, TEXT, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.set_teacher_desktop_attendance(UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.set_school_desktop_attendance_global(UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.submit_teacher_gps_attendance(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, BOOLEAN, TEXT[], JSONB, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_import_students(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_import_teachers(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.clean_dapodik_str(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.parse_dapodik_bool(TEXT, BOOLEAN) CASCADE;

-- Security, Geodesic & Multi-Role Helper Functions
DROP FUNCTION IF EXISTS public.calculate_haversine_meters(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) CASCADE;
DROP FUNCTION IF EXISTS public.is_own_school_storage_folder(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.map_tugas_tambahan_to_roles(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_all_roles() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_user_active() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_school_admin() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_users() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_academic() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_students() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_finance() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_inventory() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_library() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_can_manage_administration() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_is_parent_or_student() CASCADE;
DROP FUNCTION IF EXISTS public.erp_current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.erp_current_user_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.erp_has_school_access(UUID, BOOLEAN) CASCADE;

-- Drop Tables (Urutan Dependensi Aman)
DROP TABLE IF EXISTS
    public.library_loans,
    public.library_books,
    public.payment_transactions,
    public.student_bills,
    public.fee_templates,
    public.scholarship_records,
    public.administration_records,
    public.inventory_transactions,
    public.inventory_items,
    public.daily_quotes,
    public.national_holidays,
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

-- ============================================================================
-- 02. CORE TENANT & AKADEMIK DASAR (SCHOOLS, ACADEMIC YEARS, SEMESTERS)
-- ============================================================================
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
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "attendanceRadiusMeters" INTEGER NOT NULL DEFAULT 200,
    "workStartTime" TEXT NOT NULL DEFAULT '07:30',
    "workEndTime" TEXT NOT NULL DEFAULT '14:30',
    "workDaysMode" TEXT NOT NULL DEFAULT 'SIX_DAYS',
    "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 0,
    "requireSelfieCheckIn" BOOLEAN NOT NULL DEFAULT true,
    "requireSelfieCheckOut" BOOLEAN NOT NULL DEFAULT true,
    "allowDesktopAttendanceGlobal" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schools_pkey PRIMARY KEY ("id"),
    CONSTRAINT schools_npsn_check CHECK (length(trim("npsn")) >= 8),
    CONSTRAINT schools_radius_check CHECK ("attendanceRadiusMeters" > 0),
    CONSTRAINT schools_work_start_check CHECK ("workStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'),
    CONSTRAINT schools_work_end_check CHECK ("workEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'),
    CONSTRAINT schools_work_days_mode_check CHECK ("workDaysMode" IN ('FIVE_DAYS', 'SIX_DAYS')),
    CONSTRAINT schools_late_tolerance_check CHECK ("lateToleranceMinutes" >= 0 AND "lateToleranceMinutes" <= 240)
);

CREATE UNIQUE INDEX schools_npsn_key ON public.schools ("npsn");

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
    ON public.academic_years ("schoolId", "startYear", "endYear");
CREATE UNIQUE INDEX academic_years_one_active_per_school
    ON public.academic_years ("schoolId") WHERE ("isActive" = true);
CREATE UNIQUE INDEX academic_years_school_id_key
    ON public.academic_years ("schoolId", "id");
CREATE INDEX academic_years_school_idx ON public.academic_years ("schoolId");

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
    CONSTRAINT semesters_type_check CHECK ("type" IN ('GANJIL', 'GENAP')),
    CONSTRAINT semesters_date_check CHECK ("endDate" > "startDate"),
    CONSTRAINT semesters_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT semesters_academic_year_fkey
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX semesters_academic_year_type_key
    ON public.semesters ("academicYearId", "type");
CREATE UNIQUE INDEX semesters_one_active_per_year
    ON public.semesters ("academicYearId") WHERE ("isActive" = true);
CREATE UNIQUE INDEX semesters_one_active_per_school
    ON public.semesters ("schoolId") WHERE ("isActive" = true);
CREATE UNIQUE INDEX semesters_school_id_key
    ON public.semesters ("schoolId", "id");
CREATE INDEX semesters_school_idx ON public.semesters ("schoolId");
CREATE INDEX semesters_academic_year_idx ON public.semesters ("academicYearId");

-- ============================================================================
-- 03. AUTENTIKASI, OTORISASI & AUDIT (USERS, REFRESH TOKENS, AUDIT LOGS)
-- ============================================================================
CREATE TABLE public.users (
    "id" UUID NOT NULL,
    "schoolId" UUID,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "additionalRoles" TEXT[] NOT NULL DEFAULT '{}'::text[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "lastLogin" TIMESTAMPTZ,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY ("id"),
    CONSTRAINT users_school_id_key UNIQUE ("schoolId", "id"),
    CONSTRAINT users_auth_fkey
        FOREIGN KEY ("id") REFERENCES auth.users("id")
        ON DELETE CASCADE,
    CONSTRAINT users_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT users_role_check CHECK (
        "role" IN (
            'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','BENDAHARA',
            'WALI_KELAS','GURU','STAFF_TU','STAFF_SARPRAS','STAFF_PERPUS',
            'ORANG_TUA','SISWA'
        )
    ),
    CONSTRAINT users_additional_roles_check CHECK (
        "additionalRoles" <@ ARRAY[
            'ADMIN','KEPALA_SEKOLAH','OPERATOR','BENDAHARA',
            'WALI_KELAS','GURU','STAFF_TU','STAFF_SARPRAS','STAFF_PERPUS'
        ]::text[]
    ),
    CONSTRAINT users_scope_check CHECK (
        ("role" = 'SUPER_ADMIN' AND "schoolId" IS NULL)
        OR
        ("role" = 'ADMIN')
        OR
        ("role" NOT IN ('SUPER_ADMIN', 'ADMIN') AND "schoolId" IS NOT NULL)
    )
);

COMMENT ON COLUMN public.users."additionalRoles" IS 'Daftar peran/tugas tambahan pengguna selain peran utama (misal: BENDAHARA, STAFF_TU, STAFF_PERPUS, STAFF_SARPRAS)';

CREATE UNIQUE INDEX users_email_key ON public.users (lower("email"));
CREATE INDEX users_school_idx ON public.users ("schoolId");
CREATE INDEX users_school_active_idx ON public.users ("schoolId", "isActive");
CREATE INDEX users_role_idx ON public.users ("role");
CREATE INDEX users_additional_roles_gin_idx ON public.users USING GIN ("additionalRoles");

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
CREATE INDEX audit_logs_created_idx ON public.audit_logs ("createdAt" DESC);

-- ============================================================================
-- 04. KEPEGAWAIAN & KESISWAAN (TEACHERS, CLASSES, STUDENTS, LINKS, PARENTS, PIP)
-- ============================================================================
CREATE TABLE public.teachers (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "userId" UUID,
    "nuptk" TEXT,
    "nip" TEXT,
    "nik" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "birthDate" DATE,
    "birthPlace" TEXT,
    "religion" TEXT,
    "address" TEXT,
    "dusun" TEXT,
    "rt" TEXT,
    "rw" TEXT,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "telepon" TEXT,
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
    "allowDesktopAttendance" BOOLEAN NOT NULL DEFAULT false,
    "baseSalary" NUMERIC(15,2),
    "subjects" TEXT,
    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 24,
    -- Kolom Dapodik PTK
    "tugasTambahan" TEXT,
    "skCpns" TEXT,
    "tanggalCpns" DATE,
    "skPengangkatan" TEXT,
    "tmtPengangkatan" DATE,
    "lembagaPengangkatan" TEXT,
    "pangkatGolongan" TEXT,
    "sumberGaji" TEXT,
    "namaIbuKandung" TEXT,
    "statusPerkawinan" TEXT,
    "namaSuamiIstri" TEXT,
    "nipSuamiIstri" TEXT,
    "pekerjaanSuamiIstri" TEXT,
    "tmtPns" DATE,
    "sudahLisensiKepalaSekolah" BOOLEAN NOT NULL DEFAULT false,
    "pernahDiklatKepengawasan" BOOLEAN NOT NULL DEFAULT false,
    "keahlianBraille" BOOLEAN NOT NULL DEFAULT false,
    "keahlianBahasaIsyarat" BOOLEAN NOT NULL DEFAULT false,
    "npwp" TEXT,
    "namaWajibPajak" TEXT,
    "kewarganegaraan" TEXT DEFAULT 'Indonesia',
    "bank" TEXT,
    "nomorRekeningBank" TEXT,
    "rekeningAtasNama" TEXT,
    "noKk" TEXT,
    "karpeg" TEXT,
    "karisKarsu" TEXT,
    "lintang" TEXT,
    "bujur" TEXT,
    "nuks" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT teachers_pkey PRIMARY KEY ("id"),
    CONSTRAINT teachers_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT teachers_user_fkey
        FOREIGN KEY ("userId") REFERENCES public.users("id")
        ON DELETE SET NULL,
    CONSTRAINT teachers_salary_check CHECK ("baseSalary" IS NULL OR "baseSalary" >= 0),
    CONSTRAINT teachers_hours_check CHECK ("maxHoursPerWeek" > 0)
);

CREATE UNIQUE INDEX teachers_school_id_key ON public.teachers ("schoolId", "id");
CREATE UNIQUE INDEX teachers_user_unique_key
    ON public.teachers ("userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX teachers_school_nuptk_key
    ON public.teachers ("schoolId", "nuptk") WHERE "nuptk" IS NOT NULL AND trim("nuptk") <> '';
CREATE UNIQUE INDEX teachers_school_nip_key
    ON public.teachers ("schoolId", "nip") WHERE "nip" IS NOT NULL AND trim("nip") <> '';
CREATE UNIQUE INDEX teachers_school_nik_key
    ON public.teachers ("schoolId", "nik") WHERE "nik" IS NOT NULL AND trim("nik") <> '';
CREATE INDEX teachers_school_idx ON public.teachers ("schoolId");
CREATE INDEX teachers_name_idx ON public.teachers ("fullName");
CREATE INDEX teachers_status_idx ON public.teachers ("schoolId", "status");
CREATE INDEX teachers_certified_idx ON public.teachers ("schoolId", "isCertified");

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
    CONSTRAINT classes_grade_check CHECK ("gradeLevel" >= 0),
    CONSTRAINT classes_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT classes_academic_year_fkey
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT classes_homeroom_teacher_fkey
        FOREIGN KEY ("schoolId", "homeroomTeacherId")
        REFERENCES public.teachers("schoolId", "id")
        ON DELETE SET NULL ("homeroomTeacherId")
);

CREATE UNIQUE INDEX classes_school_id_key ON public.classes ("schoolId", "id");
CREATE UNIQUE INDEX classes_school_year_name_key
    ON public.classes ("schoolId", "academicYearId", "name");
CREATE INDEX classes_school_idx ON public.classes ("schoolId");
CREATE INDEX classes_year_idx ON public.classes ("academicYearId");
CREATE INDEX classes_homeroom_idx ON public.classes ("homeroomTeacherId");

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
    "dusun" TEXT,
    "kelurahan" TEXT,
    "kecamatan" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "telepon" TEXT,
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
        FOREIGN KEY ("schoolId", "classId")
        REFERENCES public.classes("schoolId", "id")
        ON DELETE SET NULL ("classId"),
    CONSTRAINT students_sibling_check
        CHECK ("anakKe" IS NULL OR "anakKe" > 0),
    CONSTRAINT students_siblings_count_check
        CHECK ("jmlSaudara" IS NULL OR "jmlSaudara" >= 0)
);

CREATE UNIQUE INDEX students_school_id_key ON public.students ("schoolId", "id");
CREATE UNIQUE INDEX students_school_nisn_key ON public.students ("schoolId", "nisn");
CREATE UNIQUE INDEX students_school_nis_key
    ON public.students ("schoolId", "nis") WHERE "nis" IS NOT NULL AND trim("nis") <> '';
CREATE UNIQUE INDEX students_school_nik_key ON public.students ("schoolId", "nik");
CREATE INDEX students_school_idx ON public.students ("schoolId");
CREATE INDEX students_class_idx ON public.students ("classId");
CREATE INDEX students_name_idx ON public.students ("fullName");

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
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT student_history_year_fkey
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT student_history_class_fkey
        FOREIGN KEY ("schoolId", "classId")
        REFERENCES public.classes("schoolId", "id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX student_history_unique
    ON public.student_class_history ("studentId", "academicYearId");
CREATE INDEX student_history_school_idx ON public.student_class_history ("schoolId");
CREATE INDEX student_history_student_idx ON public.student_class_history ("studentId");
CREATE INDEX student_history_year_idx ON public.student_class_history ("academicYearId");
CREATE INDEX student_history_class_idx ON public.student_class_history ("classId");

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
        FOREIGN KEY ("schoolId", "userId")
        REFERENCES public.users("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT user_student_links_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX user_student_links_unique
    ON public.user_student_links ("userId", "studentId");
CREATE UNIQUE INDEX user_student_links_one_primary_per_student
    ON public.user_student_links ("studentId") WHERE ("isPrimary" = true);
CREATE INDEX user_student_links_school_idx ON public.user_student_links ("schoolId");
CREATE INDEX user_student_links_student_idx ON public.user_student_links ("studentId");

CREATE TABLE public.student_parents (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nik" TEXT,
    "birthYear" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "education" TEXT,
    "occupation" TEXT,
    "monthlyIncome" TEXT,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "address" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_parents_pkey PRIMARY KEY ("id"),
    CONSTRAINT student_parents_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT student_parents_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX student_parents_student_relation_key
    ON public.student_parents ("studentId", "relation");
CREATE INDEX parents_school_idx ON public.student_parents ("schoolId");
CREATE INDEX parents_student_idx ON public.student_parents ("studentId");

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
    "desil" INTEGER,
    "scoredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_economics_pkey PRIMARY KEY ("id"),
    CONSTRAINT student_economics_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT student_economics_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT student_economics_dependents_check
        CHECK ("dependentsCount" IS NULL OR "dependentsCount" >= 0),
    CONSTRAINT student_economics_desil_check
        CHECK ("desil" IS NULL OR ("desil" >= 1 AND "desil" <= 10))
);

CREATE UNIQUE INDEX student_economics_student_key ON public.student_economics ("studentId");
CREATE INDEX economics_school_idx ON public.student_economics ("schoolId");

-- ============================================================================
-- 05. KEGIATAN BELAJAR, ABSENSI, KALENDER LIBUR & INFORMASI
-- ============================================================================
CREATE TABLE public.attendances (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "studentId" UUID,
    "teacherId" UUID,
    "type" TEXT NOT NULL DEFAULT 'SISWA',
    "date" DATE NOT NULL,
    "endDate" DATE,
    "status" TEXT NOT NULL,
    "leaveType" TEXT,
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ,
    "recordedBy" UUID,
    "checkInTime" TIMESTAMPTZ,
    "checkOutTime" TIMESTAMPTZ,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInDistance" DOUBLE PRECISION,
    "checkInAccuracy" DOUBLE PRECISION,
    "isCheckInMock" BOOLEAN DEFAULT false,
    "checkInSelfieUrl" TEXT,
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutDistance" DOUBLE PRECISION,
    "checkOutAccuracy" DOUBLE PRECISION,
    "isCheckOutMock" BOOLEAN DEFAULT false,
    "checkOutSelfieUrl" TEXT,
    "securityFlags" TEXT[] NOT NULL DEFAULT '{}'::text[],
    "deviceTelemetry" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendances_pkey PRIMARY KEY ("id"),
    CONSTRAINT attendances_type_check CHECK ("type" IN ('SISWA', 'GURU')),
    CONSTRAINT attendances_target_check CHECK (
        ("type" = 'SISWA' AND "studentId" IS NOT NULL AND "teacherId" IS NULL)
        OR
        ("type" = 'GURU' AND "teacherId" IS NOT NULL AND "studentId" IS NULL)
    ),
    CONSTRAINT attendances_end_date_check CHECK ("endDate" IS NULL OR "endDate" >= "date"),
    CONSTRAINT attendances_approval_check CHECK ("approvalStatus" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT attendances_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT attendances_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT attendances_teacher_fkey
        FOREIGN KEY ("schoolId", "teacherId")
        REFERENCES public.teachers("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT attendances_approved_by_fkey
        FOREIGN KEY ("approvedBy") REFERENCES public.users("id")
        ON DELETE SET NULL,
    CONSTRAINT attendances_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX attendances_student_date_type_key
    ON public.attendances ("schoolId", "studentId", "date", "type")
    WHERE "studentId" IS NOT NULL;
CREATE UNIQUE INDEX attendances_teacher_date_type_key
    ON public.attendances ("schoolId", "teacherId", "date", "type")
    WHERE "teacherId" IS NOT NULL;
CREATE INDEX attendances_school_idx ON public.attendances ("schoolId");
CREATE INDEX attendances_date_idx ON public.attendances ("date");
CREATE INDEX attendances_teacher_idx ON public.attendances ("teacherId");
CREATE INDEX attendances_type_idx ON public.attendances ("type");
CREATE INDEX attendances_approval_idx ON public.attendances ("schoolId", "approvalStatus");

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

CREATE UNIQUE INDEX subjects_school_id_key ON public.subjects ("schoolId", "id");
CREATE UNIQUE INDEX subjects_school_code_key
    ON public.subjects ("schoolId", "code") WHERE "code" IS NOT NULL AND trim("code") <> '';
CREATE INDEX subjects_school_idx ON public.subjects ("schoolId");

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
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT schedule_class_fkey
        FOREIGN KEY ("schoolId", "classId")
        REFERENCES public.classes("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT schedule_subject_fkey
        FOREIGN KEY ("schoolId", "subjectId")
        REFERENCES public.subjects("schoolId", "id")
        ON DELETE SET NULL ("subjectId"),
    CONSTRAINT schedule_teacher_fkey
        FOREIGN KEY ("schoolId", "teacherId")
        REFERENCES public.teachers("schoolId", "id")
        ON DELETE SET NULL ("teacherId")
);

CREATE INDEX schedule_school_idx ON public.schedule_entries ("schoolId");
CREATE INDEX schedule_year_idx ON public.schedule_entries ("academicYearId");
CREATE INDEX schedule_class_idx ON public.schedule_entries ("classId");
CREATE INDEX schedule_teacher_idx ON public.schedule_entries ("teacherId");
CREATE INDEX schedule_day_time_idx
    ON public.schedule_entries ("schoolId", "dayOfWeek", "startTime");

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
    ON public.announcements ("schoolId", "publishDate");

CREATE TABLE public.national_holidays (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NASIONAL',
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT national_holidays_pkey PRIMARY KEY ("id"),
    CONSTRAINT national_holidays_type_check
        CHECK ("type" IN ('NASIONAL', 'CUTI_BERSAMA', 'SEKOLAH')),
    CONSTRAINT national_holidays_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE CASCADE,
    CONSTRAINT national_holidays_created_by_fkey
        FOREIGN KEY ("createdBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX national_holidays_scope_date_name_key
    ON public.national_holidays (
        COALESCE("schoolId", '00000000-0000-0000-0000-000000000000'::uuid),
        "date",
        lower(trim("name"))
    );
CREATE INDEX national_holidays_date_idx ON public.national_holidays ("date");
CREATE INDEX national_holidays_school_date_idx ON public.national_holidays ("schoolId", "date");

CREATE TABLE public.daily_quotes (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID,
    "quote" TEXT NOT NULL,
    "author" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT daily_quotes_pkey PRIMARY KEY ("id"),
    CONSTRAINT daily_quotes_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE CASCADE,
    CONSTRAINT daily_quotes_created_by_fkey
        FOREIGN KEY ("createdBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX daily_quotes_school_active_idx ON public.daily_quotes ("schoolId", "isActive");

-- ============================================================================
-- 06. SARPRAS, TATA USAHA & BEASISWA
-- ============================================================================
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
    ON public.inventory_items ("schoolId", "id");
CREATE UNIQUE INDEX inventory_items_school_code_key
    ON public.inventory_items ("schoolId", "code")
    WHERE "code" IS NOT NULL AND trim("code") <> '';
CREATE INDEX inventory_items_school_idx ON public.inventory_items ("schoolId");

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
        CHECK ("type" IN (
            'SALDO_AWAL','MASUK','KELUAR','PENYESUAIAN','PENYESUAIAN_MASUK','PENYESUAIAN_KELUAR'
        )),
    CONSTRAINT inventory_transaction_quantity_check
        CHECK ("quantity" > 0),
    CONSTRAINT inventory_transaction_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT inventory_transaction_item_fkey
        FOREIGN KEY ("schoolId", "itemId")
        REFERENCES public.inventory_items("schoolId", "id")
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
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE
);

CREATE INDEX scholarships_school_idx ON public.scholarship_records ("schoolId");
CREATE INDEX scholarships_student_idx ON public.scholarship_records ("studentId");

-- ============================================================================
-- 07. KEUANGAN SEKOLAH (FEE TEMPLATES, STUDENT BILLS, PAYMENT TRANSACTIONS)
-- ============================================================================
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
        CHECK ("periodType" IN ('BULANAN', 'TAHUNAN', 'SEKALI_BAYAR')),
    CONSTRAINT fee_grade_check
        CHECK ("gradeLevel" IS NULL OR "gradeLevel" >= 0),
    CONSTRAINT fee_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT fee_year_fkey
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX fee_templates_unique
    ON public.fee_templates ("schoolId", "academicYearId", "name", COALESCE("gradeLevel", -1));
CREATE UNIQUE INDEX fee_templates_school_id_key
    ON public.fee_templates ("schoolId", "id");
CREATE INDEX fee_templates_school_idx ON public.fee_templates ("schoolId");

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
    CONSTRAINT student_bills_school_id_student_key
        UNIQUE ("schoolId", "id", "studentId"),
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
        CHECK ("status" IN ('BELUM_BAYAR', 'CICILAN', 'LUNAS', 'DIBATALKAN')),
    CONSTRAINT bills_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_fee_fkey
        FOREIGN KEY ("schoolId", "feeTemplateId")
        REFERENCES public.fee_templates("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT bills_year_fkey
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES public.academic_years("schoolId", "id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX student_bills_unique_period
    ON public.student_bills (
        "studentId", "feeTemplateId", "academicYearId",
        COALESCE("periodMonth", 0), COALESCE("periodYear", 0)
    );
CREATE INDEX bills_school_idx ON public.student_bills ("schoolId");
CREATE INDEX bills_student_idx ON public.student_bills ("studentId");
CREATE INDEX bills_fee_template_idx ON public.student_bills ("feeTemplateId");
CREATE INDEX bills_year_idx ON public.student_bills ("academicYearId");
CREATE INDEX bills_status_idx ON public.student_bills ("status");

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
    CONSTRAINT payment_status_check CHECK ("status" IN ('BERHASIL', 'DIBATALKAN')),
    CONSTRAINT payment_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT payment_bill_student_fkey
        FOREIGN KEY ("schoolId", "billId", "studentId")
        REFERENCES public.student_bills("schoolId", "id", "studentId")
        ON DELETE RESTRICT,
    CONSTRAINT payment_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX payments_school_idx ON public.payment_transactions ("schoolId");
CREATE INDEX payments_bill_idx ON public.payment_transactions ("billId");
CREATE INDEX payments_student_idx ON public.payment_transactions ("studentId");
CREATE INDEX payments_date_idx ON public.payment_transactions ("paymentDate");

-- ============================================================================
-- 08. PERPUSTAKAAN (LIBRARY BOOKS & LIBRARY LOANS)
-- ============================================================================
CREATE TABLE public.library_books (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "code" TEXT,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "publishYear" INTEGER,
    "category" TEXT,
    "shelfLocation" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT library_books_pkey PRIMARY KEY ("id"),
    CONSTRAINT library_books_copies_check
        CHECK (
            "totalCopies" >= 0
            AND "availableCopies" >= 0
            AND "availableCopies" <= "totalCopies"
        ),
    CONSTRAINT library_books_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX library_books_school_id_key
    ON public.library_books ("schoolId", "id");
CREATE UNIQUE INDEX library_books_school_code_key
    ON public.library_books ("schoolId", "code")
    WHERE "code" IS NOT NULL AND trim("code") <> '';
CREATE INDEX library_books_school_idx ON public.library_books ("schoolId");
CREATE INDEX library_books_title_idx ON public.library_books ("title");

CREATE TABLE public.library_loans (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schoolId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "borrowerType" TEXT NOT NULL DEFAULT 'SISWA',
    "studentId" UUID,
    "teacherId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "loanDate" DATE NOT NULL DEFAULT CURRENT_DATE,
    "dueDate" DATE NOT NULL,
    "returnDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'DIPINJAM',
    "fineAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recordedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT library_loans_pkey PRIMARY KEY ("id"),
    CONSTRAINT library_loans_borrower_type_check
        CHECK ("borrowerType" IN ('SISWA', 'GURU')),
    CONSTRAINT library_loans_borrower_target_check
        CHECK (
            ("borrowerType" = 'SISWA' AND "studentId" IS NOT NULL AND "teacherId" IS NULL)
            OR
            ("borrowerType" = 'GURU' AND "teacherId" IS NOT NULL AND "studentId" IS NULL)
        ),
    CONSTRAINT library_loans_quantity_check CHECK ("quantity" > 0),
    CONSTRAINT library_loans_date_check CHECK ("dueDate" >= "loanDate"),
    CONSTRAINT library_loans_status_check
        CHECK ("status" IN ('DIPINJAM', 'DIKEMBALIKAN', 'TERLAMBAT', 'HILANG')),
    CONSTRAINT library_loans_fine_check CHECK ("fineAmount" >= 0),
    CONSTRAINT library_loans_school_fkey
        FOREIGN KEY ("schoolId") REFERENCES public.schools("id")
        ON DELETE RESTRICT,
    CONSTRAINT library_loans_book_fkey
        FOREIGN KEY ("schoolId", "bookId")
        REFERENCES public.library_books("schoolId", "id")
        ON DELETE RESTRICT,
    CONSTRAINT library_loans_student_fkey
        FOREIGN KEY ("schoolId", "studentId")
        REFERENCES public.students("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT library_loans_teacher_fkey
        FOREIGN KEY ("schoolId", "teacherId")
        REFERENCES public.teachers("schoolId", "id")
        ON DELETE CASCADE,
    CONSTRAINT library_loans_recorded_by_fkey
        FOREIGN KEY ("recordedBy") REFERENCES public.users("id")
        ON DELETE SET NULL
);

CREATE INDEX library_loans_school_idx ON public.library_loans ("schoolId");
CREATE INDEX library_loans_book_idx ON public.library_loans ("bookId");
CREATE INDEX library_loans_student_idx ON public.library_loans ("studentId");
CREATE INDEX library_loans_teacher_idx ON public.library_loans ("teacherId");
CREATE INDEX library_loans_status_idx ON public.library_loans ("status");

-- ============================================================================
-- 09. SECURITY, GEODESIC & MULTI-ROLE HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_haversine_meters(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT 6371000.0 * 2.0 * asin(
        sqrt(
            power(sin(radians(lat2 - lat1) / 2.0), 2) +
            cos(radians(lat1)) * cos(radians(lat2)) *
            power(sin(radians(lon2 - lon1) / 2.0), 2)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT u."schoolId"
    FROM public.users u
    WHERE u."id" = auth.uid()
      AND u."isActive" = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT u."role"
    FROM public.users u
    WHERE u."id" = auth.uid()
      AND u."isActive" = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.erp_current_user_school_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT public.get_user_school_id(); $$;

CREATE OR REPLACE FUNCTION public.erp_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT public.get_user_role(); $$;

-- Validasi folder storage milik sekolah user (mendukung format folder {schoolId} maupun {Nama_Sekolah})
CREATE OR REPLACE FUNCTION public.is_own_school_storage_folder(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.schools s
        WHERE s."id" = public.get_user_school_id()
          AND lower(trim(COALESCE(p_folder, ''))) IN (
              lower(s."id"::text),
              lower(trim(s."name")),
              lower(regexp_replace(trim(s."name"), '\s+', '_', 'g')),
              lower(regexp_replace(trim(s."name"), '\s+', '-', 'g')),
              lower(regexp_replace(trim(s."name"), '[^a-zA-Z0-9]+', '_', 'g')),
              lower(regexp_replace(trim(s."name"), '[^a-zA-Z0-9]+', '-', 'g'))
          )
    );
$$;

-- Pemetaan otomatis Tugas Tambahan Dapodik ke role sistem
CREATE OR REPLACE FUNCTION public.map_tugas_tambahan_to_roles(p_tugas TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_text TEXT := lower(trim(COALESCE(p_tugas, '')));
    v_roles TEXT[] := '{}'::text[];
BEGIN
    IF v_text = '' THEN
        RETURN v_roles;
    END IF;

    IF v_text LIKE '%kepala sekolah%' AND v_text NOT LIKE '%wakil kepala%' THEN
        v_roles := array_append(v_roles, 'KEPALA_SEKOLAH');
    END IF;

    IF v_text LIKE '%bendahara%' THEN
        v_roles := array_append(v_roles, 'BENDAHARA');
    END IF;

    IF v_text LIKE '%sarpras%' OR v_text LIKE '%sarana%' THEN
        v_roles := array_append(v_roles, 'STAFF_SARPRAS');
    END IF;

    IF v_text LIKE '%perpustakaan%' OR v_text LIKE '%perpus%' THEN
        v_roles := array_append(v_roles, 'STAFF_PERPUS');
    END IF;

    IF v_text LIKE '%tata usaha%' OR v_text LIKE '%administrasi%' THEN
        v_roles := array_append(v_roles, 'STAFF_TU');
    END IF;

    IF v_text LIKE '%wali kelas%' THEN
        v_roles := array_append(v_roles, 'WALI_KELAS');
    END IF;

    IF v_text LIKE '%wakil kepala%' OR v_text LIKE '%wakasek%' OR v_text LIKE '%operator%' THEN
        v_roles := array_append(v_roles, 'OPERATOR');
    END IF;

    RETURN v_roles;
END;
$$;

-- Mengambil SELURUH role aktif milik user (Role Utama + additionalRoles + Tugas Tambahan Dapodik)
CREATE OR REPLACE FUNCTION public.get_user_all_roles()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        ARRAY(
            SELECT DISTINCT r
            FROM (
                SELECT u."role" AS r
                FROM public.users u
                WHERE u."id" = auth.uid() AND u."isActive" = true

                UNION ALL

                SELECT unnest(u."additionalRoles") AS r
                FROM public.users u
                WHERE u."id" = auth.uid() AND u."isActive" = true

                UNION ALL

                SELECT unnest(public.map_tugas_tambahan_to_roles(t."tugasTambahan")) AS r
                FROM public.teachers t
                WHERE t."userId" = auth.uid() AND t."isActive" = true
            ) combined
            WHERE r IS NOT NULL AND r <> ''
        ),
        '{}'::text[]
    );
$$;

CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.is_super_admin()
        OR ('ADMIN' = ANY(public.get_user_all_roles()));
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_users()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.is_super_admin()
        OR (public.get_user_all_roles() && ARRAY['ADMIN', 'OPERATOR', 'STAFF_TU']::text[]);
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_academic()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','WALI_KELAS','GURU'
    ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_students()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR',
        'WALI_KELAS','GURU','STAFF_TU'
    ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_finance()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','BENDAHARA'
    ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_inventory()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','STAFF_SARPRAS'
    ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_library()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','STAFF_PERPUS'
    ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_administration()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.get_user_all_roles() && ARRAY[
        'SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU'
    ]::text[];
$$;

REVOKE ALL ON FUNCTION public.calculate_haversine_meters(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_current_user_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_own_school_storage_folder(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.map_tugas_tambahan_to_roles(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_all_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_school_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_academic() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_students() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_finance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_inventory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_library() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_manage_administration() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.calculate_haversine_meters(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_current_user_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_school_storage_folder(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_tugas_tambahan_to_roles(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_all_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_academic() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_finance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_library() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_administration() TO authenticated;

-- ============================================================================
-- 10. TRIGGERS: UPDATED_AT, SECURITY, APPROVAL, AUTH CLEANUP, STOK & KEUANGAN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
END;
$$;

DO $trg$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'schools','academic_years','semesters','users','teachers','classes',
        'students','student_parents','student_economics','attendances','subjects',
        'schedule_entries','announcements','national_holidays','daily_quotes',
        'inventory_items','administration_records','scholarship_records',
        'fee_templates','student_bills','library_books','library_loans'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            tbl || '_updated_at', tbl
        );
    END LOOP;
END $trg$;

-- Sinkronisasi otomatis izin presensi komputer saat guru baru ditambahkan jika Saklar Global aktif
CREATE OR REPLACE FUNCTION public.sync_new_teacher_desktop_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_global_allow BOOLEAN;
BEGIN
    SELECT COALESCE("allowDesktopAttendanceGlobal", false)
    INTO v_global_allow
    FROM public.schools
    WHERE "id" = NEW."schoolId";

    IF v_global_allow IS TRUE THEN
        NEW."allowDesktopAttendance" := true;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_new_teacher_desktop_attendance
BEFORE INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.sync_new_teacher_desktop_attendance();

-- Proteksi ketat field keamanan & hierarki SUPER_ADMIN vs ADMIN Sekolah
CREATE OR REPLACE FUNCTION public.protect_user_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF public.is_super_admin() THEN
        RETURN NEW;
    END IF;

    IF ('ADMIN' = ANY(public.get_user_all_roles())) THEN
        IF OLD."role" IN ('SUPER_ADMIN', 'ADMIN') AND OLD."id" <> auth.uid() THEN
            RAISE EXCEPTION 'ADMIN sekolah tidak diizinkan mengubah akun Admin lain.';
        END IF;

        IF NEW."role" IS DISTINCT FROM OLD."role"
           AND (NEW."role" IN ('SUPER_ADMIN', 'ADMIN') OR OLD."id" = auth.uid())
        THEN
            RAISE EXCEPTION 'Anda tidak memiliki hak untuk menetapkan atau mengubah role Admin.';
        END IF;

        IF NEW."additionalRoles" IS DISTINCT FROM OLD."additionalRoles"
           AND ('ADMIN' = ANY(NEW."additionalRoles"))
        THEN
            RAISE EXCEPTION 'ADMIN sekolah tidak diizinkan menambahkan hak akses ADMIN.';
        END IF;

        IF NEW."schoolId" IS DISTINCT FROM OLD."schoolId"
           OR (OLD."id" = auth.uid() AND NEW."isActive" IS DISTINCT FROM OLD."isActive")
        THEN
            RAISE EXCEPTION 'Perubahan sekolah atau status akun sendiri tidak diizinkan.';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW."role" IS DISTINCT FROM OLD."role"
       OR NEW."additionalRoles" IS DISTINCT FROM OLD."additionalRoles"
       OR NEW."schoolId" IS DISTINCT FROM OLD."schoolId"
       OR NEW."isActive" IS DISTINCT FROM OLD."isActive"
    THEN
        RAISE EXCEPTION 'Anda tidak memiliki hak untuk mengubah role, tugas tambahan, sekolah, atau status akun.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER users_security_fields
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_security_fields();

-- Proteksi status persetujuan izin/cuti/dinas pada tabel attendances
CREATE OR REPLACE FUNCTION public.protect_attendance_approval()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_approver BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_is_approver := public.is_super_admin()
        OR (public.get_user_all_roles() && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[]);

    IF NOT v_is_approver THEN
        IF NEW."type" = 'GURU' AND (
            (NEW."leaveType" IS NOT NULL AND trim(NEW."leaveType") <> '')
            OR upper(trim(COALESCE(NEW."status", ''))) IN ('IZIN', 'SAKIT', 'CUTI', 'DINAS', 'DINAS_LUAR')
        ) THEN
            IF TG_OP = 'INSERT' THEN
                NEW."approvalStatus" := 'PENDING';
                NEW."approvedBy" := NULL;
                NEW."approvedAt" := NULL;
            ELSIF TG_OP = 'UPDATE' THEN
                NEW."approvalStatus" := OLD."approvalStatus";
                NEW."approvedBy" := OLD."approvedBy";
                NEW."approvedAt" := OLD."approvedAt";
            END IF;
        END IF;
    ELSE
        IF NEW."approvalStatus" IN ('APPROVED', 'REJECTED')
           AND (TG_OP = 'INSERT' OR NEW."approvalStatus" IS DISTINCT FROM OLD."approvalStatus")
        THEN
            NEW."approvedBy" := COALESCE(NEW."approvedBy", auth.uid());
            NEW."approvedAt" := COALESCE(NEW."approvedAt", now());
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER attendances_approval_guard
BEFORE INSERT OR UPDATE ON public.attendances
FOR EACH ROW EXECUTE FUNCTION public.protect_attendance_approval();

-- Sinkronisasi hapus akun Auth ketika Siswa dihapus
CREATE OR REPLACE FUNCTION public.auto_delete_auth_on_student_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    link_record RECORD;
BEGIN
    FOR link_record IN
        SELECT "userId", "relationship"
        FROM public.user_student_links
        WHERE "studentId" = OLD."id"
    LOOP
        IF link_record."relationship" = 'SISWA' THEN
            DELETE FROM auth.users
            WHERE id = link_record."userId"
              AND EXISTS (
                  SELECT 1 FROM public.users u
                  WHERE u."id" = link_record."userId"
                    AND u."role" = 'SISWA'
                    AND u."additionalRoles" = '{}'::text[]
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.teachers t
                  WHERE t."userId" = link_record."userId"
              );
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_student_links
                WHERE "userId" = link_record."userId"
                  AND "studentId" <> OLD."id"
            ) THEN
                DELETE FROM auth.users
                WHERE id = link_record."userId"
                  AND EXISTS (
                      SELECT 1 FROM public.users u
                      WHERE u."id" = link_record."userId"
                        AND u."role" = 'ORANG_TUA'
                        AND u."additionalRoles" = '{}'::text[]
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM public.teachers t
                      WHERE t."userId" = link_record."userId"
                  );
            END IF;
        END IF;
    END LOOP;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_delete_student_auth
BEFORE DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.auto_delete_auth_on_student_delete();

-- Sinkronisasi hapus akun Auth ketika Guru/PTK dihapus (Aman untuk Admin & Guru yang juga Wali Siswa)
CREATE OR REPLACE FUNCTION public.auto_delete_auth_on_teacher_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD."userId" IS NOT NULL THEN
        DELETE FROM auth.users
        WHERE id = OLD."userId"
          AND NOT EXISTS (
              SELECT 1 FROM public.users u
              WHERE u."id" = OLD."userId"
                AND u."role" IN ('SUPER_ADMIN', 'ADMIN')
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.user_student_links l
              WHERE l."userId" = OLD."userId"
          );
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_delete_teacher_auth
AFTER DELETE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.auto_delete_auth_on_teacher_delete();

-- Sinkronisasi stok inventaris otomatis dari ledger transaksi
CREATE OR REPLACE FUNCTION public.sync_inventory_quantity(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_school_id UUID;
    v_balance NUMERIC(15,2);
BEGIN
    SELECT i."schoolId" INTO v_school_id
    FROM public.inventory_items i
    WHERE i."id" = p_item_id
    FOR UPDATE;

    IF v_school_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN t."type" IN ('SALDO_AWAL','MASUK','PENYESUAIAN','PENYESUAIAN_MASUK') THEN t."quantity"
                WHEN t."type" IN ('KELUAR','PENYESUAIAN_KELUAR') THEN -t."quantity"
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.sync_inventory_quantity(OLD."itemId");
        RETURN OLD;
    END IF;

    PERFORM public.sync_inventory_quantity(NEW."itemId");

    IF TG_OP = 'UPDATE' AND OLD."itemId" IS DISTINCT FROM NEW."itemId" THEN
        PERFORM public.sync_inventory_quantity(OLD."itemId");
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_quantity_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.inventory_transaction_trigger();

-- Kalkulasi ulang otomatis tagihan & status lunas siswa + Validasi Anti-Overpayment
CREATE OR REPLACE FUNCTION public.recalculate_student_bill(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total NUMERIC(15,2);
    v_current_status TEXT;
    v_paid NUMERIC(15,2);
    v_status TEXT;
BEGIN
    SELECT "totalAmount", "status"
    INTO v_total, v_current_status
    FROM public.student_bills
    WHERE "id" = p_bill_id
    FOR UPDATE;

    IF v_total IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(CASE WHEN "status" = 'BERHASIL' THEN "amount" ELSE 0 END), 0
    )
    INTO v_paid
    FROM public.payment_transactions
    WHERE "billId" = p_bill_id;

    IF v_current_status = 'DIBATALKAN' AND v_paid > 0 THEN
        RAISE EXCEPTION 'Tagihan yang sudah dibatalkan tidak dapat menerima pembayaran aktif.';
    END IF;

    IF v_paid > v_total THEN
        RAISE EXCEPTION 'Total pembayaran (Rp %) melebihi total tagihan (Rp %). Sisa tagihan tidak mencukupi.',
            v_paid, v_total;
    END IF;

    IF v_paid <= 0 THEN
        v_status := 'BELUM_BAYAR';
    ELSIF v_paid >= v_total THEN
        v_status := 'LUNAS';
    ELSE
        v_status := 'CICILAN';
    END IF;

    UPDATE public.student_bills
    SET "paidAmount" = v_paid,
        "status" = CASE WHEN "status" = 'DIBATALKAN' THEN 'DIBATALKAN' ELSE v_status END,
        "updatedAt" = now()
    WHERE "id" = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_change_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_student_bill(OLD."billId");
        RETURN OLD;
    END IF;

    PERFORM public.recalculate_student_bill(NEW."billId");

    IF TG_OP = 'UPDATE' AND OLD."billId" IS DISTINCT FROM NEW."billId" THEN
        PERFORM public.recalculate_student_bill(OLD."billId");
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER payment_status_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.payment_change_trigger();

-- Sinkronisasi otomatis status tagihan ketika totalAmount pada student_bills diubah
CREATE OR REPLACE FUNCTION public.student_bill_amount_change_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW."totalAmount" < NEW."paidAmount" THEN
        RAISE EXCEPTION 'Total tagihan baru (Rp %) tidak boleh lebih kecil dari jumlah yang sudah dibayar (Rp %).',
            NEW."totalAmount", NEW."paidAmount";
    END IF;

    IF NEW."status" <> 'DIBATALKAN' THEN
        IF NEW."paidAmount" <= 0 THEN
            NEW."status" := 'BELUM_BAYAR';
        ELSIF NEW."paidAmount" >= NEW."totalAmount" THEN
            NEW."status" := 'LUNAS';
        ELSE
            NEW."status" := 'CICILAN';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER student_bills_amount_sync
BEFORE UPDATE OF "totalAmount" ON public.student_bills
FOR EACH ROW EXECUTE FUNCTION public.student_bill_amount_change_trigger();

-- Sinkronisasi stok eksemplar buku perpustakaan otomatis saat sirkulasi peminjaman berubah
CREATE OR REPLACE FUNCTION public.sync_library_book_copies(p_book_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total INTEGER;
    v_borrowed INTEGER;
    v_available INTEGER;
BEGIN
    SELECT b."totalCopies" INTO v_total
    FROM public.library_books b
    WHERE b."id" = p_book_id
    FOR UPDATE;

    IF v_total IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        SUM(CASE WHEN l."status" IN ('DIPINJAM', 'TERLAMBAT') THEN l."quantity" ELSE 0 END), 0
    )
    INTO v_borrowed
    FROM public.library_loans l
    WHERE l."bookId" = p_book_id;

    v_available := v_total - v_borrowed;

    IF v_available < 0 THEN
        RAISE EXCEPTION 'Stok eksemplar buku tersedia tidak mencukupi untuk peminjaman ini.';
    END IF;

    UPDATE public.library_books
    SET "availableCopies" = v_available,
        "updatedAt" = now()
    WHERE "id" = p_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.library_loan_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.sync_library_book_copies(OLD."bookId");
        RETURN OLD;
    END IF;

    PERFORM public.sync_library_book_copies(NEW."bookId");

    IF TG_OP = 'UPDATE' AND OLD."bookId" IS DISTINCT FROM NEW."bookId" THEN
        PERFORM public.sync_library_book_copies(OLD."bookId");
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER library_loans_copies_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.library_loans
FOR EACH ROW EXECUTE FUNCTION public.library_loan_trigger();

CREATE OR REPLACE FUNCTION public.library_book_total_copies_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_borrowed INTEGER;
BEGIN
    SELECT COALESCE(
        SUM(CASE WHEN l."status" IN ('DIPINJAM', 'TERLAMBAT') THEN l."quantity" ELSE 0 END), 0
    )
    INTO v_borrowed
    FROM public.library_loans l
    WHERE l."bookId" = NEW."id";

    IF NEW."totalCopies" < v_borrowed THEN
        RAISE EXCEPTION 'Total eksemplar (%) tidak boleh lebih kecil dari jumlah buku yang sedang dipinjam (%).',
            NEW."totalCopies", v_borrowed;
    END IF;

    NEW."availableCopies" := NEW."totalCopies" - v_borrowed;
    RETURN NEW;
END;
$$;

CREATE TRIGGER library_books_total_copies_sync
BEFORE INSERT OR UPDATE OF "totalCopies" ON public.library_books
FOR EACH ROW EXECUTE FUNCTION public.library_book_total_copies_trigger();

-- ============================================================================
-- 11. RPC FUNCTIONS: LOGIN, TAHUN AJARAN, PRESENSI GPS/DESKTOP & IMPOR DAPODIK
-- ============================================================================

-- 11A. Helper Sanitasi String & Boolean Dapodik
CREATE OR REPLACE FUNCTION public.clean_dapodik_str(p_val TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_val IS NULL THEN NULL
        WHEN trim(p_val) IN ('', '-') THEN NULL
        ELSE trim(p_val)
    END;
$$;

CREATE OR REPLACE FUNCTION public.parse_dapodik_bool(p_val TEXT, p_default BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean TEXT := lower(trim(COALESCE(p_val, '')));
BEGIN
    IF v_clean = '' OR v_clean = '-' THEN
        RETURN p_default;
    ELSIF v_clean IN ('true', 't', '1', 'yes', 'y', 'ya', 'on') THEN
        RETURN true;
    ELSIF v_clean IN ('false', 'f', '0', 'no', 'n', 'tidak', 'off') THEN
        RETURN false;
    END IF;
    RETURN p_default;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_dapodik_str(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parse_dapodik_bool(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clean_dapodik_str(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parse_dapodik_bool(TEXT, BOOLEAN) TO authenticated;

-- 11B. Resolve Email dari NUPTK / NIP / NIK / NISN / NIS
CREATE OR REPLACE FUNCTION public.resolve_user_email(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_id TEXT;
    master_record RECORD;
    v_linked_email TEXT;
BEGIN
    IF identifier IS NULL OR trim(identifier) = '' THEN
        RETURN NULL;
    END IF;

    clean_id := REPLACE(REPLACE(trim(identifier), ' ', ''), '-', '');

    -- 1. Cek Tabel Teachers
    SELECT * INTO master_record FROM public.teachers
    WHERE REPLACE(REPLACE(nuptk, ' ', ''), '-', '') = clean_id
       OR REPLACE(REPLACE(nip, ' ', ''), '-', '') = clean_id
       OR REPLACE(REPLACE(nik, ' ', ''), '-', '') = clean_id
    ORDER BY
        ("userId" IS NOT NULL) DESC,
        "isActive" DESC,
        "updatedAt" DESC
    LIMIT 1;

    IF FOUND THEN
        IF master_record."userId" IS NOT NULL THEN
            SELECT u."email" INTO v_linked_email
            FROM public.users u
            WHERE u."id" = master_record."userId"
            LIMIT 1;

            IF v_linked_email IS NOT NULL AND trim(v_linked_email) <> '' THEN
                RETURN LOWER(TRIM(v_linked_email));
            END IF;
        END IF;

        IF master_record.email IS NOT NULL AND TRIM(master_record.email) <> '' THEN
            RETURN LOWER(TRIM(master_record.email));
        ELSIF master_record.nuptk IS NOT NULL AND TRIM(master_record.nuptk) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nuptk), ' ', ''), '-', '') || '@sistem.local');
        ELSIF master_record.nip IS NOT NULL AND TRIM(master_record.nip) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nip), ' ', ''), '-', '') || '@sistem.local');
        ELSIF master_record.nik IS NOT NULL AND TRIM(master_record.nik) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nik), ' ', ''), '-', '') || '@sistem.local');
        ELSE
            RETURN LOWER(SUBSTRING(master_record.id::text FROM 1 FOR 8) || '@sistem.local');
        END IF;
    END IF;

    -- 2. Cek Tabel Students
    SELECT s.* INTO master_record FROM public.students s
    WHERE REPLACE(REPLACE(s.nisn, ' ', ''), '-', '') = clean_id
       OR REPLACE(REPLACE(s.nis, ' ', ''), '-', '') = clean_id
       OR REPLACE(REPLACE(s.nik, ' ', ''), '-', '') = clean_id
       OR REPLACE(REPLACE(s."noPesertaUn", ' ', ''), '-', '') = clean_id
    ORDER BY
        EXISTS (
            SELECT 1 FROM public.user_student_links l
            WHERE l."studentId" = s."id" AND l."relationship" = 'SISWA'
        ) DESC,
        (s."status" = 'AKTIF') DESC,
        s."updatedAt" DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT u."email" INTO v_linked_email
        FROM public.user_student_links l
        JOIN public.users u ON u."id" = l."userId"
        WHERE l."studentId" = master_record."id"
          AND l."relationship" = 'SISWA'
        LIMIT 1;

        IF v_linked_email IS NOT NULL AND trim(v_linked_email) <> '' THEN
            RETURN LOWER(TRIM(v_linked_email));
        END IF;

        IF master_record.email IS NOT NULL AND TRIM(master_record.email) <> '' THEN
            RETURN LOWER(TRIM(master_record.email));
        ELSIF master_record.nisn IS NOT NULL AND TRIM(master_record.nisn) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nisn), ' ', ''), '-', '') || '@sistem.local');
        ELSIF master_record.nis IS NOT NULL AND TRIM(master_record.nis) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nis), ' ', ''), '-', '') || '@sistem.local');
        ELSIF master_record.nik IS NOT NULL AND TRIM(master_record.nik) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nik), ' ', ''), '-', '') || '@sistem.local');
        ELSE
            RETURN LOWER(SUBSTRING(master_record.id::text FROM 1 FOR 8) || '@sistem.local');
        END IF;
    END IF;

    -- 3. Cek Tabel Student Parents
    SELECT p.* INTO master_record FROM public.student_parents p
    WHERE REPLACE(REPLACE(p.nik, ' ', ''), '-', '') = clean_id
    ORDER BY
        EXISTS (
            SELECT 1 FROM public.user_student_links l
            WHERE l."studentId" = p."studentId" AND l."relationship" <> 'SISWA'
        ) DESC,
        p."updatedAt" DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT u."email" INTO v_linked_email
        FROM public.user_student_links l
        JOIN public.users u ON u."id" = l."userId"
        WHERE l."studentId" = master_record."studentId"
          AND l."relationship" <> 'SISWA'
        ORDER BY
            CASE
                WHEN lower(trim(u."email")) = lower(trim(COALESCE(master_record.email, ''))) THEN 0
                WHEN l."isPrimary" = true THEN 1
                ELSE 2
            END
        LIMIT 1;

        IF v_linked_email IS NOT NULL AND trim(v_linked_email) <> '' THEN
            RETURN LOWER(TRIM(v_linked_email));
        END IF;

        IF master_record.email IS NOT NULL AND TRIM(master_record.email) <> '' THEN
            RETURN LOWER(TRIM(master_record.email));
        ELSIF master_record.nik IS NOT NULL AND TRIM(master_record.nik) <> '' THEN
            RETURN LOWER(REPLACE(REPLACE(TRIM(master_record.nik), ' ', ''), '-', '') || '@sistem.local');
        ELSE
            RETURN LOWER('w-' || SUBSTRING(master_record."studentId"::text FROM 1 FOR 6) || '@sistem.local');
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_user_email(TEXT) TO anon, authenticated;

-- 11C. Set Tahun Ajaran Aktif & Semester Aktif
CREATE OR REPLACE FUNCTION public.set_active_academic_year(
    p_school_id UUID,
    p_academic_year_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_school_id UUID;
    v_user_is_active BOOLEAN;
    v_all_roles TEXT[];
    v_target_semester_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login terlebih dahulu.';
    END IF;

    SELECT "schoolId", "isActive"
    INTO v_user_school_id, v_user_is_active
    FROM public.users
    WHERE "id" = auth.uid();

    IF NOT FOUND OR v_user_is_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Akun pengguna tidak ditemukan atau tidak aktif.';
    END IF;

    v_all_roles := public.get_user_all_roles();

    IF NOT (v_all_roles && ARRAY['ADMIN', 'SUPER_ADMIN']::text[]) THEN
        RAISE EXCEPTION 'Anda tidak memiliki izin mengubah tahun ajaran.';
    END IF;

    IF NOT public.is_super_admin() AND v_user_school_id IS DISTINCT FROM p_school_id THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses ke sekolah ini.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, 0));

    IF NOT EXISTS (
        SELECT 1 FROM public.academic_years
        WHERE "id" = p_academic_year_id AND "schoolId" = p_school_id
    ) THEN
        RAISE EXCEPTION 'Tahun ajaran tidak ditemukan pada sekolah ini.';
    END IF;

    UPDATE public.academic_years
    SET "isActive" = false
    WHERE "schoolId" = p_school_id AND "isActive" = true AND "id" <> p_academic_year_id;

    UPDATE public.academic_years
    SET "isActive" = true
    WHERE "id" = p_academic_year_id AND "schoolId" = p_school_id;

    UPDATE public.semesters
    SET "isActive" = false
    WHERE "schoolId" = p_school_id
      AND "academicYearId" <> p_academic_year_id
      AND "isActive" = true;

    IF NOT EXISTS (
        SELECT 1 FROM public.semesters
        WHERE "schoolId" = p_school_id
          AND "academicYearId" = p_academic_year_id
          AND "isActive" = true
    ) THEN
        SELECT s."id" INTO v_target_semester_id
        FROM public.semesters s
        WHERE s."schoolId" = p_school_id
          AND s."academicYearId" = p_academic_year_id
        ORDER BY
            CASE WHEN CURRENT_DATE BETWEEN s."startDate" AND s."endDate" THEN 0 ELSE 1 END,
            CASE WHEN s."type" = 'GANJIL' THEN 0 ELSE 1 END,
            s."startDate" ASC
        LIMIT 1;

        IF v_target_semester_id IS NOT NULL THEN
            UPDATE public.semesters
            SET "isActive" = true
            WHERE "id" = v_target_semester_id;
        END IF;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_active_semester(
    p_school_id UUID,
    p_semester_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_school_id UUID;
    v_user_is_active BOOLEAN;
    v_all_roles TEXT[];
    v_academic_year_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login terlebih dahulu.';
    END IF;

    SELECT "schoolId", "isActive"
    INTO v_user_school_id, v_user_is_active
    FROM public.users
    WHERE "id" = auth.uid();

    IF NOT FOUND OR v_user_is_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Akun pengguna tidak ditemukan atau tidak aktif.';
    END IF;

    v_all_roles := public.get_user_all_roles();

    IF NOT (v_all_roles && ARRAY['ADMIN', 'SUPER_ADMIN']::text[]) THEN
        RAISE EXCEPTION 'Anda tidak memiliki izin mengubah semester aktif.';
    END IF;

    IF NOT public.is_super_admin() AND v_user_school_id IS DISTINCT FROM p_school_id THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses ke sekolah ini.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, 0));

    SELECT "academicYearId" INTO v_academic_year_id
    FROM public.semesters
    WHERE "id" = p_semester_id AND "schoolId" = p_school_id;

    IF v_academic_year_id IS NULL THEN
        RAISE EXCEPTION 'Semester tidak ditemukan pada sekolah ini.';
    END IF;

    UPDATE public.academic_years
    SET "isActive" = false
    WHERE "schoolId" = p_school_id AND "isActive" = true AND "id" <> v_academic_year_id;

    UPDATE public.academic_years
    SET "isActive" = true
    WHERE "id" = v_academic_year_id AND "schoolId" = p_school_id;

    UPDATE public.semesters
    SET "isActive" = false
    WHERE "schoolId" = p_school_id AND "isActive" = true AND "id" <> p_semester_id;

    UPDATE public.semesters
    SET "isActive" = true
    WHERE "id" = p_semester_id AND "schoolId" = p_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_academic_year(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_active_semester(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_academic_year(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_semester(UUID, UUID) TO authenticated;

-- 11D. Onboarding Sekolah Baru & Setup Tenant oleh SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.create_school_for_current_user(p_school JSONB)
RETURNS SETOF public.schools
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user public.users%ROWTYPE;
    v_school public.schools%ROWTYPE;
    v_school_id UUID := gen_random_uuid();
BEGIN
    SELECT * INTO v_user FROM public.users WHERE "id" = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil pengguna tidak ditemukan.';
    END IF;
    IF NOT (public.get_user_all_roles() && ARRAY['SUPER_ADMIN', 'ADMIN']::text[]) THEN
        RAISE EXCEPTION 'Hanya Admin atau Super Admin yang dapat mendaftarkan sekolah.';
    END IF;
    IF v_user."role" <> 'SUPER_ADMIN' AND v_user."schoolId" IS NOT NULL THEN
        RAISE EXCEPTION 'Akun ini sudah terhubung dengan sekolah.';
    END IF;

    INSERT INTO public.schools (
        "id", "name", "npsn", "level", "type", "address", "city", "province",
        "phone", "email", "latitude", "longitude", "attendanceRadiusMeters"
    ) VALUES (
        v_school_id,
        p_school->>'name',
        p_school->>'npsn',
        COALESCE(NULLIF(p_school->>'level', ''), 'BELUM_DIATUR'),
        COALESCE(NULLIF(p_school->>'type', ''), 'BELUM_DIATUR'),
        COALESCE(NULLIF(p_school->>'address', ''), '-'),
        COALESCE(NULLIF(p_school->>'city', ''), '-'),
        COALESCE(NULLIF(p_school->>'province', ''), '-'),
        COALESCE(p_school->>'phone', ''),
        COALESCE(p_school->>'email', ''),
        NULLIF(p_school->>'latitude', '')::DOUBLE PRECISION,
        NULLIF(p_school->>'longitude', '')::DOUBLE PRECISION,
        COALESCE(NULLIF(p_school->>'attendanceRadiusMeters', '')::INTEGER, 200)
    ) RETURNING * INTO v_school;

    IF v_user."role" <> 'SUPER_ADMIN' THEN
        UPDATE public.users SET "schoolId" = v_school_id WHERE "id" = auth.uid();
    END IF;

    RETURN NEXT v_school;
END;
$$;

CREATE OR REPLACE FUNCTION public.setup_new_tenant(
    p_school_name TEXT,
    p_npsn TEXT,
    p_full_name TEXT,
    p_start_year INTEGER,
    p_end_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
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

    IF p_npsn IS NULL OR length(trim(p_npsn)) < 8 THEN
        RAISE EXCEPTION 'NPSN wajib diisi minimal 8 karakter.';
    END IF;

    IF p_start_year IS NULL OR p_end_year IS NULL OR p_end_year <> p_start_year + 1 THEN
        RAISE EXCEPTION 'Tahun ajaran tidak valid.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.schools WHERE "npsn" = trim(p_npsn)) THEN
        RAISE EXCEPTION 'NPSN tersebut sudah terdaftar.';
    END IF;

    INSERT INTO public.schools ("name", "npsn", "level", "type", "address", "city", "province")
    VALUES (trim(p_school_name), trim(p_npsn), 'BELUM_DIATUR', 'BELUM_DIATUR', '-', '-', '-')
    RETURNING "id" INTO v_school_id;

    INSERT INTO public.academic_years ("schoolId", "name", "startYear", "endYear", "isActive")
    VALUES (v_school_id, p_start_year || '/' || p_end_year, p_start_year, p_end_year, true)
    RETURNING "id" INTO v_academic_year_id;

    RETURN jsonb_build_object(
        'success', true,
        'schoolId', v_school_id,
        'academicYearId', v_academic_year_id,
        'adminFullName', trim(COALESCE(p_full_name, 'Admin Sekolah')),
        'message', 'Sekolah dan tahun ajaran awal berhasil dibuat.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_school_for_current_user(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.setup_new_tenant(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_school_for_current_user(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_new_tenant(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- 11E. Pengaturan Izin Presensi Komputer (Per Guru & Saklar Global Sekolah)
CREATE OR REPLACE FUNCTION public.set_teacher_desktop_attendance(
    p_teacher_id UUID,
    p_allow BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_super BOOLEAN := public.is_super_admin();
    v_user_school UUID := public.get_user_school_id();
    v_roles TEXT[] := public.get_user_all_roles();
    v_target_school UUID;
BEGIN
    IF v_uid IS NULL OR NOT public.is_user_active() THEN
        RAISE EXCEPTION 'Sesi login tidak valid atau akun tidak aktif.';
    END IF;

    SELECT "schoolId" INTO v_target_school
    FROM public.teachers
    WHERE "id" = p_teacher_id;

    IF v_target_school IS NULL THEN
        RAISE EXCEPTION 'Data guru tidak ditemukan.';
    END IF;

    IF NOT v_is_super THEN
        IF v_target_school IS DISTINCT FROM v_user_school
           OR NOT (v_roles && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[])
        THEN
            RAISE EXCEPTION 'Anda tidak memiliki hak akses untuk mengubah izin presensi komputer.';
        END IF;
    END IF;

    UPDATE public.teachers
    SET "allowDesktopAttendance" = COALESCE(p_allow, false),
        "updatedAt" = now()
    WHERE "id" = p_teacher_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_school_desktop_attendance_global(
    p_school_id UUID,
    p_allow BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_super BOOLEAN := public.is_super_admin();
    v_user_school UUID := public.get_user_school_id();
    v_roles TEXT[] := public.get_user_all_roles();
BEGIN
    IF v_uid IS NULL OR NOT public.is_user_active() THEN
        RAISE EXCEPTION 'Sesi pengguna tidak valid atau akun tidak aktif.';
    END IF;

    IF NOT v_is_super THEN
        IF v_user_school IS DISTINCT FROM p_school_id
           OR NOT ('ADMIN' = ANY(v_roles))
        THEN
            RAISE EXCEPTION 'Anda tidak memiliki hak akses untuk mengubah pengaturan sekolah ini.';
        END IF;
    END IF;

    -- Simpan status saklar global pada profil sekolah
    UPDATE public.schools
    SET "allowDesktopAttendanceGlobal" = COALESCE(p_allow, false),
        "updatedAt" = now()
    WHERE "id" = p_school_id;

    -- Terapkan status yang sama ke seluruh Guru/PTK pada sekolah tersebut
    UPDATE public.teachers
    SET "allowDesktopAttendance" = COALESCE(p_allow, false),
        "updatedAt" = now()
    WHERE "schoolId" = p_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_desktop_attendance(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_school_desktop_attendance_global(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_desktop_attendance(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_desktop_attendance_global(UUID, BOOLEAN) TO authenticated;

-- 11F. Presensi GPS Guru (Anti Fake GPS, Validasi Jam Server, Radius, Selfie & Desktop Guard)
CREATE OR REPLACE FUNCTION public.submit_teacher_gps_attendance(
    p_mode TEXT,                                      -- 'CHECK_IN' atau 'CHECK_OUT'
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_selfie_path TEXT DEFAULT NULL,
    p_early_reason TEXT DEFAULT NULL,
    p_is_suspected_mock BOOLEAN DEFAULT false,
    p_security_flags TEXT[] DEFAULT '{}'::text[],
    p_device_telemetry JSONB DEFAULT '{}'::jsonb,
    p_sim_teacher_id UUID DEFAULT NULL,               -- Khusus simulasi SUPER_ADMIN
    p_sim_school_id UUID DEFAULT NULL                 -- Khusus simulasi SUPER_ADMIN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_super BOOLEAN := public.is_super_admin();
    v_school_id UUID;
    v_teacher RECORD;
    v_school RECORD;
    v_timezone TEXT;
    v_now_utc TIMESTAMPTZ := now();
    v_now_local TIMESTAMP;
    v_today DATE;
    v_distance DOUBLE PRECISION;
    v_existing RECORD;
    v_start_parts TEXT[];
    v_end_parts TEXT[];
    v_deadline TIMESTAMP;
    v_scheduled_end TIMESTAMP;
    v_latest_ontime TIMESTAMP;
    v_status TEXT;
    v_diff_mins INTEGER;
    v_notes TEXT;
    v_clean_reason TEXT := trim(COALESCE(p_early_reason, ''));
    v_flags TEXT[] := COALESCE(p_security_flags, '{}'::text[]);
    v_is_desktop_request BOOLEAN := false;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesi login tidak valid. Silakan masuk kembali.';
    END IF;

    IF p_mode NOT IN ('CHECK_IN', 'CHECK_OUT') THEN
        RAISE EXCEPTION 'Mode presensi tidak valid.';
    END IF;

    -- Validasi koordinat & akurasi GPS dasar
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
        RAISE EXCEPTION 'Koordinat GPS tidak valid.';
    END IF;

    IF p_accuracy IS NULL OR p_accuracy <= 1.0 THEN
        RAISE EXCEPTION 'Terdeteksi sinyal GPS tidak alami (akurasi <= 1m). Matikan aplikasi Fake GPS.';
    END IF;

    IF p_accuracy > 85.0 THEN
        RAISE EXCEPTION 'Akurasi GPS terlalu lemah (±% meter). Bergeser ke area terbuka agar sinyal satelit stabil.', round(p_accuracy);
    END IF;

    -- Tentukan sekolah & profil guru
    IF v_is_super AND p_sim_school_id IS NOT NULL AND p_sim_teacher_id IS NOT NULL THEN
        v_school_id := p_sim_school_id;
        SELECT * INTO v_teacher FROM public.teachers
        WHERE "id" = p_sim_teacher_id AND "schoolId" = v_school_id AND "isActive" = true;
    ELSE
        v_school_id := public.get_user_school_id();
        SELECT * INTO v_teacher FROM public.teachers
        WHERE "userId" = v_uid AND "schoolId" = v_school_id AND "isActive" = true
        LIMIT 1;
    END IF;

    IF v_teacher.id IS NULL THEN
        RAISE EXCEPTION 'Profil Guru/PTK Anda tidak ditemukan atau tidak aktif.';
    END IF;

    -- Validasi izin akses komputer di sisi server
    v_is_desktop_request := (v_flags @> ARRAY['DESKTOP_BROWSER']::text[])
        OR COALESCE(p_device_telemetry->>'deviceType', '') = 'DESKTOP';

    IF v_is_desktop_request AND NOT v_is_super AND NOT COALESCE(v_teacher."allowDesktopAttendance", false) THEN
        RAISE EXCEPTION 'Akun Anda tidak diizinkan melakukan presensi melalui komputer/laptop. Silakan gunakan HP atau APK Android.';
    END IF;

    -- Ambil pengaturan sekolah
    SELECT * INTO v_school FROM public.schools WHERE "id" = v_school_id;
    IF v_school.latitude IS NULL OR v_school.longitude IS NULL THEN
        RAISE EXCEPTION 'Titik koordinat sekolah belum diatur oleh Admin.';
    END IF;

    -- Hitung jarak geodesic di sisi server
    v_distance := public.calculate_haversine_meters(
        p_lat, p_lng, v_school.latitude, v_school.longitude
    );

    IF v_distance > COALESCE(v_school."attendanceRadiusMeters", 100) THEN
        RAISE EXCEPTION 'Posisi Anda berada di luar radius sekolah (% meter dari batas % meter).',
            round(v_distance), COALESCE(v_school."attendanceRadiusMeters", 100);
    END IF;

    -- Gunakan jam server sesuai zona waktu sekolah (anti manipulasi jam HP)
    v_timezone := COALESCE(NULLIF(v_school.settings->>'timezone', ''), 'Asia/Jakarta');
    v_now_local := v_now_utc AT TIME ZONE v_timezone;
    v_today := v_now_local::date;

    -- Kunci transaksi per guru & tanggal untuk mencegah double submit
    PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher.id::text || '|' || v_today::text, 0));

    SELECT * INTO v_existing
    FROM public.attendances
    WHERE "schoolId" = v_school_id
      AND "teacherId" = v_teacher.id
      AND "date" = v_today
      AND "type" = 'GURU'
    FOR UPDATE;

    -- ==================== PROSES CHECK-IN ====================
    IF p_mode = 'CHECK_IN' THEN
        IF v_existing.id IS NOT NULL THEN
            RAISE EXCEPTION 'Anda sudah memiliki catatan presensi hari ini (%).', v_existing.status;
        END IF;

        IF COALESCE(v_school."requireSelfieCheckIn", true) THEN
            IF p_selfie_path IS NULL OR trim(p_selfie_path) = '' THEN
                RAISE EXCEPTION 'Foto selfie wajib dilampirkan saat presensi datang.';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM storage.objects
                WHERE bucket_id = 'attendance-selfies' AND name = p_selfie_path
            ) THEN
                RAISE EXCEPTION 'Bukti foto selfie tidak ditemukan di server penyimpanan.';
            END IF;
        END IF;

        v_start_parts := string_to_array(COALESCE(v_school."workStartTime", '07:30'), ':');
        v_deadline := date_trunc('day', v_now_local)
            + make_interval(
                hours => COALESCE(v_start_parts[1]::int, 7),
                mins  => COALESCE(v_start_parts[2]::int, 30) + COALESCE(v_school."lateToleranceMinutes", 0),
                secs  => 59
            );

        v_status := CASE WHEN v_now_local > v_deadline THEN 'TERLAMBAT' ELSE 'HADIR' END;

        INSERT INTO public.attendances (
            "schoolId", "teacherId", "type", "date", "status",
            "checkInTime", "checkInLat", "checkInLng", "checkInDistance",
            "checkInAccuracy", "isCheckInMock", "checkInSelfieUrl",
            "securityFlags", "deviceTelemetry"
        ) VALUES (
            v_school_id, v_teacher.id, 'GURU', v_today, v_status,
            v_now_utc, p_lat, p_lng, round(v_distance),
            round(p_accuracy::numeric, 1), p_is_suspected_mock, p_selfie_path,
            v_flags, p_device_telemetry
        );

        RETURN jsonb_build_object(
            'success', true,
            'mode', 'CHECK_IN',
            'status', v_status,
            'distance', round(v_distance),
            'serverTime', to_char(v_now_local, 'HH24:MI:SS')
        );
    END IF;

    -- ==================== PROSES CHECK-OUT ====================
    IF v_existing.id IS NULL OR v_existing."checkInTime" IS NULL THEN
        RAISE EXCEPTION 'Anda belum melakukan Check-In masuk hari ini.';
    END IF;

    IF v_existing."checkOutTime" IS NOT NULL THEN
        RAISE EXCEPTION 'Anda sudah melakukan Check-Out pulang hari ini.';
    END IF;

    IF COALESCE(v_school."requireSelfieCheckOut", true) THEN
        IF p_selfie_path IS NULL OR trim(p_selfie_path) = '' THEN
            RAISE EXCEPTION 'Foto selfie wajib dilampirkan saat presensi pulang.';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'attendance-selfies' AND name = p_selfie_path
        ) THEN
            RAISE EXCEPTION 'Bukti foto selfie pulang tidak ditemukan di server penyimpanan.';
        END IF;
    END IF;

    v_end_parts := string_to_array(COALESCE(v_school."workEndTime", '14:30'), ':');
    v_scheduled_end := date_trunc('day', v_now_local)
        + make_interval(
            hours => COALESCE(v_end_parts[1]::int, 14),
            mins  => COALESCE(v_end_parts[2]::int, 30)
        );
    v_latest_ontime := v_scheduled_end + interval '30 minutes 59 seconds';

    v_notes := v_existing.notes;

    IF v_now_local < v_scheduled_end THEN
        IF length(v_clean_reason) < 10 THEN
            RAISE EXCEPTION 'Alasan pulang lebih awal wajib diisi minimal 10 karakter.';
        END IF;
        v_diff_mins := GREATEST(1, ceil(extract(epoch FROM (v_scheduled_end - v_now_local)) / 60.0)::int);
        v_notes := concat_ws(' | ', v_notes,
            format('[Pulang Lebih Awal] Pukul %s (jadwal %s, kurang %s menit) — Alasan: %s',
                to_char(v_now_local, 'HH24:MI'),
                COALESCE(v_school."workEndTime", '14:30'),
                v_diff_mins,
                v_clean_reason
            )
        );
    ELSIF v_now_local > v_latest_ontime THEN
        v_diff_mins := GREATEST(1, floor(extract(epoch FROM (v_now_local - v_scheduled_end)) / 60.0)::int);
        v_notes := concat_ws(' | ', v_notes,
            format('Pulang melewati jadwal pukul %s (jadwal %s, lewat %s menit)',
                to_char(v_now_local, 'HH24:MI'),
                COALESCE(v_school."workEndTime", '14:30'),
                v_diff_mins
            )
        );
    END IF;

    UPDATE public.attendances
    SET "checkOutTime"      = v_now_utc,
        "checkOutLat"       = p_lat,
        "checkOutLng"       = p_lng,
        "checkOutDistance"  = round(v_distance),
        "checkOutAccuracy"  = round(p_accuracy::numeric, 1),
        "isCheckOutMock"    = p_is_suspected_mock,
        "checkOutSelfieUrl" = COALESCE(p_selfie_path, "checkOutSelfieUrl"),
        "notes"             = v_notes,
        "securityFlags"     = ARRAY(SELECT DISTINCT unnest(COALESCE("securityFlags", '{}'::text[]) || v_flags)),
        "deviceTelemetry"   = COALESCE("deviceTelemetry", '{}'::jsonb) || jsonb_build_object('checkOut', p_device_telemetry)
    WHERE "id" = v_existing.id;

    RETURN jsonb_build_object(
        'success', true,
        'mode', 'CHECK_OUT',
        'distance', round(v_distance),
        'serverTime', to_char(v_now_local, 'HH24:MI:SS')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_teacher_gps_attendance(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, BOOLEAN, TEXT[], JSONB, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_teacher_gps_attendance(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, BOOLEAN, TEXT[], JSONB, UUID, UUID) TO authenticated;

-- 11G. Bulk Import Siswa Dapodik (UPSERT + Orang Tua + Kesejahteraan/PIP + Sanitasi)
CREATE OR REPLACE FUNCTION public.bulk_import_students(batch_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_school_id UUID;
    v_active_year_id UUID;
    student_record JSONB;
    parent_record JSONB;
    economic_record JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_entry_date DATE;
    v_is_inserted BOOLEAN;
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_index INTEGER := 0;
    v_clean_nis TEXT;
    v_clean_nisn TEXT;
    v_clean_nik TEXT;
    v_clean_gender TEXT;
    v_clean_religion TEXT;
    v_clean_status TEXT;
    v_has_kip BOOLEAN;
    v_raw_nama_kip TEXT;
    v_clean_nama_kip TEXT;
    v_has_kks BOOLEAN;
    v_clean_kks_number TEXT;
    v_orphan_type TEXT;
    v_is_orphan BOOLEAN;
    v_relation TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak valid. Silakan login kembali.';
    END IF;

    IF NOT (public.get_user_all_roles() && ARRAY['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU', 'KEPALA_SEKOLAH']::text[]) THEN
        RAISE EXCEPTION 'Role Anda tidak memiliki hak untuk melakukan impor siswa.';
    END IF;

    IF batch_data IS NULL OR jsonb_typeof(batch_data) <> 'array' THEN
        RAISE EXCEPTION 'Format data impor harus berupa JSON array.';
    END IF;

    IF jsonb_array_length(batch_data) = 0 THEN
        RETURN jsonb_build_object(
            'success', true, 'inserted', 0, 'updated', 0, 'count', 0,
            'message', 'Tidak ada data siswa untuk diimpor.'
        );
    END IF;

    IF public.is_super_admin() THEN
        IF NULLIF(trim(batch_data->0->>'schoolId'), '') IS NULL THEN
            RAISE EXCEPTION 'SUPER_ADMIN wajib menentukan schoolId pada setiap data impor.';
        END IF;
        v_school_id := (batch_data->0->>'schoolId')::UUID;
    ELSE
        v_school_id := public.get_user_school_id();
    END IF;

    IF v_school_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.schools WHERE "id" = v_school_id
    ) THEN
        RAISE EXCEPTION 'Identitas sekolah (schoolId) tidak ditemukan atau tidak valid.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_school_id::TEXT, 0));

    SELECT "id" INTO v_active_year_id
    FROM public.academic_years
    WHERE "schoolId" = v_school_id AND "isActive" = true
    LIMIT 1;

    FOR student_record IN SELECT value FROM jsonb_array_elements(batch_data)
    LOOP
        v_index := v_index + 1;

        IF public.is_super_admin() THEN
            IF NULLIF(trim(student_record->>'schoolId'), '') IS NULL THEN
                RAISE EXCEPTION 'schoolId wajib diisi pada baris ke-%', v_index;
            END IF;
            IF (student_record->>'schoolId')::UUID <> v_school_id THEN
                RAISE EXCEPTION 'Semua data dalam satu batch impor harus memiliki schoolId yang sama (baris ke-%).', v_index;
            END IF;
        END IF;

        v_clean_nis := public.clean_dapodik_str(student_record->>'nis');
        v_clean_nisn := public.clean_dapodik_str(student_record->>'nisn');
        v_clean_nik := public.clean_dapodik_str(student_record->>'nik');
        v_class_id := NULLIF(trim(student_record->>'classId'), '')::UUID;
        v_entry_date := NULLIF(trim(student_record->>'entryDate'), '')::DATE;

        IF v_clean_nisn IS NULL THEN
            RAISE EXCEPTION 'NISN wajib diisi pada baris ke-%', v_index;
        END IF;
        IF v_clean_nik IS NULL THEN
            RAISE EXCEPTION 'NIK wajib diisi pada baris ke-%', v_index;
        END IF;
        IF public.clean_dapodik_str(student_record->>'fullName') IS NULL THEN
            RAISE EXCEPTION 'Nama lengkap siswa wajib diisi pada baris ke-%', v_index;
        END IF;

        v_clean_gender := CASE
            WHEN upper(trim(COALESCE(student_record->>'gender', '')))
                 IN ('P', 'PEREMPUAN', 'WANITA') THEN 'P'
            WHEN upper(trim(COALESCE(student_record->>'gender', '')))
                 IN ('L', 'LAKI-LAKI', 'LAKILAKI', 'PRIA') THEN 'L'
            ELSE NULL
        END;

        IF v_clean_gender IS NULL THEN
            RAISE EXCEPTION 'Jenis kelamin tidak valid pada baris ke-%. Gunakan L atau P.', v_index;
        END IF;

        v_clean_religion := upper(public.clean_dapodik_str(student_record->>'religion'));
        IF v_clean_religion = 'KATHOLIK' THEN
            v_clean_religion := 'KATOLIK';
        END IF;

        v_clean_status := COALESCE(upper(public.clean_dapodik_str(student_record->>'status')), 'AKTIF');
        IF v_clean_status NOT IN ('AKTIF', 'MUTASI_KELUAR', 'LULUS', 'DO', 'CUTI') THEN
            v_clean_status := 'AKTIF';
        END IF;

        IF v_clean_nisn NOT LIKE 'TK-%'
           AND NOT EXISTS (
               SELECT 1 FROM public.students
               WHERE "schoolId" = v_school_id AND "nisn" = v_clean_nisn
           )
        THEN
            UPDATE public.students
            SET "nisn" = v_clean_nisn
            WHERE "id" = (
                SELECT "id" FROM public.students
                WHERE "schoolId" = v_school_id
                  AND (
                      (v_clean_nik NOT LIKE 'NONIK-%' AND "nik" = v_clean_nik)
                      OR (
                          "nisn" LIKE 'TK-%'
                          AND lower(trim("fullName")) = lower(trim(student_record->>'fullName'))
                          AND "birthDate" = COALESCE(NULLIF(trim(student_record->>'birthDate'), '')::DATE, CURRENT_DATE)
                      )
                  )
                ORDER BY "createdAt" ASC
                LIMIT 1
            );
        END IF;

        IF v_clean_nis IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.students
            WHERE "schoolId" = v_school_id
              AND "nis" = v_clean_nis
              AND "nisn" <> v_clean_nisn
        ) THEN
            v_clean_nis := NULL;
        END IF;

        IF v_clean_nik NOT LIKE 'NONIK-%' AND EXISTS (
            SELECT 1 FROM public.students
            WHERE "schoolId" = v_school_id
              AND "nik" = v_clean_nik
              AND "nisn" <> v_clean_nisn
        ) THEN
            v_clean_nik := 'NONIK-' || upper(substr(md5(v_school_id::text || '|' || v_clean_nisn), 1, 8));
        END IF;

        INSERT INTO public.students (
            "schoolId", "nis", "nisn", "nik", "noKk",
            "fullName", "nickname", "gender", "birthDate", "birthPlace",
            "religion", "address", "rt", "rw", "dusun", "kelurahan", "kecamatan",
            "city", "province", "postalCode", "telepon", "phone", "email",
            "photoUrl", "status", "entryDate", "classId",
            "skhun", "noPesertaUn", "noIjazah", "noAktaLahir",
            "anakKe", "jmlSaudara", "lintang", "bujur",
            "beratBadan", "tinggiBadan", "lingkarKepala", "jarakSekolah",
            "jenisTinggal", "alatTransportasi", "kebutuhanKhusus", "sekolahAsal",
            "bank", "noRekening", "namaRekening"
        )
        VALUES (
            v_school_id, v_clean_nis, v_clean_nisn, v_clean_nik,
            public.clean_dapodik_str(student_record->>'noKk'),
            trim(student_record->>'fullName'),
            public.clean_dapodik_str(student_record->>'nickname'),
            v_clean_gender,
            COALESCE(NULLIF(trim(student_record->>'birthDate'), '')::DATE, CURRENT_DATE),
            COALESCE(public.clean_dapodik_str(student_record->>'birthPlace'), '-'),
            v_clean_religion,
            COALESCE(public.clean_dapodik_str(student_record->>'address'), '-'),
            public.clean_dapodik_str(student_record->>'rt'),
            public.clean_dapodik_str(student_record->>'rw'),
            public.clean_dapodik_str(student_record->>'dusun'),
            COALESCE(public.clean_dapodik_str(student_record->>'kelurahan'), public.clean_dapodik_str(student_record->>'village')),
            COALESCE(public.clean_dapodik_str(student_record->>'kecamatan'), public.clean_dapodik_str(student_record->>'district')),
            COALESCE(public.clean_dapodik_str(student_record->>'city'), '-'),
            COALESCE(public.clean_dapodik_str(student_record->>'province'), '-'),
            public.clean_dapodik_str(student_record->>'postalCode'),
            public.clean_dapodik_str(student_record->>'telepon'),
            public.clean_dapodik_str(student_record->>'phone'),
            public.clean_dapodik_str(student_record->>'email'),
            public.clean_dapodik_str(student_record->>'photoUrl'),
            v_clean_status,
            COALESCE(v_entry_date, CURRENT_DATE),
            v_class_id,
            public.clean_dapodik_str(student_record->>'skhun'),
            public.clean_dapodik_str(student_record->>'noPesertaUn'),
            public.clean_dapodik_str(student_record->>'noIjazah'),
            public.clean_dapodik_str(student_record->>'noAktaLahir'),
            NULLIF(trim(student_record->>'anakKe'), '')::INTEGER,
            NULLIF(trim(student_record->>'jmlSaudara'), '')::INTEGER,
            public.clean_dapodik_str(student_record->>'lintang'),
            public.clean_dapodik_str(student_record->>'bujur'),
            NULLIF(trim(student_record->>'beratBadan'), '')::NUMERIC(8,2),
            NULLIF(trim(student_record->>'tinggiBadan'), '')::NUMERIC(8,2),
            NULLIF(trim(student_record->>'lingkarKepala'), '')::NUMERIC(8,2),
            NULLIF(trim(student_record->>'jarakSekolah'), '')::NUMERIC(10,2),
            public.clean_dapodik_str(student_record->>'jenisTinggal'),
            public.clean_dapodik_str(student_record->>'alatTransportasi'),
            public.clean_dapodik_str(student_record->>'kebutuhanKhusus'),
            public.clean_dapodik_str(student_record->>'sekolahAsal'),
            public.clean_dapodik_str(student_record->>'bank'),
            public.clean_dapodik_str(student_record->>'noRekening'),
            public.clean_dapodik_str(student_record->>'namaRekening')
        )
        ON CONFLICT ("schoolId", "nisn") DO UPDATE SET
            "nis"              = COALESCE(EXCLUDED."nis", public.students."nis"),
            "nik"              = CASE WHEN EXCLUDED."nik" LIKE 'NONIK-%' THEN public.students."nik" ELSE EXCLUDED."nik" END,
            "noKk"             = COALESCE(EXCLUDED."noKk", public.students."noKk"),
            "fullName"         = EXCLUDED."fullName",
            "nickname"         = COALESCE(EXCLUDED."nickname", public.students."nickname"),
            "gender"           = EXCLUDED."gender",
            "birthDate"        = EXCLUDED."birthDate",
            "birthPlace"       = CASE WHEN EXCLUDED."birthPlace" = '-' THEN public.students."birthPlace" ELSE EXCLUDED."birthPlace" END,
            "religion"         = COALESCE(EXCLUDED."religion", public.students."religion"),
            "address"          = CASE WHEN EXCLUDED."address" = '-' THEN public.students."address" ELSE EXCLUDED."address" END,
            "rt"               = COALESCE(EXCLUDED."rt", public.students."rt"),
            "rw"               = COALESCE(EXCLUDED."rw", public.students."rw"),
            "dusun"            = COALESCE(EXCLUDED."dusun", public.students."dusun"),
            "kelurahan"        = COALESCE(EXCLUDED."kelurahan", public.students."kelurahan"),
            "kecamatan"        = COALESCE(EXCLUDED."kecamatan", public.students."kecamatan"),
            "city"             = CASE WHEN EXCLUDED."city" = '-' THEN public.students."city" ELSE EXCLUDED."city" END,
            "province"         = CASE WHEN EXCLUDED."province" = '-' THEN public.students."province" ELSE EXCLUDED."province" END,
            "postalCode"       = COALESCE(EXCLUDED."postalCode", public.students."postalCode"),
            "telepon"          = COALESCE(EXCLUDED."telepon", public.students."telepon"),
            "phone"            = COALESCE(EXCLUDED."phone", public.students."phone"),
            "email"            = COALESCE(EXCLUDED."email", public.students."email"),
            "photoUrl"         = COALESCE(EXCLUDED."photoUrl", public.students."photoUrl"),
            "status"           = EXCLUDED."status",
            "entryDate"        = COALESCE(v_entry_date, public.students."entryDate"),
            "classId"          = COALESCE(EXCLUDED."classId", public.students."classId"),
            "skhun"            = COALESCE(EXCLUDED."skhun", public.students."skhun"),
            "noPesertaUn"      = COALESCE(EXCLUDED."noPesertaUn", public.students."noPesertaUn"),
            "noIjazah"         = COALESCE(EXCLUDED."noIjazah", public.students."noIjazah"),
            "noAktaLahir"      = COALESCE(EXCLUDED."noAktaLahir", public.students."noAktaLahir"),
            "anakKe"           = COALESCE(EXCLUDED."anakKe", public.students."anakKe"),
            "jmlSaudara"       = COALESCE(EXCLUDED."jmlSaudara", public.students."jmlSaudara"),
            "lintang"          = COALESCE(EXCLUDED."lintang", public.students."lintang"),
            "bujur"            = COALESCE(EXCLUDED."bujur", public.students."bujur"),
            "beratBadan"       = COALESCE(EXCLUDED."beratBadan", public.students."beratBadan"),
            "tinggiBadan"      = COALESCE(EXCLUDED."tinggiBadan", public.students."tinggiBadan"),
            "lingkarKepala"    = COALESCE(EXCLUDED."lingkarKepala", public.students."lingkarKepala"),
            "jarakSekolah"     = COALESCE(EXCLUDED."jarakSekolah", public.students."jarakSekolah"),
            "jenisTinggal"     = COALESCE(EXCLUDED."jenisTinggal", public.students."jenisTinggal"),
            "alatTransportasi" = COALESCE(EXCLUDED."alatTransportasi", public.students."alatTransportasi"),
            "kebutuhanKhusus"  = COALESCE(EXCLUDED."kebutuhanKhusus", public.students."kebutuhanKhusus"),
            "sekolahAsal"      = COALESCE(EXCLUDED."sekolahAsal", public.students."sekolahAsal"),
            "bank"             = COALESCE(EXCLUDED."bank", public.students."bank"),
            "noRekening"       = COALESCE(EXCLUDED."noRekening", public.students."noRekening"),
            "namaRekening"     = COALESCE(EXCLUDED."namaRekening", public.students."namaRekening"),
            "updatedAt"        = now()
        RETURNING "id", (xmax = 0) AS is_inserted
        INTO v_student_id, v_is_inserted;

        IF v_is_inserted THEN
            v_inserted_count := v_inserted_count + 1;
        ELSE
            v_updated_count := v_updated_count + 1;
        END IF;

        IF v_active_year_id IS NOT NULL AND v_class_id IS NOT NULL THEN
            INSERT INTO public.student_class_history ("schoolId", "studentId", "academicYearId", "classId")
            VALUES (v_school_id, v_student_id, v_active_year_id, v_class_id)
            ON CONFLICT ("studentId", "academicYearId") DO UPDATE SET
                "classId" = EXCLUDED."classId";
        END IF;

        IF student_record ? 'parents'
           AND jsonb_typeof(student_record->'parents') = 'array'
           AND jsonb_array_length(student_record->'parents') > 0
        THEN
            FOR parent_record IN SELECT value FROM jsonb_array_elements(student_record->'parents')
            LOOP
                IF public.clean_dapodik_str(parent_record->>'fullName') IS NOT NULL THEN
                    v_relation := COALESCE(upper(public.clean_dapodik_str(parent_record->>'relation')), 'WALI');
                    IF v_relation NOT IN ('AYAH', 'IBU', 'WALI') THEN
                        v_relation := 'WALI';
                    END IF;

                    INSERT INTO public.student_parents (
                        "schoolId", "studentId", "relation", "fullName", "nik",
                        "birthYear", "phone", "email", "education", "occupation",
                        "monthlyIncome", "isAlive", "address"
                    )
                    VALUES (
                        v_school_id, v_student_id, v_relation,
                        trim(parent_record->>'fullName'),
                        public.clean_dapodik_str(parent_record->>'nik'),
                        public.clean_dapodik_str(parent_record->>'birthYear'),
                        public.clean_dapodik_str(parent_record->>'phone'),
                        public.clean_dapodik_str(parent_record->>'email'),
                        public.clean_dapodik_str(parent_record->>'education'),
                        COALESCE(public.clean_dapodik_str(parent_record->>'occupation'), public.clean_dapodik_str(parent_record->>'job')),
                        COALESCE(public.clean_dapodik_str(parent_record->>'monthlyIncome'), public.clean_dapodik_str(parent_record->>'income')),
                        public.parse_dapodik_bool(parent_record->>'isAlive', true),
                        public.clean_dapodik_str(parent_record->>'address')
                    )
                    ON CONFLICT ("studentId", "relation") DO UPDATE SET
                        "fullName"      = EXCLUDED."fullName",
                        "nik"           = COALESCE(EXCLUDED."nik", public.student_parents."nik"),
                        "birthYear"     = COALESCE(EXCLUDED."birthYear", public.student_parents."birthYear"),
                        "phone"         = COALESCE(EXCLUDED."phone", public.student_parents."phone"),
                        "email"         = COALESCE(EXCLUDED."email", public.student_parents."email"),
                        "education"     = COALESCE(EXCLUDED."education", public.student_parents."education"),
                        "occupation"    = COALESCE(EXCLUDED."occupation", public.student_parents."occupation"),
                        "monthlyIncome" = COALESCE(EXCLUDED."monthlyIncome", public.student_parents."monthlyIncome"),
                        "isAlive"       = EXCLUDED."isAlive",
                        "address"       = COALESCE(EXCLUDED."address", public.student_parents."address"),
                        "updatedAt"     = now();
                END IF;
            END LOOP;
        END IF;

        IF student_record ? 'economic' AND jsonb_typeof(student_record->'economic') = 'object' THEN
            economic_record := student_record->'economic';
            v_has_kip := public.parse_dapodik_bool(economic_record->>'hasKip', false)
                         OR public.clean_dapodik_str(economic_record->>'kipNumber') IS NOT NULL;

            v_raw_nama_kip := public.clean_dapodik_str(economic_record->>'namaKip');
            v_clean_nama_kip := CASE
                WHEN v_raw_nama_kip IS NULL OR lower(v_raw_nama_kip) IN ('0', '1', 'ya', 'tidak') THEN NULL
                ELSE v_raw_nama_kip
            END;

            v_clean_kks_number := public.clean_dapodik_str(economic_record->>'kksNumber');
            v_has_kks := public.parse_dapodik_bool(economic_record->>'hasKks', false)
                         OR v_clean_kks_number IS NOT NULL;

            v_orphan_type := upper(public.clean_dapodik_str(economic_record->>'orphanType'));
            IF v_orphan_type NOT IN ('YATIM', 'PIATU', 'YATIM_PIATU', 'BUKAN') THEN
                v_orphan_type := NULL;
            END IF;

            v_is_orphan := COALESCE(
                public.parse_dapodik_bool(economic_record->>'isOrphan', false)
                OR COALESCE(v_orphan_type IN ('YATIM', 'PIATU', 'YATIM_PIATU'), false),
                false
            );

            INSERT INTO public.student_economics (
                "schoolId", "studentId", "hasKip", "kipNumber", "namaKip",
                "layakPip", "alasanLayakPip", "hasKks", "kksNumber",
                "hasPkh", "isDtks", "houseOwnership", "houseCondition",
                "dependentsCount", "isOrphan", "orphanType",
                "pipScore", "economicCategory", "scoringDetails", "desil", "scoredAt"
            )
            VALUES (
                v_school_id, v_student_id, v_has_kip,
                CASE WHEN v_has_kip THEN public.clean_dapodik_str(economic_record->>'kipNumber') ELSE NULL END,
                CASE WHEN v_has_kip THEN v_clean_nama_kip ELSE NULL END,
                public.parse_dapodik_bool(economic_record->>'layakPip', false),
                public.clean_dapodik_str(economic_record->>'alasanLayakPip'),
                v_has_kks,
                CASE WHEN v_has_kks THEN v_clean_kks_number ELSE NULL END,
                public.parse_dapodik_bool(economic_record->>'hasPkh', false),
                public.parse_dapodik_bool(economic_record->>'isDtks', false),
                public.clean_dapodik_str(economic_record->>'houseOwnership'),
                public.clean_dapodik_str(economic_record->>'houseCondition'),
                NULLIF(trim(economic_record->>'dependentsCount'), '')::INTEGER,
                v_is_orphan, v_orphan_type,
                NULLIF(trim(economic_record->>'pipScore'), '')::NUMERIC(8,2),
                public.clean_dapodik_str(economic_record->>'economicCategory'),
                CASE
                    WHEN economic_record ? 'scoringDetails' AND jsonb_typeof(economic_record->'scoringDetails') = 'object'
                    THEN economic_record->'scoringDetails'
                    ELSE NULL
                END,
                NULLIF(trim(economic_record->>'desil'), '')::INTEGER,
                NULLIF(trim(economic_record->>'scoredAt'), '')::TIMESTAMPTZ
            )
            ON CONFLICT ("studentId") DO UPDATE SET
                "hasKip"           = EXCLUDED."hasKip",
                "kipNumber"        = CASE WHEN EXCLUDED."hasKip" = false THEN NULL ELSE COALESCE(EXCLUDED."kipNumber", public.student_economics."kipNumber") END,
                "namaKip"          = CASE WHEN EXCLUDED."hasKip" = false THEN NULL ELSE COALESCE(EXCLUDED."namaKip", public.student_economics."namaKip") END,
                "layakPip"         = EXCLUDED."layakPip",
                "alasanLayakPip"   = COALESCE(EXCLUDED."alasanLayakPip", public.student_economics."alasanLayakPip"),
                "hasKks"           = EXCLUDED."hasKks",
                "kksNumber"        = CASE WHEN EXCLUDED."hasKks" = false THEN NULL ELSE COALESCE(EXCLUDED."kksNumber", public.student_economics."kksNumber") END,
                "hasPkh"           = EXCLUDED."hasPkh",
                "isDtks"           = EXCLUDED."isDtks",
                "houseOwnership"   = COALESCE(EXCLUDED."houseOwnership", public.student_economics."houseOwnership"),
                "houseCondition"   = COALESCE(EXCLUDED."houseCondition", public.student_economics."houseCondition"),
                "dependentsCount"  = COALESCE(EXCLUDED."dependentsCount", public.student_economics."dependentsCount"),
                "isOrphan"         = COALESCE(EXCLUDED."isOrphan", false) OR COALESCE(public.student_economics."isOrphan", false),
                "orphanType"       = COALESCE(EXCLUDED."orphanType", public.student_economics."orphanType"),
                "pipScore"         = COALESCE(EXCLUDED."pipScore", public.student_economics."pipScore"),
                "economicCategory" = COALESCE(EXCLUDED."economicCategory", public.student_economics."economicCategory"),
                "scoringDetails"   = COALESCE(EXCLUDED."scoringDetails", public.student_economics."scoringDetails"),
                "desil"            = COALESCE(EXCLUDED."desil", public.student_economics."desil"),
                "scoredAt"         = COALESCE(EXCLUDED."scoredAt", public.student_economics."scoredAt"),
                "updatedAt"        = now();
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'inserted', v_inserted_count,
        'updated', v_updated_count,
        'count', v_inserted_count + v_updated_count,
        'message', v_inserted_count || ' siswa baru ditambahkan, ' || v_updated_count || ' siswa diperbarui.'
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Impor gagal pada baris ke-%: %', v_index, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_students(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_students(JSONB) TO authenticated;

-- 11H. Bulk Import Guru & PTK Dapodik (UPSERT + Kolom Dapodik Lengkap + Sanitasi '-')
CREATE OR REPLACE FUNCTION public.bulk_import_teachers(batch_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_school_id UUID;
    teacher_record JSONB;
    v_existing_id UUID;
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_index INTEGER := 0;

    v_full_name TEXT;
    v_gender TEXT;
    v_nip TEXT;
    v_nuptk TEXT;
    v_nik TEXT;
    v_no_kk TEXT;
    v_birth_place TEXT;
    v_birth_date DATE;
    v_religion TEXT;
    v_address TEXT;
    v_dusun TEXT;
    v_rt TEXT;
    v_rw TEXT;
    v_kelurahan TEXT;
    v_kecamatan TEXT;
    v_city TEXT;
    v_province TEXT;
    v_postal_code TEXT;
    v_telepon TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_education TEXT;
    v_major TEXT;
    v_university TEXT;
    v_status TEXT;
    v_position TEXT;
    v_is_certified BOOLEAN;
    v_certification_number TEXT;
    v_join_date DATE;
    v_is_active BOOLEAN;
    v_base_salary NUMERIC(15,2);
    v_subjects TEXT;
    v_max_hours INTEGER;
    v_tugas_tambahan TEXT;
    v_sk_cpns TEXT;
    v_tanggal_cpns DATE;
    v_sk_pengangkatan TEXT;
    v_tmt_pengangkatan DATE;
    v_lembaga_pengangkatan TEXT;
    v_pangkat_golongan TEXT;
    v_sumber_gaji TEXT;
    v_tmt_pns DATE;
    v_karpeg TEXT;
    v_nama_ibu_kandung TEXT;
    v_status_perkawinan TEXT;
    v_nama_suami_istri TEXT;
    v_nip_suami_istri TEXT;
    v_pekerjaan_suami_istri TEXT;
    v_karis_karsu TEXT;
    v_kewarganegaraan TEXT;
    v_npwp TEXT;
    v_nama_wajib_pajak TEXT;
    v_bank TEXT;
    v_no_rekening TEXT;
    v_rekening_atas_nama TEXT;
    v_lintang TEXT;
    v_bujur TEXT;
    v_nuks TEXT;
    v_lisensi_kepsek BOOLEAN;
    v_diklat_pengawas BOOLEAN;
    v_braille BOOLEAN;
    v_bahasa_isyarat BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak valid. Silakan login kembali.';
    END IF;

    IF NOT (public.get_user_all_roles() && ARRAY['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU', 'KEPALA_SEKOLAH']::text[]) THEN
        RAISE EXCEPTION 'Role Anda tidak memiliki hak untuk melakukan impor data guru.';
    END IF;

    IF batch_data IS NULL OR jsonb_typeof(batch_data) <> 'array' THEN
        RAISE EXCEPTION 'Format data impor harus berupa JSON array.';
    END IF;

    IF jsonb_array_length(batch_data) = 0 THEN
        RETURN jsonb_build_object(
            'success', true, 'inserted', 0, 'updated', 0, 'count', 0,
            'message', 'Tidak ada data guru untuk diimpor.'
        );
    END IF;

    IF public.is_super_admin() THEN
        IF NULLIF(trim(batch_data->0->>'schoolId'), '') IS NULL THEN
            RAISE EXCEPTION 'SUPER_ADMIN wajib menentukan schoolId pada setiap data impor.';
        END IF;
        v_school_id := (batch_data->0->>'schoolId')::UUID;
    ELSE
        v_school_id := public.get_user_school_id();
    END IF;

    IF v_school_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.schools WHERE "id" = v_school_id
    ) THEN
        RAISE EXCEPTION 'Identitas sekolah (schoolId) tidak ditemukan atau tidak valid.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_school_id::TEXT, 0));

    FOR teacher_record IN SELECT value FROM jsonb_array_elements(batch_data)
    LOOP
        v_index := v_index + 1;

        IF public.is_super_admin() THEN
            IF NULLIF(trim(teacher_record->>'schoolId'), '') IS NULL THEN
                RAISE EXCEPTION 'schoolId wajib diisi pada baris ke-%', v_index;
            END IF;
            IF (teacher_record->>'schoolId')::UUID <> v_school_id THEN
                RAISE EXCEPTION 'Semua data dalam satu batch impor harus memiliki schoolId yang sama (baris ke-%).', v_index;
            END IF;
        END IF;

        v_full_name := public.clean_dapodik_str(teacher_record->>'fullName');
        IF v_full_name IS NULL THEN
            RAISE EXCEPTION 'Nama lengkap guru wajib diisi pada baris ke-%', v_index;
        END IF;

        v_gender := CASE
            WHEN upper(trim(COALESCE(teacher_record->>'gender', '')))
                 IN ('P', 'PEREMPUAN', 'WANITA') THEN 'P'
            WHEN upper(trim(COALESCE(teacher_record->>'gender', '')))
                 IN ('L', 'LAKI-LAKI', 'LAKILAKI', 'PRIA') THEN 'L'
            ELSE NULL
        END;

        IF v_gender IS NULL THEN
            RAISE EXCEPTION 'Jenis kelamin tidak valid pada baris ke-%. Gunakan L atau P.', v_index;
        END IF;

        v_nip := public.clean_dapodik_str(teacher_record->>'nip');
        v_nuptk := public.clean_dapodik_str(teacher_record->>'nuptk');
        v_nik := public.clean_dapodik_str(teacher_record->>'nik');
        v_no_kk := public.clean_dapodik_str(teacher_record->>'noKk');
        v_birth_place := public.clean_dapodik_str(teacher_record->>'birthPlace');
        v_birth_date := NULLIF(trim(teacher_record->>'birthDate'), '')::DATE;

        v_religion := upper(public.clean_dapodik_str(teacher_record->>'religion'));
        IF v_religion = 'KATHOLIK' THEN
            v_religion := 'KATOLIK';
        END IF;

        v_address := public.clean_dapodik_str(teacher_record->>'address');
        v_dusun := public.clean_dapodik_str(teacher_record->>'dusun');
        v_rt := public.clean_dapodik_str(teacher_record->>'rt');
        v_rw := public.clean_dapodik_str(teacher_record->>'rw');
        v_kelurahan := public.clean_dapodik_str(teacher_record->>'kelurahan');
        v_kecamatan := public.clean_dapodik_str(teacher_record->>'kecamatan');
        v_city := public.clean_dapodik_str(teacher_record->>'city');
        v_province := public.clean_dapodik_str(teacher_record->>'province');
        v_postal_code := public.clean_dapodik_str(teacher_record->>'postalCode');
        v_telepon := public.clean_dapodik_str(teacher_record->>'telepon');
        IF v_telepon = '0' THEN
            v_telepon := NULL;
        END IF;
        v_phone := public.clean_dapodik_str(teacher_record->>'phone');
        v_email := public.clean_dapodik_str(teacher_record->>'email');

        v_education := public.clean_dapodik_str(teacher_record->>'education');
        v_major := public.clean_dapodik_str(teacher_record->>'major');
        v_university := public.clean_dapodik_str(teacher_record->>'university');

        v_status := COALESCE(upper(public.clean_dapodik_str(teacher_record->>'status')), 'HONORER');
        v_position := COALESCE(public.clean_dapodik_str(teacher_record->>'position'), 'Guru');
        v_is_certified := public.parse_dapodik_bool(teacher_record->>'isCertified', false);
        v_certification_number := public.clean_dapodik_str(teacher_record->>'certificationNumber');
        v_join_date := NULLIF(trim(teacher_record->>'joinDate'), '')::DATE;
        v_is_active := public.parse_dapodik_bool(teacher_record->>'isActive', true);
        v_base_salary := NULLIF(trim(teacher_record->>'baseSalary'), '')::NUMERIC(15,2);
        v_subjects := public.clean_dapodik_str(teacher_record->>'subjects');

        v_max_hours := NULLIF(trim(teacher_record->>'maxHoursPerWeek'), '')::INTEGER;
        IF v_max_hours IS NULL OR v_max_hours <= 0 THEN
            v_max_hours := 24;
        END IF;

        v_tugas_tambahan := public.clean_dapodik_str(teacher_record->>'tugasTambahan');

        v_sk_cpns := public.clean_dapodik_str(teacher_record->>'skCpns');
        v_tanggal_cpns := NULLIF(trim(teacher_record->>'tanggalCpns'), '')::DATE;
        v_sk_pengangkatan := public.clean_dapodik_str(teacher_record->>'skPengangkatan');
        v_tmt_pengangkatan := NULLIF(trim(teacher_record->>'tmtPengangkatan'), '')::DATE;
        v_lembaga_pengangkatan := public.clean_dapodik_str(teacher_record->>'lembagaPengangkatan');
        IF lower(COALESCE(v_lembaga_pengangkatan, '')) = '(tidak diisi)' THEN
            v_lembaga_pengangkatan := NULL;
        END IF;

        v_pangkat_golongan := public.clean_dapodik_str(teacher_record->>'pangkatGolongan');
        v_sumber_gaji := public.clean_dapodik_str(teacher_record->>'sumberGaji');
        v_tmt_pns := NULLIF(trim(teacher_record->>'tmtPns'), '')::DATE;
        v_karpeg := public.clean_dapodik_str(teacher_record->>'karpeg');

        v_nama_ibu_kandung := public.clean_dapodik_str(teacher_record->>'namaIbuKandung');
        v_status_perkawinan := public.clean_dapodik_str(teacher_record->>'statusPerkawinan');
        v_nama_suami_istri := public.clean_dapodik_str(teacher_record->>'namaSuamiIstri');
        v_nip_suami_istri := public.clean_dapodik_str(teacher_record->>'nipSuamiIstri');
        v_pekerjaan_suami_istri := public.clean_dapodik_str(teacher_record->>'pekerjaanSuamiIstri');
        v_karis_karsu := public.clean_dapodik_str(teacher_record->>'karisKarsu');

        v_kewarganegaraan := public.clean_dapodik_str(teacher_record->>'kewarganegaraan');
        IF upper(COALESCE(v_kewarganegaraan, '')) = 'ID' THEN
            v_kewarganegaraan := 'Indonesia';
        END IF;

        v_npwp := public.clean_dapodik_str(teacher_record->>'npwp');
        v_nama_wajib_pajak := public.clean_dapodik_str(teacher_record->>'namaWajibPajak');
        v_bank := public.clean_dapodik_str(teacher_record->>'bank');
        v_no_rekening := public.clean_dapodik_str(teacher_record->>'nomorRekeningBank');
        v_rekening_atas_nama := public.clean_dapodik_str(teacher_record->>'rekeningAtasNama');
        v_lintang := public.clean_dapodik_str(teacher_record->>'lintang');
        v_bujur := public.clean_dapodik_str(teacher_record->>'bujur');
        v_nuks := public.clean_dapodik_str(teacher_record->>'nuks');

        v_lisensi_kepsek := public.parse_dapodik_bool(teacher_record->>'sudahLisensiKepalaSekolah', false);
        v_diklat_pengawas := public.parse_dapodik_bool(teacher_record->>'pernahDiklatKepengawasan', false);
        v_braille := public.parse_dapodik_bool(teacher_record->>'keahlianBraille', false);
        v_bahasa_isyarat := public.parse_dapodik_bool(teacher_record->>'keahlianBahasaIsyarat', false);

        v_existing_id := NULL;

        IF NULLIF(trim(teacher_record->>'id'), '') IS NOT NULL THEN
            SELECT "id" INTO v_existing_id
            FROM public.teachers
            WHERE "schoolId" = v_school_id
              AND "id" = NULLIF(trim(teacher_record->>'id'), '')::UUID
            LIMIT 1;
        END IF;

        IF v_existing_id IS NULL AND v_nip IS NOT NULL THEN
            SELECT "id" INTO v_existing_id
            FROM public.teachers
            WHERE "schoolId" = v_school_id AND "nip" = v_nip
            LIMIT 1;
        END IF;

        IF v_existing_id IS NULL AND v_nuptk IS NOT NULL THEN
            SELECT "id" INTO v_existing_id
            FROM public.teachers
            WHERE "schoolId" = v_school_id AND "nuptk" = v_nuptk
            LIMIT 1;
        END IF;

        IF v_existing_id IS NULL AND v_nik IS NOT NULL THEN
            SELECT "id" INTO v_existing_id
            FROM public.teachers
            WHERE "schoolId" = v_school_id AND "nik" = v_nik
            LIMIT 1;
        END IF;

        IF v_existing_id IS NULL AND v_birth_date IS NOT NULL THEN
            SELECT "id" INTO v_existing_id
            FROM public.teachers
            WHERE "schoolId" = v_school_id
              AND lower(trim("fullName")) = lower(v_full_name)
              AND "birthDate" = v_birth_date
            LIMIT 1;
        END IF;

        IF v_nip IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.teachers
            WHERE "schoolId" = v_school_id
              AND "nip" = v_nip
              AND ("id" IS DISTINCT FROM v_existing_id)
        ) THEN
            RAISE EXCEPTION 'NIP % (%) sudah digunakan oleh guru lain di sekolah ini.', v_nip, v_full_name;
        END IF;

        IF v_nuptk IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.teachers
            WHERE "schoolId" = v_school_id
              AND "nuptk" = v_nuptk
              AND ("id" IS DISTINCT FROM v_existing_id)
        ) THEN
            RAISE EXCEPTION 'NUPTK % (%) sudah digunakan oleh guru lain di sekolah ini.', v_nuptk, v_full_name;
        END IF;

        IF v_nik IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.teachers
            WHERE "schoolId" = v_school_id
              AND "nik" = v_nik
              AND ("id" IS DISTINCT FROM v_existing_id)
        ) THEN
            RAISE EXCEPTION 'NIK % (%) sudah digunakan oleh guru lain di sekolah ini.', v_nik, v_full_name;
        END IF;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.teachers SET
                "fullName"                  = v_full_name,
                "gender"                    = v_gender,
                "nip"                       = COALESCE(v_nip, "nip"),
                "nuptk"                     = COALESCE(v_nuptk, "nuptk"),
                "nik"                       = COALESCE(v_nik, "nik"),
                "noKk"                      = COALESCE(v_no_kk, "noKk"),
                "birthPlace"                = COALESCE(v_birth_place, "birthPlace"),
                "birthDate"                 = COALESCE(v_birth_date, "birthDate"),
                "religion"                  = COALESCE(v_religion, "religion"),
                "address"                   = COALESCE(v_address, "address"),
                "dusun"                     = COALESCE(v_dusun, "dusun"),
                "rt"                        = COALESCE(v_rt, "rt"),
                "rw"                        = COALESCE(v_rw, "rw"),
                "kelurahan"                 = COALESCE(v_kelurahan, "kelurahan"),
                "kecamatan"                 = COALESCE(v_kecamatan, "kecamatan"),
                "city"                      = COALESCE(v_city, "city"),
                "province"                  = COALESCE(v_province, "province"),
                "postalCode"                = COALESCE(v_postal_code, "postalCode"),
                "telepon"                   = COALESCE(v_telepon, "telepon"),
                "phone"                     = COALESCE(v_phone, "phone"),
                "email"                     = COALESCE(v_email, "email"),
                "education"                 = COALESCE(v_education, "education"),
                "major"                     = COALESCE(v_major, "major"),
                "university"                = COALESCE(v_university, "university"),
                "status"                    = COALESCE(v_status, "status"),
                "position"                  = COALESCE(v_position, "position"),
                "isCertified"               = public.parse_dapodik_bool(teacher_record->>'isCertified', "isCertified"),
                "certificationNumber"       = COALESCE(v_certification_number, "certificationNumber"),
                "joinDate"                  = COALESCE(v_join_date, "joinDate"),
                "isActive"                  = public.parse_dapodik_bool(teacher_record->>'isActive', "isActive"),
                "baseSalary"                = COALESCE(v_base_salary, "baseSalary"),
                "subjects"                  = COALESCE(v_subjects, "subjects"),
                "maxHoursPerWeek"           = COALESCE(
                    CASE
                        WHEN NULLIF(trim(teacher_record->>'maxHoursPerWeek'), '')::INTEGER > 0
                        THEN NULLIF(trim(teacher_record->>'maxHoursPerWeek'), '')::INTEGER
                        ELSE NULL
                    END,
                    "maxHoursPerWeek"
                ),
                "tugasTambahan"             = CASE
                    WHEN teacher_record ? 'tugasTambahan'
                    THEN public.clean_dapodik_str(teacher_record->>'tugasTambahan')
                    ELSE "tugasTambahan"
                END,
                "skCpns"                    = COALESCE(v_sk_cpns, "skCpns"),
                "tanggalCpns"               = COALESCE(v_tanggal_cpns, "tanggalCpns"),
                "skPengangkatan"            = COALESCE(v_sk_pengangkatan, "skPengangkatan"),
                "tmtPengangkatan"           = COALESCE(v_tmt_pengangkatan, "tmtPengangkatan"),
                "lembagaPengangkatan"       = COALESCE(v_lembaga_pengangkatan, "lembagaPengangkatan"),
                "pangkatGolongan"           = COALESCE(v_pangkat_golongan, "pangkatGolongan"),
                "sumberGaji"                = COALESCE(v_sumber_gaji, "sumberGaji"),
                "tmtPns"                    = COALESCE(v_tmt_pns, "tmtPns"),
                "karpeg"                    = COALESCE(v_karpeg, "karpeg"),
                "namaIbuKandung"            = COALESCE(v_nama_ibu_kandung, "namaIbuKandung"),
                "statusPerkawinan"          = COALESCE(v_status_perkawinan, "statusPerkawinan"),
                "namaSuamiIstri"            = COALESCE(v_nama_suami_istri, "namaSuamiIstri"),
                "nipSuamiIstri"             = COALESCE(v_nip_suami_istri, "nipSuamiIstri"),
                "pekerjaanSuamiIstri"       = COALESCE(v_pekerjaan_suami_istri, "pekerjaanSuamiIstri"),
                "karisKarsu"                = COALESCE(v_karis_karsu, "karisKarsu"),
                "kewarganegaraan"           = COALESCE(v_kewarganegaraan, "kewarganegaraan"),
                "npwp"                      = COALESCE(v_npwp, "npwp"),
                "namaWajibPajak"            = COALESCE(v_nama_wajib_pajak, "namaWajibPajak"),
                "bank"                      = COALESCE(v_bank, "bank"),
                "nomorRekeningBank"         = COALESCE(v_no_rekening, "nomorRekeningBank"),
                "rekeningAtasNama"          = COALESCE(v_rekening_atas_nama, "rekeningAtasNama"),
                "lintang"                   = COALESCE(v_lintang, "lintang"),
                "bujur"                     = COALESCE(v_bujur, "bujur"),
                "nuks"                      = COALESCE(v_nuks, "nuks"),
                "sudahLisensiKepalaSekolah" = public.parse_dapodik_bool(teacher_record->>'sudahLisensiKepalaSekolah', "sudahLisensiKepalaSekolah"),
                "pernahDiklatKepengawasan"  = public.parse_dapodik_bool(teacher_record->>'pernahDiklatKepengawasan', "pernahDiklatKepengawasan"),
                "keahlianBraille"           = public.parse_dapodik_bool(teacher_record->>'keahlianBraille', "keahlianBraille"),
                "keahlianBahasaIsyarat"     = public.parse_dapodik_bool(teacher_record->>'keahlianBahasaIsyarat', "keahlianBahasaIsyarat"),
                "updatedAt"                 = now()
            WHERE "id" = v_existing_id
              AND "schoolId" = v_school_id;

            v_updated_count := v_updated_count + 1;
        ELSE
            INSERT INTO public.teachers (
                "schoolId", "fullName", "gender", "nip", "nuptk", "nik", "noKk",
                "birthPlace", "birthDate", "religion",
                "address", "dusun", "rt", "rw", "kelurahan", "kecamatan", "city", "province", "postalCode",
                "telepon", "phone", "email",
                "education", "major", "university",
                "status", "position", "isCertified", "certificationNumber", "joinDate",
                "isActive", "baseSalary", "subjects", "maxHoursPerWeek", "tugasTambahan",
                "skCpns", "tanggalCpns", "skPengangkatan", "tmtPengangkatan",
                "lembagaPengangkatan", "pangkatGolongan", "sumberGaji", "tmtPns", "karpeg",
                "namaIbuKandung", "statusPerkawinan", "namaSuamiIstri", "nipSuamiIstri",
                "pekerjaanSuamiIstri", "karisKarsu", "kewarganegaraan",
                "npwp", "namaWajibPajak", "bank", "nomorRekeningBank", "rekeningAtasNama",
                "lintang", "bujur", "nuks",
                "sudahLisensiKepalaSekolah", "pernahDiklatKepengawasan",
                "keahlianBraille", "keahlianBahasaIsyarat"
            )
            VALUES (
                v_school_id, v_full_name, v_gender, v_nip, v_nuptk, v_nik, v_no_kk,
                v_birth_place, v_birth_date, v_religion,
                v_address, v_dusun, v_rt, v_rw, v_kelurahan, v_kecamatan, v_city, v_province, v_postal_code,
                v_telepon, v_phone, v_email,
                v_education, v_major, v_university,
                v_status, v_position, v_is_certified, v_certification_number, COALESCE(v_join_date, v_tmt_pengangkatan),
                v_is_active, v_base_salary, v_subjects, v_max_hours, v_tugas_tambahan,
                v_sk_cpns, v_tanggal_cpns, v_sk_pengangkatan, v_tmt_pengangkatan,
                v_lembaga_pengangkatan, v_pangkat_golongan, v_sumber_gaji, v_tmt_pns, v_karpeg,
                v_nama_ibu_kandung, v_status_perkawinan, v_nama_suami_istri, v_nip_suami_istri,
                v_pekerjaan_suami_istri, v_karis_karsu, COALESCE(v_kewarganegaraan, 'Indonesia'),
                v_npwp, v_nama_wajib_pajak, v_bank, v_no_rekening, v_rekening_atas_nama,
                v_lintang, v_bujur, v_nuks,
                v_lisensi_kepsek, v_diklat_pengawas,
                v_braille, v_bahasa_isyarat
            );

            v_inserted_count := v_inserted_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'inserted', v_inserted_count,
        'updated', v_updated_count,
        'count', v_inserted_count + v_updated_count,
        'message', v_inserted_count || ' guru baru ditambahkan, ' || v_updated_count || ' data guru diperbarui.'
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Impor gagal pada baris ke-%: %', v_index, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_teachers(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_teachers(JSONB) TO authenticated;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) — MULTI-TENANT & MULTI-ROLE (HARDENED + CACHED)
-- ============================================================================
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
ALTER TABLE public.national_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarship_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Refresh tokens: deny all dari client
CREATE POLICY refresh_tokens_deny_client ON public.refresh_tokens
FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Schools
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "id" = (SELECT public.get_user_school_id()))
);

CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
USING (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "id" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "id" = (SELECT public.get_user_school_id()))
);

CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- Academic Years & Semesters
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY academic_years_manage ON public.academic_years FOR ALL TO authenticated
USING (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY semesters_select ON public.semesters FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY semesters_manage ON public.semesters FOR ALL TO authenticated
USING (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    (SELECT public.is_school_admin())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- Users (Mendukung Multi-Role, Onboarding Admin & Pembatasan Ketat Akun ADMIN/SUPER_ADMIN)
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR "id" = (SELECT auth.uid())
    OR (
        ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
        AND "schoolId" = (SELECT public.get_user_school_id())
    )
);

CREATE POLICY users_insert ON public.users FOR INSERT TO authenticated
WITH CHECK (
    ((SELECT public.is_super_admin()) AND (("role" = 'SUPER_ADMIN' AND "schoolId" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "schoolId" IS NOT NULL)))
    OR (
        ('ADMIN' = ANY((SELECT public.get_user_all_roles())))
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND "role" NOT IN ('SUPER_ADMIN', 'ADMIN')
        AND NOT ('ADMIN' = ANY("additionalRoles"))
    )
    OR (
        ((SELECT public.get_user_all_roles()) && ARRAY['OPERATOR','STAFF_TU']::text[])
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND "role" IN ('GURU','WALI_KELAS','STAFF_PERPUS','ORANG_TUA','SISWA')
        AND "additionalRoles" = '{}'::text[]
    )
);

CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR "id" = (SELECT auth.uid())
    OR (('ADMIN' = ANY((SELECT public.get_user_all_roles()))) AND "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    (SELECT public.is_super_admin())
    OR ("id" = (SELECT auth.uid()) AND "schoolId" IS NOT DISTINCT FROM (SELECT public.get_user_school_id()) AND "role" <> 'SUPER_ADMIN')
    OR (('ADMIN' = ANY((SELECT public.get_user_all_roles()))) AND "schoolId" = (SELECT public.get_user_school_id()) AND "role" <> 'SUPER_ADMIN')
);

CREATE POLICY users_delete ON public.users FOR DELETE TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR (
        ('ADMIN' = ANY((SELECT public.get_user_all_roles())))
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND "role" NOT IN ('SUPER_ADMIN', 'ADMIN')
        AND "id" <> (SELECT auth.uid())
    )
);

-- Teachers (Granular: INSERT/UPDATE oleh Manajemen/TU/Operator, DELETE khusus Pimpinan)
CREATE POLICY teachers_select ON public.teachers FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY teachers_insert ON public.teachers FOR INSERT TO authenticated
WITH CHECK (
    (SELECT public.current_user_can_manage_administration())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY teachers_update ON public.teachers FOR UPDATE TO authenticated
USING (
    (SELECT public.current_user_can_manage_administration())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    (SELECT public.current_user_can_manage_administration())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY teachers_delete ON public.teachers FOR DELETE TO authenticated
USING (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- Classes
CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY classes_manage ON public.classes FOR ALL TO authenticated
USING (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- Students
CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "id" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY students_manage ON public.students FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Student Class History
CREATE POLICY student_history_select ON public.student_class_history FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY student_history_manage ON public.student_class_history FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- User Student Links
CREATE POLICY user_student_links_select ON public.user_student_links FOR SELECT TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR "userId" = (SELECT auth.uid())
    OR (
        ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
        AND "schoolId" = (SELECT public.get_user_school_id())
    )
);

CREATE POLICY user_student_links_manage ON public.user_student_links FOR ALL TO authenticated
USING (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- Student Parents
CREATE POLICY parents_select ON public.student_parents FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY parents_manage ON public.student_parents FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Student Economics
CREATE POLICY economics_select ON public.student_economics FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
    )
);

CREATE POLICY economics_manage ON public.student_economics FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Attendances (Presensi HADIR/TERLAMBAT guru wajib melewati RPC submit_teacher_gps_attendance)
CREATE POLICY attendances_select ON public.attendances FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY attendances_manage ON public.attendances FOR ALL TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" = (SELECT public.get_user_school_id())
        AND (
            ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
            OR (
                "type" = 'SISWA'
                AND ((SELECT public.get_user_all_roles()) && ARRAY['WALI_KELAS','GURU']::text[])
            )
            OR (
                "type" = 'GURU'
                AND "status" IN ('IZIN', 'SAKIT')
                AND "checkInTime" IS NULL
                AND "teacherId" IN (
                    SELECT t."id" FROM public.teachers t
                    WHERE t."userId" = (SELECT auth.uid())
                      AND t."schoolId" = (SELECT public.get_user_school_id())
                )
            )
        )
    )
)
WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" = (SELECT public.get_user_school_id())
        AND (
            ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
            OR (
                "type" = 'SISWA'
                AND ((SELECT public.get_user_all_roles()) && ARRAY['WALI_KELAS','GURU']::text[])
            )
            OR (
                "type" = 'GURU'
                AND "status" IN ('IZIN', 'SAKIT')
                AND "checkInTime" IS NULL
                AND "teacherId" IN (
                    SELECT t."id" FROM public.teachers t
                    WHERE t."userId" = (SELECT auth.uid())
                      AND t."schoolId" = (SELECT public.get_user_school_id())
                )
            )
        )
    )
);

-- Subjects & Schedules
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY subjects_manage ON public.subjects FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_academic()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_academic()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY schedules_select ON public.schedule_entries FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY schedules_manage ON public.schedule_entries FOR ALL TO authenticated
USING (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- Announcements
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY announcements_manage ON public.announcements FOR ALL TO authenticated
USING (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
)
WITH CHECK (
    ((SELECT public.get_user_all_roles()) && ARRAY['SUPER_ADMIN','ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

-- National Holidays (Global "schoolId" IS NULL + Terisolasi Per Sekolah)
CREATE POLICY national_holidays_select ON public.national_holidays FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR "schoolId" IS NULL
        OR "schoolId" = (SELECT public.get_user_school_id())
    )
);

CREATE POLICY national_holidays_manage ON public.national_holidays FOR ALL TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" IS NOT NULL
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    )
)
WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" IS NOT NULL
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    )
);

-- Daily Quotes (Global "schoolId" IS NULL + Terisolasi Per Sekolah)
CREATE POLICY daily_quotes_select ON public.daily_quotes FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR "schoolId" IS NULL
        OR "schoolId" = (SELECT public.get_user_school_id())
    )
);

CREATE POLICY daily_quotes_manage ON public.daily_quotes FOR ALL TO authenticated
USING (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" IS NOT NULL
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    )
)
WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
        "schoolId" IS NOT NULL
        AND "schoolId" = (SELECT public.get_user_school_id())
        AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH','OPERATOR','STAFF_TU']::text[])
    )
);

-- Inventory
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY inventory_items_manage ON public.inventory_items FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_inventory()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_inventory()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY inventory_transactions_select ON public.inventory_transactions FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY inventory_transactions_manage ON public.inventory_transactions FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_inventory()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_inventory()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Administration & Scholarships
CREATE POLICY administration_select ON public.administration_records FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY administration_manage ON public.administration_records FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_administration()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_administration()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY scholarships_select ON public.scholarship_records FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
    )
);

CREATE POLICY scholarships_manage ON public.scholarship_records FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_students()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Finance
CREATE POLICY fee_templates_select ON public.fee_templates FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY fee_templates_manage ON public.fee_templates FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY student_bills_select ON public.student_bills FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY student_bills_manage ON public.student_bills FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY payments_select ON public.payment_transactions FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY payments_manage ON public.payment_transactions FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_finance()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Library (Perpustakaan)
CREATE POLICY library_books_select ON public.library_books FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id()))
);

CREATE POLICY library_books_manage ON public.library_books FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_library()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_library()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

CREATE POLICY library_loans_select ON public.library_loans FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR ("schoolId" = (SELECT public.get_user_school_id()) AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[]))
        OR "studentId" IN (
            SELECT l."studentId" FROM public.user_student_links l
            WHERE l."userId" = (SELECT auth.uid()) AND l."schoolId" = (SELECT public.get_user_school_id())
        )
    )
);

CREATE POLICY library_loans_manage ON public.library_loans FOR ALL TO authenticated
USING ((SELECT public.current_user_can_manage_library()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())))
WITH CHECK ((SELECT public.current_user_can_manage_library()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- Audit Logs (Immutable untuk authenticated)
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
USING (
    (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR (
            "schoolId" = (SELECT public.get_user_school_id())
            AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN','KEPALA_SEKOLAH']::text[])
        )
    )
);

CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_user_active()) AND ((SELECT public.is_super_admin()) OR "schoolId" = (SELECT public.get_user_school_id())));

-- ============================================================================
-- 13. TABLE GRANTS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;
REVOKE ALL ON TABLE public.refresh_tokens FROM authenticated;

COMMIT;

-- ============================================================================
-- 14. STORAGE BUCKETS & RLS POLICIES (MULTI-FORMAT FOLDER ISOLATION)
-- Mendukung struktur folder {schoolId}/... maupun {Nama_Sekolah}/...
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    (
        'attendance-selfies',
        'attendance-selfies',
        false,
        512000, -- Maksimal 500 KB per file selfie
        ARRAY['image/jpeg', 'image/jpg', 'image/webp']::text[]
    ),
    (
        'attendance-attachments',
        'attendance-attachments',
        false,
        2097152, -- Maksimal 2 MB per dokumen izin/surat dinas
        ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']::text[]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "attendance_selfies_select" ON storage.objects;
DROP POLICY IF EXISTS "attendance_selfies_insert" ON storage.objects;
DROP POLICY IF EXISTS "attendance_selfies_update" ON storage.objects;
DROP POLICY IF EXISTS "attendance_selfies_delete" ON storage.objects;

DROP POLICY IF EXISTS "attendance_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "attendance_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "attendance_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "attendance_attachments_delete" ON storage.objects;

-- Bucket 1: attendance-selfies
CREATE POLICY "attendance_selfies_select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'attendance-selfies'
    AND (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
    )
);

CREATE POLICY "attendance_selfies_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'attendance-selfies'
    AND (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[])
        )
    )
);

CREATE POLICY "attendance_selfies_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'attendance-selfies'
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[])
        )
    )
);

CREATE POLICY "attendance_selfies_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'attendance-selfies'
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[])
        )
    )
);

-- Bucket 2: attendance-attachments
CREATE POLICY "attendance_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'attendance-attachments'
    AND (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
    )
);

CREATE POLICY "attendance_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'attendance-attachments'
    AND (SELECT public.is_user_active())
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND NOT ((SELECT public.get_user_all_roles()) <@ ARRAY['ORANG_TUA','SISWA']::text[])
        )
    )
);

CREATE POLICY "attendance_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'attendance-attachments'
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[])
        )
    )
);

CREATE POLICY "attendance_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'attendance-attachments'
    AND (
        (SELECT public.is_super_admin())
        OR (
            (SELECT public.is_own_school_storage_folder((storage.foldername(name))[1]))
            AND ((SELECT public.get_user_all_roles()) && ARRAY['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR']::text[])
        )
    )
);


NOTIFY pgrst, 'reload schema';
