-- Hapus tabel lama yang berelasi jika Anda ingin reset (Hati-hati di Production)
DROP TABLE IF EXISTS "payment_transactions", "student_bills", "fee_templates", "announcements", "attendances", "student_economics", "student_parents", "students", "classes", "teachers", "audit_logs", "refresh_tokens", "users", "semesters", "academic_years", "schools" CASCADE;

-- 1. Master Data
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "semesters" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
    "academicYearId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- 2. Users & Auth
CREATE TABLE "users" (
    "id" TEXT NOT NULL, -- Idealnya ini sama dengan UUID dari auth.users Supabase
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

CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
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

-- 3. Teachers & Classes
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "major" TEXT,
    "homeroomTeacherId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 36,
    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- 4. STUDENTS
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
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
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
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

CREATE TABLE "student_economics" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
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
    "scoringDetails" TEXT,
    "scoredAt" TIMESTAMP(3),
    CONSTRAINT "student_economics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- 5. Finance & Announcements
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "fee_templates" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "student_bills" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
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

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL, -- DITAMBAHKAN
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

-- 6. Indexes & Unique Constraints
CREATE UNIQUE INDEX "schools_npsn_key" ON "schools"("npsn");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE UNIQUE INDEX "students_schoolId_nisn_key" ON "students"("schoolId", "nisn");
CREATE UNIQUE INDEX "students_schoolId_nis_key" ON "students"("schoolId", "nis");
CREATE UNIQUE INDEX "students_nik_key" ON "students"("nik");
CREATE UNIQUE INDEX "student_economics_studentId_key" ON "student_economics"("studentId");
CREATE UNIQUE INDEX "attendances_studentId_date_key" ON "attendances"("studentId", "date");

-- 7. Foreign Keys 
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroomTeacherId_fkey" FOREIGN KEY ("homeroomTeacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_economics" ADD CONSTRAINT "student_economics_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_economics" ADD CONSTRAINT "student_economics_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_bills" ADD CONSTRAINT "student_bills_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_bills" ADD CONSTRAINT "student_bills_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_bills" ADD CONSTRAINT "student_bills_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_billId_fkey" FOREIGN KEY ("billId") REFERENCES "student_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1. Aktifkan RLS untuk semua tabel Multi-Tenant
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_economics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;

-- 2. Buat Fungsi Bantuan untuk mendapatkan School ID dari User yang sedang Login
-- Fungsi ini mengecek auth.uid() (token user yang sedang login), mencarinya di tabel users, lalu mengembalikan schoolId-nya.
CREATE OR REPLACE FUNCTION get_user_school_id() 
RETURNS TEXT AS $$
  SELECT "schoolId" FROM public.users WHERE "id" = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Terapkan Kebijakan Keamanan (Policy) agar User hanya bisa melihat data Sekolahnya sendiri
-- TAHUN AJARAN
CREATE POLICY "Isolate academic_years by school" ON "academic_years" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- SEMESTER
CREATE POLICY "Isolate semesters by school" ON "semesters" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- GURU
CREATE POLICY "Isolate teachers by school" ON "teachers" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- KELAS
CREATE POLICY "Isolate classes by school" ON "classes" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- SISWA
CREATE POLICY "Isolate students by school" ON "students" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- ORANG TUA SISWA
CREATE POLICY "Isolate student_parents by school" ON "student_parents" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- DATA EKONOMI SISWA
CREATE POLICY "Isolate student_economics by school" ON "student_economics" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- ABSENSI
CREATE POLICY "Isolate attendances by school" ON "attendances" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- MASTER TAGIHAN (FEE TEMPLATES)
CREATE POLICY "Isolate fee_templates by school" ON "fee_templates" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- TAGIHAN SISWA
CREATE POLICY "Isolate student_bills by school" ON "student_bills" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- TRANSAKSI PEMBAYARAN
CREATE POLICY "Isolate payment_transactions by school" ON "payment_transactions" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- PENGUMUMAN
CREATE POLICY "Isolate announcements by school" ON "announcements" 
FOR ALL USING ("schoolId" = get_user_school_id());

-- 1. Aktifkan RLS untuk tabel schools dan users
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- 2. Izin untuk tabel SCHOOLS (Hanya buat dan lihat sekolahnya sendiri)
CREATE POLICY "Allow user to create school" ON "schools" 
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow users to view their school" ON "schools" 
FOR SELECT TO authenticated USING ("id" = get_user_school_id());

CREATE POLICY "Allow users to update their school" ON "schools" 
FOR UPDATE TO authenticated USING ("id" = get_user_school_id());

-- 3. Izin untuk tabel USERS (User hanya boleh melihat/mengubah datanya sendiri)
CREATE POLICY "Allow users to view own profile" ON "users" 
FOR SELECT TO authenticated USING ("id" = auth.uid()::text);

CREATE POLICY "Allow users to insert own profile" ON "users" 
FOR INSERT TO authenticated WITH CHECK ("id" = auth.uid()::text);

CREATE POLICY "Allow users to update own profile" ON "users" 
FOR UPDATE TO authenticated USING ("id" = auth.uid()::text);

-- 1. Hapus aturan lama yang terlalu ketat saat membaca data sekolah
DROP POLICY IF EXISTS "Allow users to view their school" ON "schools";

-- 2. Ganti dengan aturan baru: Semua user yang sudah login (authenticated) boleh MEMBACA data sekolah
-- (Catatan: Untuk Mengubah/Update tetap hanya bisa dilakukan oleh Super Admin sekolah tersebut)
CREATE POLICY "Allow users to view their school" ON "schools" 
FOR SELECT TO authenticated USING (true);

-- 3. Memastikan fungsi UPSERT user berjalan lancar saat menyambungkan ID Sekolah
DROP POLICY IF EXISTS "Allow users to insert own profile" ON "users";
CREATE POLICY "Allow users to insert own profile" ON "users" 
FOR INSERT TO authenticated WITH CHECK ("id" = auth.uid()::text);

-- Memerintahkan Supabase untuk selalu membuatkan UUID otomatis jika aplikasi React tidak mengirimkannya
ALTER TABLE "academic_years" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "classes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "students" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "teachers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Mengubah fungsi import massal agar berjalan dengan hak akses penuh (bypassing RLS during import)
ALTER FUNCTION bulk_import_students(jsonb) SECURITY DEFINER;

-- Membuat ID otomatis untuk tabel Orang Tua
ALTER TABLE "student_parents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Sekalian kita buat untuk tabel Ekonomi agar tidak terjadi error yang sama di tahap selanjutnya
ALTER TABLE "student_economics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- 1. Mengatur agar tabel orang tua membuat ID otomatis
ALTER TABLE public.student_parents 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Mengatur agar tabel ekonomi/kesejahteraan membuat ID otomatis
ALTER TABLE public.student_economics 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- (Opsional) Berjaga-jaga jika tabel utama students juga belum memiliki default UUID
ALTER TABLE public.students 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 1. Membuat fungsi pintar untuk menyalin schoolId dari tabel students
CREATE OR REPLACE FUNCTION set_school_id_from_student()
RETURNS TRIGGER AS $$
BEGIN
  -- Jika schoolId kosong (null), maka ambil otomatis dari tabel students
  IF NEW."schoolId" IS NULL THEN
    SELECT "schoolId" INTO NEW."schoolId"
    FROM public.students
    WHERE id = NEW."studentId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Pasang fungsi otomatis ini ke tabel student_parents
DROP TRIGGER IF EXISTS trigger_set_school_id_parents ON public.student_parents;
CREATE TRIGGER trigger_set_school_id_parents
BEFORE INSERT ON public.student_parents
FOR EACH ROW
EXECUTE FUNCTION set_school_id_from_student();

-- 3. Pasang fungsi otomatis ini ke tabel student_economics
DROP TRIGGER IF EXISTS trigger_set_school_id_economics ON public.student_economics;
CREATE TRIGGER trigger_set_school_id_economics
BEFORE INSERT ON public.student_economics
FOR EACH ROW
EXECUTE FUNCTION set_school_id_from_student();