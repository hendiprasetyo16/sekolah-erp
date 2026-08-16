-- ====================================================================================
-- DATABASE SEKOLAH ERP v3
-- FINAL FOUNDATION
-- Supabase PostgreSQL
--
-- Multi Tenant / Multi School
-- Supabase Auth
-- RLS ketat berdasarkan schoolId
-- Master sekolah
-- Tahun ajaran
-- Semester
-- User
-- Guru
-- Kelas
-- Siswa
-- Orang tua
-- Data ekonomi
-- Histori kelas
-- Absensi
-- Pengumuman
-- Template tagihan
-- Tagihan siswa
-- Transaksi pembayaran
-- Audit log
-- Bulk import siswa
-- Setup tenant baru
--
-- PENTING:
-- 1. Script ini RESET schema ERP.
-- 2. Data tabel lama akan dihapus.
-- 3. auth.users milik Supabase TIDAK dihapus.
-- 4. Nama tabel dan kolom dipertahankan agar kompatibel dengan aplikasi.
-- ====================================================================================


-- ====================================================================================
-- 0. EXTENSION
-- ====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ====================================================================================
-- 1. RESET TABLE
-- ====================================================================================

DROP TABLE IF EXISTS
    public.payment_transactions,
    public.student_bills,
    public.fee_templates,
    public.announcements,
    public.attendances,
    public.student_economics,
    public.student_parents,
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


-- ====================================================================================
-- 2. RESET FUNCTIONS
-- ====================================================================================

DROP FUNCTION IF EXISTS public.get_user_school_id();
DROP FUNCTION IF EXISTS public.is_user_active();
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.recalculate_bill_status(TEXT);
DROP FUNCTION IF EXISTS public.handle_payment_change();
DROP FUNCTION IF EXISTS public.bulk_import_students(JSONB);
DROP FUNCTION IF EXISTS public.setup_new_tenant(TEXT, TEXT, TEXT, INTEGER, INTEGER);


-- ====================================================================================
-- 3. MASTER SEKOLAH
-- ====================================================================================

CREATE TABLE public.schools (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "name" TEXT NOT NULL,
    "npsn" TEXT NOT NULL,

    "level" TEXT NOT NULL DEFAULT 'BELUM_DIATUR',
    "type" TEXT NOT NULL DEFAULT 'BELUM_DIATUR',

    "address" TEXT NOT NULL DEFAULT '-',
    "city" TEXT NOT NULL DEFAULT '-',
    "province" TEXT NOT NULL DEFAULT '-',

    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,

    "settings" JSONB NOT NULL DEFAULT '{}'::JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "schools_name_check"
        CHECK (length(trim("name")) > 0),

    CONSTRAINT "schools_npsn_check"
        CHECK (length(trim("npsn")) >= 8)
);


-- ====================================================================================
-- 4. TAHUN AJARAN
-- ====================================================================================

CREATE TABLE public.academic_years (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "name" TEXT NOT NULL,

    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,

    "isActive" BOOLEAN NOT NULL DEFAULT FALSE,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "academic_years_year_check"
        CHECK ("endYear" = "startYear" + 1),

    CONSTRAINT "academic_years_school_id_unique"
        UNIQUE ("id", "schoolId")
);


-- ====================================================================================
-- 5. SEMESTER
-- ====================================================================================

CREATE TABLE public.semesters (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,

    "type" TEXT NOT NULL,

    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    "isActive" BOOLEAN NOT NULL DEFAULT FALSE,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "semesters_type_check"
        CHECK (
            "type" IN ('GANJIL', 'GENAP')
        ),

    CONSTRAINT "semesters_date_check"
        CHECK (
            "endDate" > "startDate"
        ),

    CONSTRAINT "semesters_id_school_unique"
        UNIQUE ("id", "schoolId")
);


-- ====================================================================================
-- 6. USERS
--
-- id disimpan sebagai TEXT agar kompatibel dengan struktur aplikasi.
-- Nilainya harus sama dengan auth.users.id.
-- ====================================================================================

CREATE TABLE public.users (
    "id" TEXT NOT NULL,

    "schoolId" TEXT NOT NULL,

    "email" TEXT NOT NULL,

    "passwordHash" TEXT,

    "fullName" TEXT NOT NULL,

    "role" TEXT NOT NULL DEFAULT 'ADMIN',

    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,

    "avatarUrl" TEXT,

    "lastLogin" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "users_id_school_unique"
        UNIQUE ("id", "schoolId")
);


-- ====================================================================================
-- 7. REFRESH TOKENS
--
-- Catatan:
-- Jika aplikasi sepenuhnya menggunakan Supabase Auth,
-- tabel ini sebenarnya tidak perlu digunakan untuk session Supabase.
-- Tetap dipertahankan agar kompatibel dengan struktur aplikasi lama.
-- ====================================================================================

