-- ====================================================================================
-- DATABASE SEKOLAH ERP v2
-- FINAL / STABLE FOUNDATION
-- Supabase PostgreSQL
--
-- FITUR:
-- - Multi School / Multi Tenant
-- - Supabase Auth
-- - Master Sekolah
-- - Tahun Ajaran
-- - Semester
-- - Guru
-- - Kelas
-- - Siswa
-- - Orang Tua
-- - Data Ekonomi
-- - Histori Kelas Siswa
-- - Absensi
-- - Template Tagihan
-- - Tagihan Siswa
-- - Transaksi Pembayaran
-- - Pengumuman
-- - Audit Log
-- - Bulk Import Siswa
-- - RLS ketat berbasis schoolId
--
-- CATATAN:
-- Semua nama kolom mengikuti struktur aplikasi Anda:
-- schoolId, academicYearId, classId, dll.
-- ====================================================================================


-- ====================================================================================
-- 0. EXTENSION
-- ====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ====================================================================================
-- 1. RESET DATABASE
-- ====================================================================================

DROP TABLE IF EXISTS
    "payment_transactions",
    "student_bills",
    "fee_templates",
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


-- ====================================================================================
-- 2. MASTER SEKOLAH
-- ====================================================================================

CREATE TABLE "schools" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 3. TAHUN AJARAN
-- ====================================================================================

CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "academic_years_year_check"
        CHECK ("endYear" = "startYear" + 1)
);


-- ====================================================================================
-- 4. SEMESTER
-- ====================================================================================

CREATE TABLE "semesters" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "semesters_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "semesters_type_check"
        CHECK ("type" IN ('GANJIL', 'GENAP')),

    CONSTRAINT "semesters_date_check"
        CHECK ("endDate" > "startDate")
);


-- ====================================================================================
-- 5. USERS
-- ID HARUS SAMA DENGAN auth.users.id
-- ====================================================================================

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 6. REFRESH TOKENS
-- ====================================================================================

CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 7. AUDIT LOG
-- ====================================================================================

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
-- 8. GURU / TENAGA PENDIDIK
-- ====================================================================================

CREATE TABLE "teachers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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

    "baseSalary" NUMERIC(15,2),

    "subjects" TEXT,

    "maxHoursPerWeek" INTEGER NOT NULL DEFAULT 24,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 9. KELAS
-- ====================================================================================

CREATE TABLE "classes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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

    CONSTRAINT "classes_capacity_check"
        CHECK ("capacity" > 0)
);


-- ====================================================================================
-- 10. SISWA
-- ====================================================================================

CREATE TABLE "students" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

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

    -- Kelas aktif saat ini
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
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 11. HISTORI KELAS SISWA
-- ====================================================================================

CREATE TABLE "student_class_history" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_class_history_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 12. ORANG TUA
-- ====================================================================================

CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

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

    "isAlive" BOOLEAN NOT NULL DEFAULT true,

    "address" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 13. DATA EKONOMI
-- ====================================================================================

CREATE TABLE "student_economics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

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

    "scoredAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_economics_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 14. ABSENSI
-- ====================================================================================

CREATE TABLE "attendances" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    "date" TIMESTAMP(3) NOT NULL,

    "status" TEXT NOT NULL,

    "notes" TEXT,

    "recordedBy" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 15. PENGUMUMAN
-- ====================================================================================

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,

    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    "target" TEXT NOT NULL DEFAULT 'SEMUA',

    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    "publishDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireDate" TIMESTAMP(3),

    "createdBy" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey"
        PRIMARY KEY ("id")
);


-- ====================================================================================
-- 16. TEMPLATE PEMBAYARAN
-- ====================================================================================

CREATE TABLE "fee_templates" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,

    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    -- NULL = semua tingkat
    -- 1 = tingkat 1
    -- 2 = tingkat 2
    -- dst.
    "gradeLevel" INTEGER,

    "amount" NUMERIC(15,2) NOT NULL,

    -- BULANAN
    -- TAHUNAN
    -- SEKALI_BAYAR
    "periodType" TEXT NOT NULL DEFAULT 'BULANAN',

    "description" TEXT,

    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_templates_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "fee_templates_amount_check"
        CHECK ("amount" >= 0),

    CONSTRAINT "fee_templates_period_check"
        CHECK (
            "periodType"
            IN ('BULANAN', 'TAHUNAN', 'SEKALI_BAYAR')
        )
);


-- ====================================================================================
-- 17. TAGIHAN SISWA
-- ====================================================================================

CREATE TABLE "student_bills" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    "feeTemplateId" TEXT NOT NULL,

    "academicYearId" TEXT NOT NULL,

    "title" TEXT NOT NULL,

    -- 1-12 untuk tagihan bulanan
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
                "periodMonth" >= 1
                AND "periodMonth" <= 12
            )
        ),

    CONSTRAINT "student_bills_status_check"
        CHECK (
            "status"
            IN (
                'BELUM_BAYAR',
                'CICILAN',
                'LUNAS',
                'DIBATALKAN'
            )
        )
);


-- ====================================================================================
-- 18. TRANSAKSI PEMBAYARAN
-- ====================================================================================

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

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
            "status"
            IN (
                'BERHASIL',
                'DIBATALKAN'
            )
        )
);


-- ====================================================================================
-- 19. UNIQUE INDEX
-- ====================================================================================

CREATE UNIQUE INDEX "schools_npsn_key"
ON "schools"("npsn");


CREATE UNIQUE INDEX "users_email_key"
ON "users"("email");


CREATE UNIQUE INDEX "refresh_tokens_token_key"
ON "refresh_tokens"("token");


CREATE UNIQUE INDEX "students_schoolId_nisn_key"
ON "students"("schoolId", "nisn");


CREATE UNIQUE INDEX "students_schoolId_nis_key"
ON "students"("schoolId", "nis")
WHERE "nis" IS NOT NULL;


CREATE UNIQUE INDEX "students_schoolId_nik_key"
ON "students"("schoolId", "nik");


CREATE UNIQUE INDEX "student_economics_studentId_key"
ON "student_economics"("studentId");


CREATE UNIQUE INDEX "student_class_history_unique"
ON "student_class_history"
(
    "studentId",
    "academicYearId"
);


CREATE UNIQUE INDEX "attendances_student_date_key"
ON "attendances"
(
    "studentId",
    "date"
);


-- Mencegah template pembayaran yang sama dibuat berkali-kali
CREATE UNIQUE INDEX "fee_templates_unique"
ON "fee_templates"
(
    "schoolId",
    "academicYearId",
    "name",
    "gradeLevel"
);


-- Mencegah tagihan yang sama dibuat dua kali
CREATE UNIQUE INDEX "student_bills_unique_period"
ON "student_bills"
(
    "studentId",
    "feeTemplateId",
    "academicYearId",
    "periodMonth",
    "periodYear"
);


-- ====================================================================================
-- 20. INDEX PERFORMA
-- ====================================================================================

CREATE INDEX "academic_years_schoolId_idx"
ON "academic_years"("schoolId");


CREATE INDEX "semesters_schoolId_idx"
ON "semesters"("schoolId");


CREATE INDEX "semesters_academicYearId_idx"
ON "semesters"("academicYearId");


CREATE INDEX "teachers_schoolId_idx"
ON "teachers"("schoolId");


CREATE INDEX "teachers_fullName_idx"
ON "teachers"("fullName");


CREATE INDEX "classes_schoolId_idx"
ON "classes"("schoolId");


CREATE INDEX "classes_academicYearId_idx"
ON "classes"("academicYearId");


CREATE INDEX "classes_homeroomTeacherId_idx"
ON "classes"("homeroomTeacherId");


CREATE INDEX "students_schoolId_idx"
ON "students"("schoolId");


CREATE INDEX "students_classId_idx"
ON "students"("classId");


CREATE INDEX "students_fullName_idx"
ON "students"("fullName");


CREATE INDEX "student_history_studentId_idx"
ON "student_class_history"("studentId");


CREATE INDEX "student_history_academicYearId_idx"
ON "student_class_history"("academicYearId");


CREATE INDEX "parents_studentId_idx"
ON "student_parents"("studentId");


CREATE INDEX "economics_studentId_idx"
ON "student_economics"("studentId");


CREATE INDEX "bills_schoolId_idx"
ON "student_bills"("schoolId");


CREATE INDEX "bills_studentId_idx"
ON "student_bills"("studentId");


CREATE INDEX "bills_academicYearId_idx"
ON "student_bills"("academicYearId");


CREATE INDEX "bills_status_idx"
ON "student_bills"("status");


CREATE INDEX "payments_billId_idx"
ON "payment_transactions"("billId");


CREATE INDEX "payments_studentId_idx"
ON "payment_transactions"("studentId");


CREATE INDEX "payments_schoolId_idx"
ON "payment_transactions"("schoolId");


-- ====================================================================================
-- 21. FOREIGN KEYS
-- ====================================================================================