CREATE TABLE public.refresh_tokens (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "userId" TEXT NOT NULL,

    "token" TEXT NOT NULL,

    "expiresAt" TIMESTAMP(3) NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 8. AUDIT LOG
-- ====================================================================================

CREATE TABLE public.audit_logs (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "userId" TEXT,

    "schoolId" TEXT NOT NULL,

    "action" TEXT NOT NULL,

    "module" TEXT NOT NULL,

    "entityType" TEXT,

    "entityId" TEXT,

    "oldValues" JSONB,

    "newValues" JSONB,

    "ipAddress" TEXT,

    "userAgent" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 9. GURU / TENAGA PENDIDIK
-- ====================================================================================

CREATE TABLE public.teachers (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

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

    "isCertified" BOOLEAN NOT NULL DEFAULT FALSE,
    "certificationNumber" TEXT,

    "joinDate" TIMESTAMP(3),

    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,

    "baseSalary" NUMERIC(15,2),

    "subjects" TEXT,

    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 24,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "teachers_id_school_unique"
        UNIQUE ("id", "schoolId"),

    CONSTRAINT "teachers_salary_check"
        CHECK (
            "baseSalary" IS NULL
            OR "baseSalary" >= 0
        ),

    CONSTRAINT "teachers_hours_check"
        CHECK (
            "maxHoursPerWeek" > 0
        )
);


-- ====================================================================================
-- 10. KELAS
-- ====================================================================================

CREATE TABLE public.classes (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "academicYearId" TEXT NOT NULL,

    "name" TEXT NOT NULL,

    "gradeLevel" INTEGER NOT NULL,

    "major" TEXT,

    "homeroomTeacherId" TEXT,

    "capacity" INTEGER NOT NULL DEFAULT 36,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "classes_id_school_unique"
        UNIQUE ("id", "schoolId"),

    CONSTRAINT "classes_capacity_check"
        CHECK ("capacity" > 0),

    CONSTRAINT "classes_grade_check"
        CHECK ("gradeLevel" > 0)
);


-- ====================================================================================
-- 11. SISWA
-- ====================================================================================

CREATE TABLE public.students (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "nis" TEXT,
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

    "status" TEXT NOT NULL DEFAULT 'AKTIF',

    "entryDate" TIMESTAMP(3) NOT NULL,

    "classId" TEXT,

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

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "students_id_school_unique"
        UNIQUE ("id", "schoolId"),

    CONSTRAINT "students_anakke_check"
        CHECK (
            "anakKe" IS NULL
            OR "anakKe" > 0
        ),

    CONSTRAINT "students_saudara_check"
        CHECK (
            "jmlSaudara" IS NULL
            OR "jmlSaudara" >= 0
        )
);


-- ====================================================================================
-- 12. HISTORI KELAS SISWA
-- ====================================================================================

CREATE TABLE public.student_class_history (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "academicYearId" TEXT NOT NULL,

    "classId" TEXT NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_class_history_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 13. ORANG TUA
-- ====================================================================================

CREATE TABLE public.student_parents (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "relation" TEXT NOT NULL,

    "fullName" TEXT NOT NULL,

    "nik" TEXT,

    "phone" TEXT,
    "email" TEXT,

    "education" TEXT,
    "occupation" TEXT,

    "monthlyIncome" NUMERIC(15,2),

    "isAlive" BOOLEAN NOT NULL DEFAULT TRUE,

    "address" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_parents_income_check"
        CHECK (
            "monthlyIncome" IS NULL
            OR "monthlyIncome" >= 0
        )
);


-- ====================================================================================
-- 14. DATA EKONOMI
-- ====================================================================================

CREATE TABLE public.student_economics (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "hasKip" BOOLEAN NOT NULL DEFAULT FALSE,
    "kipNumber" TEXT,
    "namaKip" TEXT,

    "layakPip" BOOLEAN NOT NULL DEFAULT FALSE,
    "alasanLayakPip" TEXT,

    "hasKks" BOOLEAN NOT NULL DEFAULT FALSE,
    "kksNumber" TEXT,

    "hasPkh" BOOLEAN NOT NULL DEFAULT FALSE,

    "isDtks" BOOLEAN NOT NULL DEFAULT FALSE,

    "houseOwnership" TEXT,
    "houseCondition" TEXT,

    "dependentsCount" INTEGER,

    "isOrphan" BOOLEAN NOT NULL DEFAULT FALSE,
    "orphanType" TEXT,

    "pipScore" DOUBLE PRECISION,

    "economicCategory" TEXT,

    "scoringDetails" JSONB,

    "scoredAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_economics_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_economics_student_unique"
        UNIQUE ("studentId"),

    CONSTRAINT "student_economics_id_school_unique"
        UNIQUE ("id", "schoolId"),

    CONSTRAINT "student_economics_dependents_check"
        CHECK (
            "dependentsCount" IS NULL
            OR "dependentsCount" >= 0
        )
);


-- ====================================================================================
-- 15. ABSENSI
--
-- date menggunakan DATE, bukan TIMESTAMP.
-- Satu siswa hanya boleh memiliki satu absensi per tanggal.
-- ====================================================================================

CREATE TABLE public.attendances (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "date" DATE NOT NULL,

    "status" TEXT NOT NULL,

    "notes" TEXT,

    "recordedBy" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "attendances_status_check"
        CHECK (
            "status" IN (
                'HADIR',
                'IZIN',
                'SAKIT',
                'ALPA',
                'TERLAMBAT',
                'DISPENSASI'
            )
        )
);


-- ====================================================================================
-- 16. PENGUMUMAN
-- ====================================================================================

CREATE TABLE public.announcements (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "title" TEXT NOT NULL,

    "content" TEXT NOT NULL,

    "target" TEXT NOT NULL DEFAULT 'SEMUA',

    "isPinned" BOOLEAN NOT NULL DEFAULT FALSE,

    "publishDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "expireDate" TIMESTAMP(3),

    "createdBy" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "announcements_date_check"
        CHECK (
            "expireDate" IS NULL
            OR "expireDate" > "publishDate"
        )
);


-- ====================================================================================
-- 17. TEMPLATE PEMBAYARAN
-- ====================================================================================

CREATE TABLE public.fee_templates (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "academicYearId" TEXT NOT NULL,

    "name" TEXT NOT NULL,

    "category" TEXT NOT NULL,

    "gradeLevel" INTEGER,

    "amount" NUMERIC(15,2) NOT NULL,

    "periodType" TEXT NOT NULL DEFAULT 'BULANAN',

    "description" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_templates_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "fee_templates_amount_check"
        CHECK ("amount" >= 0),

    CONSTRAINT "fee_templates_period_check"
        CHECK (
            "periodType" IN (
                'BULANAN',
                'TAHUNAN',
                'SEKALI_BAYAR'
            )
        ),

    CONSTRAINT "fee_templates_grade_check"
        CHECK (
            "gradeLevel" IS NULL
            OR "gradeLevel" > 0
        ),

    CONSTRAINT "fee_templates_id_school_unique"
        UNIQUE ("id", "schoolId")
);


-- ====================================================================================
-- 18. TAGIHAN SISWA
-- ====================================================================================

CREATE TABLE public.student_bills (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "feeTemplateId" TEXT NOT NULL,

    "academicYearId" TEXT NOT NULL,

    "title" TEXT NOT NULL,

    "periodMonth" INTEGER,

    "periodYear" INTEGER,

    "totalAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "paidAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,

    "status" TEXT NOT NULL DEFAULT 'BELUM_BAYAR',

    "dueDate" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_bills_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "student_bills_id_school_unique"
        UNIQUE ("id", "schoolId"),

    CONSTRAINT "student_bills_amount_check"
        CHECK (
            "totalAmount" >= 0
            AND "paidAmount" >= 0
            AND "paidAmount" <= "totalAmount"
        ),

    CONSTRAINT "student_bills_month_check"
        CHECK (
            "periodMonth" IS NULL
            OR (
                "periodMonth" BETWEEN 1 AND 12
            )
        ),

    CONSTRAINT "student_bills_status_check"
        CHECK (
            "status" IN (
                'BELUM_BAYAR',
                'CICILAN',
                'LUNAS',
                'DIBATALKAN'
            )
        )
);


-- ====================================================================================
-- 19. TRANSAKSI PEMBAYARAN
-- ====================================================================================

CREATE TABLE public.payment_transactions (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,

    "schoolId" TEXT NOT NULL,

    "billId" TEXT NOT NULL,

    "studentId" TEXT NOT NULL,

    "amount" NUMERIC(15,2) NOT NULL,

    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',

    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "reference" TEXT,

    "recordedBy" TEXT,

    "status" TEXT NOT NULL DEFAULT 'BERHASIL',

    "notes" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "payment_transactions_amount_check"
        CHECK ("amount" > 0),

    CONSTRAINT "payment_transactions_status_check"
        CHECK (
            "status" IN (
                'BERHASIL',
                'DIBATALKAN'
            )
        )
);


-- ====================================================================================
-- 20. UNIQUE INDEX
-- ====================================================================================

CREATE UNIQUE INDEX "schools_npsn_key"
ON public.schools ("npsn");


CREATE UNIQUE INDEX "users_email_key"
ON public.users ("email");


CREATE UNIQUE INDEX "refresh_tokens_token_key"
ON public.refresh_tokens ("token");


CREATE UNIQUE INDEX "students_schoolId_nisn_key"
ON public.students ("schoolId", "nisn");


CREATE UNIQUE INDEX "students_schoolId_nis_key"
ON public.students ("schoolId", "nis")
WHERE "nis" IS NOT NULL;


CREATE UNIQUE INDEX "students_schoolId_nik_key"
ON public.students ("schoolId", "nik");


CREATE UNIQUE INDEX "student_class_history_unique"
ON public.student_class_history
(
    "studentId",
    "academicYearId"
);


CREATE UNIQUE INDEX "attendances_student_date_key"
ON public.attendances
(
    "studentId",
    "date"
);


CREATE UNIQUE INDEX "fee_templates_unique"
ON public.fee_templates
(
    "schoolId",
    "academicYearId",
    "name",
    COALESCE("gradeLevel", 0)
);


CREATE UNIQUE INDEX "student_bills_unique_period"
ON public.student_bills
(
    "studentId",
    "feeTemplateId",
    "academicYearId",
    COALESCE("periodMonth", 0),
    COALESCE("periodYear", 0)
);


-- ====================================================================================
-- 21. INDEX PERFORMA
-- ====================================================================================

CREATE INDEX "academic_years_schoolId_idx"
ON public.academic_years ("schoolId");


CREATE INDEX "academic_years_active_idx"
ON public.academic_years ("schoolId", "isActive");


CREATE INDEX "semesters_schoolId_idx"
ON public.semesters ("schoolId");


CREATE INDEX "semesters_academicYearId_idx"
ON public.semesters ("academicYearId");


CREATE INDEX "semesters_active_idx"
ON public.semesters ("schoolId", "isActive");


CREATE INDEX "teachers_schoolId_idx"
ON public.teachers ("schoolId");


CREATE INDEX "teachers_fullName_idx"
ON public.teachers ("fullName");


CREATE INDEX "teachers_nuptk_idx"
ON public.teachers ("schoolId", "nuptk")
WHERE "nuptk" IS NOT NULL;


CREATE INDEX "teachers_nip_idx"
ON public.teachers ("schoolId", "nip")
WHERE "nip" IS NOT NULL;


CREATE INDEX "classes_schoolId_idx"
ON public.classes ("schoolId");


CREATE INDEX "classes_academicYearId_idx"
ON public.classes ("academicYearId");


CREATE INDEX "classes_homeroomTeacherId_idx"
ON public.classes ("homeroomTeacherId");


CREATE INDEX "students_schoolId_idx"
ON public.students ("schoolId");


CREATE INDEX "students_classId_idx"
ON public.students ("classId");


CREATE INDEX "students_fullName_idx"
ON public.students ("fullName");


CREATE INDEX "students_status_idx"
ON public.students ("schoolId", "status");


CREATE INDEX "student_history_studentId_idx"
ON public.student_class_history ("studentId");


CREATE INDEX "student_history_academicYearId_idx"
ON public.student_class_history ("academicYearId");


CREATE INDEX "student_history_classId_idx"
ON public.student_class_history ("classId");


CREATE INDEX "parents_studentId_idx"
ON public.student_parents ("studentId");


CREATE INDEX "parents_schoolId_idx"
ON public.student_parents ("schoolId");


CREATE INDEX "economics_studentId_idx"
ON public.student_economics ("studentId");


CREATE INDEX "economics_schoolId_idx"
ON public.student_economics ("schoolId");


CREATE INDEX "attendances_schoolId_date_idx"
ON public.attendances ("schoolId", "date");


CREATE INDEX "attendances_studentId_date_idx"
ON public.attendances ("studentId", "date");


CREATE INDEX "bills_schoolId_idx"
ON public.student_bills ("schoolId");


CREATE INDEX "bills_studentId_idx"
ON public.student_bills ("studentId");


CREATE INDEX "bills_academicYearId_idx"
ON public.student_bills ("academicYearId");


CREATE INDEX "bills_status_idx"
ON public.student_bills ("schoolId", "status");


CREATE INDEX "payments_billId_idx"
ON public.payment_transactions ("billId");


CREATE INDEX "payments_studentId_idx"
ON public.payment_transactions ("studentId");


CREATE INDEX "payments_schoolId_idx"
ON public.payment_transactions ("schoolId");


CREATE INDEX "payments_date_idx"
ON public.payment_transactions ("schoolId", "paymentDate");


CREATE INDEX "announcements_schoolId_idx"
ON public.announcements ("schoolId");


CREATE INDEX "audit_logs_schoolId_idx"
ON public.audit_logs ("schoolId");


CREATE INDEX "audit_logs_createdAt_idx"
ON public.audit_logs ("schoolId", "createdAt");


-- ====================================================================================
-- 22. FOREIGN KEYS
--
-- BAGIAN PENTING:
-- FK menggunakan schoolId bersama ID untuk mencegah data lintas sekolah.
-- ====================================================================================


-- ACADEMIC YEARS
ALTER TABLE public.academic_years
ADD CONSTRAINT "academic_years_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- SEMESTERS
ALTER TABLE public.semesters
ADD CONSTRAINT "semesters_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.semesters
ADD CONSTRAINT "semesters_academicYear_school_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES public.academic_years ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- USERS
ALTER TABLE public.users
ADD CONSTRAINT "users_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- REFRESH TOKENS
ALTER TABLE public.refresh_tokens
ADD CONSTRAINT "refresh_tokens_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES public.users ("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- AUDIT LOG
ALTER TABLE public.audit_logs
ADD CONSTRAINT "audit_logs_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES public.users ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE public.audit_logs
ADD CONSTRAINT "audit_logs_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- TEACHERS
ALTER TABLE public.teachers
ADD CONSTRAINT "teachers_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- CLASSES
ALTER TABLE public.classes
ADD CONSTRAINT "classes_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.classes
ADD CONSTRAINT "classes_academicYear_school_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES public.academic_years ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.classes
ADD CONSTRAINT "classes_teacher_school_fkey"
FOREIGN KEY ("homeroomTeacherId", "schoolId")
REFERENCES public.teachers ("id", "schoolId")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- STUDENTS
ALTER TABLE public.students
ADD CONSTRAINT "students_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.students
ADD CONSTRAINT "students_class_school_fkey"
FOREIGN KEY ("classId", "schoolId")
REFERENCES public.classes ("id", "schoolId")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- STUDENT HISTORY
ALTER TABLE public.student_class_history
ADD CONSTRAINT "student_history_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_class_history
ADD CONSTRAINT "student_history_student_school_fkey"
FOREIGN KEY ("studentId", "schoolId")
REFERENCES public.students ("id", "schoolId")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE public.student_class_history
ADD CONSTRAINT "student_history_academicYear_school_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES public.academic_years ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_class_history
ADD CONSTRAINT "student_history_class_school_fkey"
FOREIGN KEY ("classId", "schoolId")
REFERENCES public.classes ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- PARENTS
ALTER TABLE public.student_parents
ADD CONSTRAINT "student_parents_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_parents
ADD CONSTRAINT "student_parents_student_school_fkey"
FOREIGN KEY ("studentId", "schoolId")
REFERENCES public.students ("id", "schoolId")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- ECONOMICS
ALTER TABLE public.student_economics
ADD CONSTRAINT "student_economics_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_economics
ADD CONSTRAINT "student_economics_student_school_fkey"
FOREIGN KEY ("studentId", "schoolId")
REFERENCES public.students ("id", "schoolId")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- ATTENDANCE
ALTER TABLE public.attendances
ADD CONSTRAINT "attendances_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.attendances
ADD CONSTRAINT "attendances_student_school_fkey"
FOREIGN KEY ("studentId", "schoolId")
REFERENCES public.students ("id", "schoolId")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE public.attendances
ADD CONSTRAINT "attendances_recordedBy_fkey"
FOREIGN KEY ("recordedBy")
REFERENCES public.users ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- ANNOUNCEMENTS
ALTER TABLE public.announcements
ADD CONSTRAINT "announcements_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.announcements
ADD CONSTRAINT "announcements_createdBy_fkey"
FOREIGN KEY ("createdBy")
REFERENCES public.users ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- FEE TEMPLATES
ALTER TABLE public.fee_templates
ADD CONSTRAINT "fee_templates_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.fee_templates
ADD CONSTRAINT "fee_templates_academicYear_school_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES public.academic_years ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- STUDENT BILLS
ALTER TABLE public.student_bills
ADD CONSTRAINT "student_bills_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_bills
ADD CONSTRAINT "student_bills_student_school_fkey"
FOREIGN KEY ("studentId", "schoolId")
REFERENCES public.students ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_bills
ADD CONSTRAINT "student_bills_feeTemplate_school_fkey"
FOREIGN KEY ("feeTemplateId", "schoolId")
REFERENCES public.fee_templates ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.student_bills
ADD CONSTRAINT "student_bills_academicYear_school_fkey"
FOREIGN KEY ("academicYearId", "schoolId")
REFERENCES public.academic_years ("id", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- PAYMENTS
ALTER TABLE public.payment_transactions
ADD CONSTRAINT "payment_transactions_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES public.schools ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.payment_transactions
ADD CONSTRAINT "payment_transactions_bill_student_school_fkey"
FOREIGN KEY ("billId", "studentId", "schoolId")
REFERENCES public.student_bills ("id", "studentId", "schoolId")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE public.payment_transactions
ADD CONSTRAINT "payment_transactions_recordedBy_fkey"
FOREIGN KEY ("recordedBy")
REFERENCES public.users ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- ====================================================================================
-- 23. ACTIVE YEAR / SEMESTER UNIQUE INDEX
-- ====================================================================================

CREATE UNIQUE INDEX "academic_years_one_active_per_school"
ON public.academic_years ("schoolId")
WHERE "isActive" = TRUE;


CREATE UNIQUE INDEX "semesters_one_active_per_school"
ON public.semesters ("schoolId")
WHERE "isActive" = TRUE;


-- ====================================================================================
-- 24. HELPER FUNCTION:
-- GET SCHOOL ID USER LOGIN
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u."schoolId"
    FROM public.users u
    WHERE u."id" = auth.uid()::TEXT
      AND u."isActive" = TRUE
    LIMIT 1;
$$;


-- ====================================================================================
-- 25. HELPER FUNCTION:
-- USER ACTIVE
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT u."isActive"
            FROM public.users u
            WHERE u."id" = auth.uid()::TEXT
            LIMIT 1
        ),
        FALSE
    );
$$;


-- ====================================================================================
-- 26. UPDATED AT FUNCTION
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


-- ====================================================================================
-- 27. UPDATED AT TRIGGERS
-- ====================================================================================

CREATE TRIGGER "schools_updatedAt"
BEFORE UPDATE ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "academic_years_updatedAt"
BEFORE UPDATE ON public.academic_years
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "users_updatedAt"
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "teachers_updatedAt"
BEFORE UPDATE ON public.teachers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "classes_updatedAt"
BEFORE UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "students_updatedAt"
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_parents_updatedAt"
BEFORE UPDATE ON public.student_parents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_economics_updatedAt"
BEFORE UPDATE ON public.student_economics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "fee_templates_updatedAt"
BEFORE UPDATE ON public.fee_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_bills_updatedAt"
BEFORE UPDATE ON public.student_bills
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ====================================================================================
-- 28. FUNCTION RECALCULATE BILL
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.recalculate_bill_status(
    p_bill_id TEXT
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total NUMERIC(15,2);
    v_paid NUMERIC(15,2);
    v_current_status TEXT;
    v_new_status TEXT;
BEGIN

    SELECT
        "totalAmount",
        "status"
    INTO
        v_total,
        v_current_status
    FROM public.student_bills
    WHERE "id" = p_bill_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;


    SELECT
        COALESCE(
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


    IF v_current_status = 'DIBATALKAN' THEN

        v_new_status := 'DIBATALKAN';

    ELSIF v_paid <= 0 THEN

        v_new_status := 'BELUM_BAYAR';

    ELSIF v_paid >= v_total THEN

        v_new_status := 'LUNAS';

    ELSE

        v_new_status := 'CICILAN';

    END IF;


    UPDATE public.student_bills
    SET
        "paidAmount" = LEAST(v_paid, v_total),
        "status" = v_new_status,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = p_bill_id;

END;
$$;


-- ====================================================================================
-- 29. PAYMENT CHANGE TRIGGER
--
-- Menangani:
-- INSERT
-- UPDATE
-- DELETE
--
-- Termasuk apabila transaksi dipindahkan dari bill A ke bill B.
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.handle_payment_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    IF TG_OP = 'INSERT' THEN

        PERFORM public.recalculate_bill_status(
            NEW."billId"
        );

        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN

        PERFORM public.recalculate_bill_status(
            OLD."billId"
        );

        PERFORM public.recalculate_bill_status(
            NEW."billId"
        );

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN

        PERFORM public.recalculate_bill_status(
            OLD."billId"
        );

        RETURN OLD;

    END IF;

    RETURN NULL;

END;
$$;


CREATE TRIGGER "payment_recalculate_bill"
AFTER INSERT OR UPDATE OR DELETE
ON public.payment_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_change();


-- ====================================================================================
-- 30. BULK IMPORT SISWA
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.bulk_import_students(
    batch_data JSONB
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE

    auth_school_id TEXT;

    student_record JSONB;
    parent_record JSONB;
    economic_record JSONB;

    inserted_student_id TEXT;

    success_count INTEGER := 0;

BEGIN

    -- ============================================================
    -- VALIDASI LOGIN
    -- ============================================================

    IF auth.uid() IS NULL THEN

        RAISE EXCEPTION
            'User belum login.';

    END IF;


    -- ============================================================
    -- SCHOOL USER
    -- ============================================================

    auth_school_id := public.get_user_school_id();


    IF auth_school_id IS NULL THEN

        RAISE EXCEPTION
            'User tidak terafiliasi dengan sekolah aktif.';

    END IF;


    -- ============================================================
    -- VALIDASI ARRAY
    -- ============================================================

    IF batch_data IS NULL
       OR jsonb_typeof(batch_data) <> 'array'
    THEN

        RAISE EXCEPTION
            'batch_data harus berupa JSON array.';

    END IF;


    -- ============================================================
    -- LOOP
    -- ============================================================

    FOR student_record IN
        SELECT value
        FROM jsonb_array_elements(batch_data)
    LOOP

        -- ========================================================
        -- VALIDASI FIELD WAJIB
        -- ========================================================

        IF COALESCE(
            NULLIF(student_record->>'nisn', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'NISN wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'nik', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'NIK wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'fullName', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Nama siswa wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'gender', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Jenis kelamin wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'birthDate', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Tanggal lahir wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'birthPlace', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Tempat lahir wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'address', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Alamat wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'city', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Kota wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'province', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Provinsi wajib diisi.';
        END IF;


        IF COALESCE(
            NULLIF(student_record->>'entryDate', ''),
            ''
        ) = ''
        THEN
            RAISE EXCEPTION
                'Tanggal masuk wajib diisi.';
        END IF;


        -- ========================================================
        -- VALIDASI CLASS
        -- ========================================================

        IF NULLIF(student_record->>'classId', '') IS NOT NULL THEN

            IF NOT EXISTS (
                SELECT 1
                FROM public.classes c
                WHERE c."id" = student_record->>'classId'
                  AND c."schoolId" = auth_school_id
            )
            THEN

                RAISE EXCEPTION
                    'classId tidak valid atau bukan milik sekolah user.';

            END IF;

        END IF;


        -- ========================================================
        -- INSERT STUDENT
        -- ========================================================

        INSERT INTO public.students
        (
            "id",
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

            "skhun",
            "noPesertaUn",
            "noIjazah",
            "noAktaLahir",

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
            "kebutuhanKhusus",

            "sekolahAsal",

            "bank",
            "noRekening",
            "namaRekening"
        )
        VALUES
        (
            COALESCE(
                NULLIF(student_record->>'id', ''),
                gen_random_uuid()::TEXT
            ),

            auth_school_id,

            NULLIF(student_record->>'nis', ''),
            student_record->>'nisn',
            student_record->>'nik',
            NULLIF(student_record->>'noKk', ''),

            student_record->>'fullName',
            NULLIF(student_record->>'nickname', ''),

            student_record->>'gender',

            (student_record->>'birthDate')::TIMESTAMP,
            student_record->>'birthPlace',

            NULLIF(student_record->>'religion', ''),

            student_record->>'address',
            NULLIF(student_record->>'rt', ''),
            NULLIF(student_record->>'rw', ''),

            COALESCE(
                NULLIF(student_record->>'kelurahan', ''),
                NULLIF(student_record->>'village', '')
            ),

            COALESCE(
                NULLIF(student_record->>'kecamatan', ''),
                NULLIF(student_record->>'district', '')
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

            (student_record->>'entryDate')::TIMESTAMP,

            NULLIF(student_record->>'classId', ''),

            NULLIF(student_record->>'skhun', ''),
            NULLIF(student_record->>'noPesertaUn', ''),
            NULLIF(student_record->>'noIjazah', ''),
            NULLIF(student_record->>'noAktaLahir', ''),

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
            NULLIF(student_record->>'kebutuhanKhusus', ''),

            NULLIF(student_record->>'sekolahAsal', ''),

            NULLIF(student_record->>'bank', ''),
            NULLIF(student_record->>'noRekening', ''),
            NULLIF(student_record->>'namaRekening', '')
        )
        RETURNING "id"
        INTO inserted_student_id;


        -- ========================================================
        -- INSERT PARENTS
        -- ========================================================

        IF student_record ? 'parents'
           AND jsonb_typeof(student_record->'parents') = 'array'
        THEN

            FOR parent_record IN
                SELECT value
                FROM jsonb_array_elements(
                    student_record->'parents'
                )
            LOOP

                IF COALESCE(
                    NULLIF(parent_record->>'relation', ''),
                    ''
                ) = ''
                THEN
                    RAISE EXCEPTION
                        'Relation orang tua wajib diisi.';
                END IF;


                IF COALESCE(
                    NULLIF(parent_record->>'fullName', ''),
                    ''
                ) = ''
                THEN
                    RAISE EXCEPTION
                        'Nama orang tua wajib diisi.';
                END IF;


                INSERT INTO public.student_parents
                (
                    "id",
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
                    COALESCE(
                        NULLIF(parent_record->>'id', ''),
                        gen_random_uuid()::TEXT
                    ),

                    auth_school_id,

                    inserted_student_id,

                    parent_record->>'relation',
                    parent_record->>'fullName',

                    NULLIF(parent_record->>'nik', ''),

                    NULLIF(parent_record->>'phone', ''),
                    NULLIF(parent_record->>'email', ''),

                    NULLIF(parent_record->>'education', ''),

                    COALESCE(
                        NULLIF(parent_record->>'occupation', ''),
                        NULLIF(parent_record->>'job', '')
                    ),

                    CASE
                        WHEN NULLIF(
                            regexp_replace(
                                COALESCE(
                                    parent_record->>'income',
                                    ''
                                ),
                                '[^0-9]',
                                '',
                                'g'
                            ),
                            ''
                        ) IS NULL
                        THEN NULL

                        ELSE
                            regexp_replace(
                                parent_record->>'income',
                                '[^0-9]',
                                '',
                                'g'
                            )::NUMERIC(15,2)
                    END,

                    COALESCE(
                        NULLIF(
                            parent_record->>'isAlive',
                            ''
                        )::BOOLEAN,
                        TRUE
                    ),

                    NULLIF(
                        parent_record->>'address',
                        ''
                    )
                );

            END LOOP;

        END IF;


        -- ========================================================
        -- INSERT ECONOMIC
        -- ========================================================

        IF student_record ? 'economic'
           AND jsonb_typeof(student_record->'economic') = 'object'
        THEN

            economic_record :=
                student_record->'economic';


            INSERT INTO public.student_economics
            (
                "id",
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

                "isDtks",

                "houseOwnership",
                "houseCondition",

                "dependentsCount",

                "isOrphan",
                "orphanType",

                "pipScore",
                "economicCategory",
                "scoringDetails",
                "scoredAt"
            )
            VALUES
            (
                COALESCE(
                    NULLIF(economic_record->>'id', ''),
                    gen_random_uuid()::TEXT
                ),

                auth_school_id,

                inserted_student_id,

                COALESCE(
                    NULLIF(
                        economic_record->>'hasKip',
                        ''
                    )::BOOLEAN,
                    FALSE
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
                    NULLIF(
                        economic_record->>'layakPip',
                        ''
                    )::BOOLEAN,
                    FALSE
                ),

                NULLIF(
                    economic_record->>'alasanLayakPip',
                    ''
                ),

                COALESCE(
                    NULLIF(
                        economic_record->>'hasKks',
                        ''
                    )::BOOLEAN,
                    FALSE
                ),

                NULLIF(
                    economic_record->>'kksNumber',
                    ''
                ),

                COALESCE(
                    NULLIF(
                        economic_record->>'hasPkh',
                        ''
                    )::BOOLEAN,
                    FALSE
                ),

                COALESCE(
                    NULLIF(
                        economic_record->>'isDtks',
                        ''
                    )::BOOLEAN,
                    FALSE
                ),

                NULLIF(
                    economic_record->>'houseOwnership',
                    ''
                ),

                NULLIF(
                    economic_record->>'houseCondition',
                    ''
                ),

                NULLIF(
                    economic_record->>'dependentsCount',
                    ''
                )::INTEGER,

                COALESCE(
                    NULLIF(
                        economic_record->>'isOrphan',
                        ''
                    )::BOOLEAN,
                    FALSE
                ),

                NULLIF(
                    economic_record->>'orphanType',
                    ''
                ),

                NULLIF(
                    economic_record->>'pipScore',
                    ''
                )::DOUBLE PRECISION,

                NULLIF(
                    economic_record->>'economicCategory',
                    ''
                ),

                CASE
                    WHEN economic_record ? 'scoringDetails'
                    THEN economic_record->'scoringDetails'
                    ELSE NULL
                END,

                NULLIF(
                    economic_record->>'scoredAt',
                    ''
                )::TIMESTAMP
            );

        END IF;


        success_count :=
            success_count + 1;

    END LOOP;


    RETURN jsonb_build_object(
        'success',
        TRUE,

        'count',
        success_count,

        'message',
        success_count ||
        ' siswa berhasil diimport.'
    );


EXCEPTION
    WHEN OTHERS THEN

        RETURN jsonb_build_object(
            'success',
            FALSE,

            'count',
            success_count,

            'message',
            SQLERRM
        );

END;
$$;


-- ====================================================================================
-- 31. SETUP TENANT BARU
--
-- Membuat:
-- 1. School
-- 2. Academic Year
-- 3. User SUPER_ADMIN
--
-- Dipanggil setelah auth.users berhasil dibuat.
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.setup_new_tenant(
    p_school_name TEXT,
    p_npsn TEXT,
    p_full_name TEXT,
    p_start_year INTEGER,
    p_end_year INTEGER
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE

    v_user_id TEXT;
    v_email TEXT;

    v_school_id TEXT;
    v_academic_year_id TEXT;

    v_existing_school_id TEXT;
    v_existing_user_school_id TEXT;

BEGIN

    -- ============================================================
    -- LOGIN
    -- ============================================================

    v_user_id :=
        auth.uid()::TEXT;


    IF v_user_id IS NULL THEN

        RAISE EXCEPTION
            'Akses ditolak. Anda harus login terlebih dahulu.';

    END IF;


    -- ============================================================
    -- EMAIL
    -- ============================================================

    v_email :=
        auth.jwt() ->> 'email';


    IF v_email IS NULL
       OR trim(v_email) = ''
    THEN

        RAISE EXCEPTION
            'Email akun tidak ditemukan.';

    END IF;


    -- ============================================================
    -- VALIDASI NAMA SEKOLAH
    -- ============================================================

    IF p_school_name IS NULL
       OR trim(p_school_name) = ''
    THEN

        RAISE EXCEPTION
            'Nama sekolah wajib diisi.';

    END IF;


    -- ============================================================
    -- VALIDASI NPSN
    -- ============================================================

    IF p_npsn IS NULL
       OR trim(p_npsn) = ''
    THEN

        RAISE EXCEPTION
            'NPSN wajib diisi.';

    END IF;


    IF length(trim(p_npsn)) < 8
       OR length(trim(p_npsn)) > 12
    THEN

        RAISE EXCEPTION
            'Format NPSN tidak valid.';

    END IF;


    -- ============================================================
    -- VALIDASI NAMA ADMIN
    -- ============================================================

    IF p_full_name IS NULL
       OR trim(p_full_name) = ''
    THEN

        RAISE EXCEPTION
            'Nama pengguna wajib diisi.';

    END IF;


    -- ============================================================
    -- VALIDASI TAHUN AJARAN
    -- ============================================================

    IF p_start_year IS NULL
       OR p_end_year IS NULL
       OR p_end_year <> p_start_year + 1
    THEN

        RAISE EXCEPTION
            'Tahun ajaran tidak valid.';

    END IF;


    -- ============================================================
    -- USER SUDAH MEMILIKI PROFILE?
    -- ============================================================

    SELECT
        u."schoolId"
    INTO
        v_existing_user_school_id
    FROM public.users u
    WHERE u."id" = v_user_id
    LIMIT 1;


    IF v_existing_user_school_id IS NOT NULL THEN

        RETURN jsonb_build_object(
            'success',
            FALSE,

            'code',
            'USER_ALREADY_SETUP',

            'message',
            'User sudah memiliki sekolah.',

            'schoolId',
            v_existing_user_school_id
        );

    END IF;


    -- ============================================================
    -- CEK NPSN
    -- ============================================================

    SELECT
        s."id"
    INTO
        v_existing_school_id
    FROM public.schools s
    WHERE s."npsn" = trim(p_npsn)
    LIMIT 1;


    IF v_existing_school_id IS NOT NULL THEN

        RETURN jsonb_build_object(
            'success',
            FALSE,

            'code',
            'NPSN_ALREADY_EXISTS',

            'message',
            'NPSN tersebut sudah terdaftar.'
        );

    END IF;


    -- ============================================================
    -- BUAT SEKOLAH
    -- ============================================================

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


    -- ============================================================
    -- BUAT TAHUN AJARAN
    -- ============================================================

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

        p_start_year ||
        '/' ||
        p_end_year,

        p_start_year,
        p_end_year,

        TRUE
    )
    RETURNING "id"
    INTO v_academic_year_id;


    -- ============================================================
    -- BUAT USER SUPER ADMIN
    -- ============================================================

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
        v_user_id,
        v_school_id,
        lower(trim(v_email)),
        trim(p_full_name),
        'SUPER_ADMIN',
        TRUE
    );


    -- ============================================================
    -- RETURN
    -- ============================================================

    RETURN jsonb_build_object(
        'success',
        TRUE,

        'schoolId',
        v_school_id,

        'academicYearId',
        v_academic_year_id,

        'userId',
        v_user_id,

        'message',
        'Institusi berhasil didaftarkan.'
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success',
            FALSE,

            'code',
            'DUPLICATE_DATA',

            'message',
            SQLERRM
        );

END;
$$;


-- ====================================================================================
-- 32. REVOKE / GRANT RPC
-- ====================================================================================

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


GRANT EXECUTE
ON FUNCTION public.get_user_school_id()
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.is_user_active()
TO authenticated;


GRANT EXECUTE
ON FUNCTION public.bulk_import_students(JSONB)
TO authenticated;


-- ====================================================================================
-- 33. ENABLE RLS
-- ====================================================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_class_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_parents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_economics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_bills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ====================================================================================
-- 34. SCHOOLS RLS
-- ====================================================================================

CREATE POLICY "schools_select_own"
ON public.schools
FOR SELECT
TO authenticated
USING (
    "id" = public.get_user_school_id()
);


CREATE POLICY "schools_update_own"
ON public.schools
FOR UPDATE
TO authenticated
USING (
    "id" = public.get_user_school_id()
)
WITH CHECK (
    "id" = public.get_user_school_id()
);


-- ====================================================================================
-- 35. USERS RLS
--
-- INSERT sengaja TIDAK diberikan kepada client.
-- Profile dibuat melalui setup_new_tenant().
-- ====================================================================================

CREATE POLICY "users_select_own"
ON public.users
FOR SELECT
TO authenticated
USING (
    "id" = auth.uid()::TEXT
);


CREATE POLICY "users_update_own"
ON public.users
FOR UPDATE
TO authenticated
USING (
    "id" = auth.uid()::TEXT
)
WITH CHECK (
    "id" = auth.uid()::TEXT
);


-- ====================================================================================
-- 36. ACADEMIC YEARS RLS
-- ====================================================================================

CREATE POLICY "academic_years_select"
ON public.academic_years
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_insert"
ON public.academic_years
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_update"
ON public.academic_years
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_delete"
ON public.academic_years
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 37. SEMESTERS RLS
-- ====================================================================================

CREATE POLICY "semesters_select"
ON public.semesters
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_insert"
ON public.semesters
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_update"
ON public.semesters
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_delete"
ON public.semesters
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 38. TEACHERS RLS
-- ====================================================================================

CREATE POLICY "teachers_select"
ON public.teachers
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_insert"
ON public.teachers
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_update"
ON public.teachers
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_delete"
ON public.teachers
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 39. CLASSES RLS
-- ====================================================================================

CREATE POLICY "classes_select"
ON public.classes
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_insert"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_update"
ON public.classes
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_delete"
ON public.classes
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 40. STUDENTS RLS
-- ====================================================================================

CREATE POLICY "students_select"
ON public.students
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_insert"
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_update"
ON public.students
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_delete"
ON public.students
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 41. STUDENT CLASS HISTORY RLS
-- ====================================================================================

CREATE POLICY "student_history_select"
ON public.student_class_history
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_insert"
ON public.student_class_history
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_update"
ON public.student_class_history
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_delete"
ON public.student_class_history
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 42. PARENTS RLS
-- ====================================================================================

CREATE POLICY "parents_select"
ON public.student_parents
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_insert"
ON public.student_parents
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_update"
ON public.student_parents
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_delete"
ON public.student_parents
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 43. ECONOMICS RLS
-- ====================================================================================

CREATE POLICY "economics_select"
ON public.student_economics
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_insert"
ON public.student_economics
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_update"
ON public.student_economics
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_delete"
ON public.student_economics
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 44. ATTENDANCES RLS
-- ====================================================================================

CREATE POLICY "attendances_select"
ON public.attendances
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_insert"
ON public.attendances
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_update"
ON public.attendances
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_delete"
ON public.attendances
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 45. ANNOUNCEMENTS RLS
-- ====================================================================================

CREATE POLICY "announcements_select"
ON public.announcements
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_insert"
ON public.announcements
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_update"
ON public.announcements
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_delete"
ON public.announcements
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 46. FEE TEMPLATES RLS
-- ====================================================================================

CREATE POLICY "fee_templates_select"
ON public.fee_templates
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_insert"
ON public.fee_templates
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_update"
ON public.fee_templates
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_delete"
ON public.fee_templates
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 47. STUDENT BILLS RLS
-- ====================================================================================

CREATE POLICY "student_bills_select"
ON public.student_bills
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_insert"
ON public.student_bills
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_update"
ON public.student_bills
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_delete"
ON public.student_bills
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 48. PAYMENT TRANSACTIONS RLS
-- ====================================================================================

CREATE POLICY "payments_select"
ON public.payment_transactions
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_insert"
ON public.payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_update"
ON public.payment_transactions
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_delete"
ON public.payment_transactions
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 49. AUDIT LOG RLS
-- ====================================================================================

CREATE POLICY "audit_logs_select"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "audit_logs_insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 50. REFRESH TOKENS RLS
--
-- Karena refresh token seharusnya tidak diakses langsung oleh browser,
-- tidak diberikan policy SELECT/INSERT/UPDATE/DELETE kepada authenticated.
-- ====================================================================================


-- ====================================================================================
-- 51. COMMENTS
-- ====================================================================================

COMMENT ON TABLE public.schools
IS 'Master sekolah / tenant aplikasi ERP.';


COMMENT ON TABLE public.academic_years
IS 'Master tahun ajaran per sekolah.';


COMMENT ON TABLE public.semesters
IS 'Semester dalam tahun ajaran.';


COMMENT ON TABLE public.users
IS 'Profile user aplikasi yang terhubung dengan Supabase Auth.';


COMMENT ON TABLE public.teachers
IS 'Master guru dan tenaga pendidik.';


COMMENT ON TABLE public.classes
IS 'Master kelas berdasarkan tahun ajaran.';


COMMENT ON TABLE public.students
IS 'Master data siswa.';


COMMENT ON TABLE public.student_class_history
IS 'Riwayat kelas siswa berdasarkan tahun ajaran.';


COMMENT ON TABLE public.student_parents
IS 'Data orang tua/wali siswa.';


COMMENT ON TABLE public.student_economics
IS 'Data sosial ekonomi dan indikator PIP siswa.';


COMMENT ON TABLE public.attendances
IS 'Absensi harian siswa.';


COMMENT ON TABLE public.announcements
IS 'Pengumuman sekolah.';


COMMENT ON TABLE public.fee_templates
IS 'Template jenis tagihan/pembayaran sekolah.';


COMMENT ON TABLE public.student_bills
IS 'Tagihan individual siswa.';


COMMENT ON TABLE public.payment_transactions
IS 'Transaksi pembayaran tagihan siswa.';


COMMENT ON TABLE public.audit_logs
IS 'Log aktivitas perubahan data aplikasi.';


-- ====================================================================================
-- 52. FINAL DATABASE CHECK
-- ====================================================================================

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
          'refresh_tokens',
          'teachers',
          'classes',
          'students',
          'student_class_history',
          'student_parents',
          'student_economics',
          'attendances',
          'announcements',
          'fee_templates',
          'student_bills',
          'payment_transactions',
          'audit_logs'
      );


    IF v_count <> 17 THEN

        RAISE EXCEPTION
            'Database ERP gagal lengkap. Ditemukan % dari 17 tabel.',
            v_count;

    END IF;


    RAISE NOTICE
        '====================================================';

    RAISE NOTICE
        'DATABASE SEKOLAH ERP v3 BERHASIL DIBUAT';

    RAISE NOTICE
        '17 tabel utama tersedia.';

    RAISE NOTICE
        'RLS aktif.';

    RAISE NOTICE
        'Tenant isolation aktif.';

    RAISE NOTICE
        'Payment trigger aktif.';

    RAISE NOTICE
        'Bulk import RPC aktif.';

    RAISE NOTICE
        'Setup tenant RPC aktif.';

    RAISE NOTICE
        '====================================================';

END;
$$;


-- ====================================================================================
-- 53. OPTIONAL VERIFICATION QUERY
-- ====================================================================================

SELECT
    table_name
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
      'student_parents',
      'student_economics',
      'attendances',
      'announcements',
      'fee_templates',
      'student_bills',
      'payment_transactions',
      'audit_logs'
  )
ORDER BY table_name;


-- ====================================================================================
-- SELESAI
-- ====================================================================================