ALTER TABLE "academic_years"
ADD CONSTRAINT "academic_years_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "semesters"
ADD CONSTRAINT "semesters_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "semesters"
ADD CONSTRAINT "semesters_academicYearId_fkey"
FOREIGN KEY ("academicYearId")
REFERENCES "academic_years"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "users"
ADD CONSTRAINT "users_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "teachers"
ADD CONSTRAINT "teachers_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "classes"
ADD CONSTRAINT "classes_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "classes"
ADD CONSTRAINT "classes_academicYearId_fkey"
FOREIGN KEY ("academicYearId")
REFERENCES "academic_years"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "classes"
ADD CONSTRAINT "classes_homeroomTeacherId_fkey"
FOREIGN KEY ("homeroomTeacherId")
REFERENCES "teachers"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "students"
ADD CONSTRAINT "students_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "students"
ADD CONSTRAINT "students_classId_fkey"
FOREIGN KEY ("classId")
REFERENCES "classes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


ALTER TABLE "student_class_history"
ADD CONSTRAINT "student_class_history_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_class_history"
ADD CONSTRAINT "student_class_history_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "student_class_history"
ADD CONSTRAINT "student_class_history_academicYearId_fkey"
FOREIGN KEY ("academicYearId")
REFERENCES "academic_years"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_class_history"
ADD CONSTRAINT "student_class_history_classId_fkey"
FOREIGN KEY ("classId")
REFERENCES "classes"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_parents"
ADD CONSTRAINT "student_parents_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_parents"
ADD CONSTRAINT "student_parents_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "student_economics"
ADD CONSTRAINT "student_economics_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_economics"
ADD CONSTRAINT "student_economics_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "attendances"
ADD CONSTRAINT "attendances_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "attendances"
ADD CONSTRAINT "attendances_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "announcements"
ADD CONSTRAINT "announcements_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "fee_templates"
ADD CONSTRAINT "fee_templates_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "fee_templates"
ADD CONSTRAINT "fee_templates_academicYearId_fkey"
FOREIGN KEY ("academicYearId")
REFERENCES "academic_years"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_bills"
ADD CONSTRAINT "student_bills_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_bills"
ADD CONSTRAINT "student_bills_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_bills"
ADD CONSTRAINT "student_bills_feeTemplateId_fkey"
FOREIGN KEY ("feeTemplateId")
REFERENCES "fee_templates"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "student_bills"
ADD CONSTRAINT "student_bills_academicYearId_fkey"
FOREIGN KEY ("academicYearId")
REFERENCES "academic_years"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_schoolId_fkey"
FOREIGN KEY ("schoolId")
REFERENCES "schools"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_billId_fkey"
FOREIGN KEY ("billId")
REFERENCES "student_bills"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "students"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- ====================================================================================
-- 22. FUNGSI SCHOOL ID USER LOGIN
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT "schoolId"
    FROM public.users
    WHERE "id" = auth.uid()::text
    LIMIT 1;
$$;


-- ====================================================================================
-- 23. FUNGSI USER LOGIN CHECK
-- ====================================================================================

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
            WHERE "id" = auth.uid()::text
        ),
        false
    );
$$;


-- ====================================================================================
-- 24. FUNGSI UPDATE updatedAt
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


-- ====================================================================================
-- 25. TRIGGER updatedAt
-- ====================================================================================

CREATE TRIGGER "schools_updatedAt"
BEFORE UPDATE ON "schools"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "academic_years_updatedAt"
BEFORE UPDATE ON "academic_years"
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


CREATE TRIGGER "fee_templates_updatedAt"
BEFORE UPDATE ON "fee_templates"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER "student_bills_updatedAt"
BEFORE UPDATE ON "student_bills"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ====================================================================================
-- 26. RLS AKTIF
-- ====================================================================================

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
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;


-- ====================================================================================
-- 27. RLS - SCHOOLS
-- ====================================================================================

CREATE POLICY "schools_select_own"
ON "schools"
FOR SELECT
TO authenticated
USING (
    "id" = public.get_user_school_id()
);


CREATE POLICY "schools_update_own"
ON "schools"
FOR UPDATE
TO authenticated
USING (
    "id" = public.get_user_school_id()
)
WITH CHECK (
    "id" = public.get_user_school_id()
);


-- ====================================================================================
-- 28. RLS - USERS
-- ====================================================================================

CREATE POLICY "users_select_own"
ON "users"
FOR SELECT
TO authenticated
USING (
    "id" = auth.uid()::text
);


CREATE POLICY "users_insert_own"
ON "users"
FOR INSERT
TO authenticated
WITH CHECK (
    "id" = auth.uid()::text
);


CREATE POLICY "users_update_own"
ON "users"
FOR UPDATE
TO authenticated
USING (
    "id" = auth.uid()::text
)
WITH CHECK (
    "id" = auth.uid()::text
);


-- ====================================================================================
-- 29. RLS - ACADEMIC YEARS
-- ====================================================================================

CREATE POLICY "academic_years_select"
ON "academic_years"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_insert"
ON "academic_years"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_update"
ON "academic_years"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "academic_years_delete"
ON "academic_years"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 30. RLS - SEMESTERS
-- ====================================================================================

CREATE POLICY "semesters_select"
ON "semesters"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_insert"
ON "semesters"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_update"
ON "semesters"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "semesters_delete"
ON "semesters"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 31. RLS - TEACHERS
-- ====================================================================================

CREATE POLICY "teachers_select"
ON "teachers"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_insert"
ON "teachers"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_update"
ON "teachers"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "teachers_delete"
ON "teachers"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 32. RLS - CLASSES
-- ====================================================================================

CREATE POLICY "classes_select"
ON "classes"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_insert"
ON "classes"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_update"
ON "classes"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "classes_delete"
ON "classes"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 33. RLS - STUDENTS
-- ====================================================================================

CREATE POLICY "students_select"
ON "students"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_insert"
ON "students"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_update"
ON "students"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "students_delete"
ON "students"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 34. RLS - STUDENT CLASS HISTORY
-- ====================================================================================

CREATE POLICY "student_history_select"
ON "student_class_history"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_insert"
ON "student_class_history"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_update"
ON "student_class_history"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_history_delete"
ON "student_class_history"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 35. RLS - PARENTS
-- ====================================================================================

CREATE POLICY "parents_select"
ON "student_parents"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_insert"
ON "student_parents"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_update"
ON "student_parents"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "parents_delete"
ON "student_parents"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 36. RLS - ECONOMICS
-- ====================================================================================

CREATE POLICY "economics_select"
ON "student_economics"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_insert"
ON "student_economics"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_update"
ON "student_economics"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "economics_delete"
ON "student_economics"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 37. RLS - ATTENDANCES
-- ====================================================================================

CREATE POLICY "attendances_select"
ON "attendances"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_insert"
ON "attendances"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_update"
ON "attendances"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "attendances_delete"
ON "attendances"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 38. RLS - ANNOUNCEMENTS
-- ====================================================================================

CREATE POLICY "announcements_select"
ON "announcements"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_insert"
ON "announcements"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_update"
ON "announcements"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "announcements_delete"
ON "announcements"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 39. RLS - FEE TEMPLATES
-- ====================================================================================

CREATE POLICY "fee_templates_select"
ON "fee_templates"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_insert"
ON "fee_templates"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_update"
ON "fee_templates"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "fee_templates_delete"
ON "fee_templates"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 40. RLS - STUDENT BILLS
-- ====================================================================================

CREATE POLICY "student_bills_select"
ON "student_bills"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_insert"
ON "student_bills"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_update"
ON "student_bills"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "student_bills_delete"
ON "student_bills"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 41. RLS - PAYMENT TRANSACTIONS
-- ====================================================================================

CREATE POLICY "payments_select"
ON "payment_transactions"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_insert"
ON "payment_transactions"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_update"
ON "payment_transactions"
FOR UPDATE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
)
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "payments_delete"
ON "payment_transactions"
FOR DELETE
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 42. RLS - AUDIT LOGS
-- ====================================================================================

CREATE POLICY "audit_logs_select"
ON "audit_logs"
FOR SELECT
TO authenticated
USING (
    "schoolId" = public.get_user_school_id()
);


CREATE POLICY "audit_logs_insert"
ON "audit_logs"
FOR INSERT
TO authenticated
WITH CHECK (
    "schoolId" = public.get_user_school_id()
);


-- ====================================================================================
-- 43. FUNCTION: UPDATE STATUS TAGIHAN
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.update_student_bill_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    bill_total NUMERIC(15,2);
    bill_paid NUMERIC(15,2);
BEGIN

    SELECT
        "totalAmount"
    INTO
        bill_total
    FROM public.student_bills
    WHERE "id" = NEW."billId";

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
    INTO
        bill_paid
    FROM public.payment_transactions
    WHERE "billId" = NEW."billId";

    UPDATE public.student_bills
    SET
        "paidAmount" = bill_paid,
        "status" =
            CASE
                WHEN bill_paid <= 0
                    THEN 'BELUM_BAYAR'

                WHEN bill_paid >= bill_total
                    THEN 'LUNAS'

                ELSE 'CICILAN'
            END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = NEW."billId";

    RETURN NEW;
END;
$$;


-- ====================================================================================
-- 44. TRIGGER STATUS PEMBAYARAN
-- ====================================================================================

CREATE TRIGGER "payment_update_bill_status"
AFTER INSERT OR UPDATE
ON "payment_transactions"
FOR EACH ROW
EXECUTE FUNCTION public.update_student_bill_status();


-- ====================================================================================
-- 45. FUNCTION: HAPUS / BATALKAN PEMBAYARAN
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.recalculate_bill_after_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_bill_id TEXT;
    bill_total NUMERIC(15,2);
    bill_paid NUMERIC(15,2);
BEGIN

    target_bill_id := COALESCE(NEW."billId", OLD."billId");

    SELECT
        "totalAmount"
    INTO
        bill_total
    FROM public.student_bills
    WHERE "id" = target_bill_id;

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
    INTO
        bill_paid
    FROM public.payment_transactions
    WHERE "billId" = target_bill_id;

    UPDATE public.student_bills
    SET
        "paidAmount" = bill_paid,
        "status" =
            CASE
                WHEN bill_paid <= 0
                    THEN 'BELUM_BAYAR'

                WHEN bill_paid >= bill_total
                    THEN 'LUNAS'

                ELSE 'CICILAN'
            END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = target_bill_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE TRIGGER "payment_recalculate_after_delete"
AFTER DELETE
ON "payment_transactions"
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_bill_after_payment_change();


-- ====================================================================================
-- 46. FUNCTION BULK IMPORT SISWA
-- ====================================================================================

DROP FUNCTION IF EXISTS public.bulk_import_students(jsonb);


CREATE OR REPLACE FUNCTION public.bulk_import_students(
    batch_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
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

    -- ------------------------------------------------------------
    -- Ambil schoolId berdasarkan user login
    -- ------------------------------------------------------------

    auth_school_id := public.get_user_school_id();

    IF auth_school_id IS NULL THEN

        RAISE EXCEPTION
            'User tidak terafiliasi dengan sekolah manapun.';

    END IF;


    -- ------------------------------------------------------------
    -- Loop siswa
    -- ------------------------------------------------------------

    FOR student_record IN
        SELECT *
        FROM jsonb_array_elements(batch_data)
    LOOP


        -- --------------------------------------------------------
        -- INSERT SISWA
        -- --------------------------------------------------------

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
            COALESCE(
                NULLIF(student_record->>'id', ''),
                gen_random_uuid()::text
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
                student_record->>'village',
                student_record->>'kelurahan'
            ),

            COALESCE(
                student_record->>'district',
                student_record->>'kecamatan'
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
        INTO inserted_student_id;


        -- --------------------------------------------------------
        -- INSERT ORANG TUA
        -- --------------------------------------------------------

        IF
            student_record ? 'parents'
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
                        gen_random_uuid()::text
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
                        parent_record->>'job',
                        parent_record->>'occupation'
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


        -- --------------------------------------------------------
        -- INSERT EKONOMI
        -- --------------------------------------------------------

        IF student_record ? 'economic' THEN

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

                "hasPkh"
            )

            VALUES
            (
                COALESCE(
                    NULLIF(economic_record->>'id', ''),
                    gen_random_uuid()::text
                ),

                auth_school_id,

                inserted_student_id,

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
                )
            );

        END IF;


        success_count :=
            success_count + 1;

    END LOOP;


    RETURN jsonb_build_object(
        'success', true,
        'count', success_count,
        'message',
        success_count || ' siswa berhasil diimport.'
    );


EXCEPTION
    WHEN OTHERS THEN

        RETURN jsonb_build_object(
            'success', false,
            'count', success_count,
            'message', SQLERRM
        );

END;
$$;


-- ====================================================================================
-- 47. GRANT FUNCTION
-- ====================================================================================

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
-- 48. COMMENT DATABASE
-- ====================================================================================

COMMENT ON TABLE "schools"
IS 'Master sekolah / tenant aplikasi.';


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


COMMENT ON TABLE "fee_templates"
IS 'Template jenis pembayaran sekolah.';


COMMENT ON TABLE "student_bills"
IS 'Tagihan individual siswa.';


COMMENT ON TABLE "payment_transactions"
IS 'Transaksi pembayaran siswa.';


-- ====================================================================================
-- SELESAI
-- ====================================================================================