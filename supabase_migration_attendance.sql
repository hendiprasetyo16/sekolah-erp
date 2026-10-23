-- ============================================================
-- MIGRATION: Upgrade tabel attendances untuk mendukung:
--   1. Absensi guru (type = 'GURU') dengan GPS
--   2. Absensi siswa mandiri/kiosk (type = 'SISWA')  
--   3. Anti-fake GPS tracking
--   4. Koordinat sekolah untuk radius check
-- 
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================

-- ---- 1. TAMBAH KOLOM KE TABEL attendances ----

-- Kolom type: membedakan absen guru vs siswa
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'SISWA'
    CHECK ("type" IN ('SISWA', 'GURU'));

-- Kolom teacher_id untuk absen guru (nullable, hanya diisi jika type = 'GURU')
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "teacherId" UUID
    REFERENCES public.teachers("id") ON DELETE CASCADE;

-- Kolom waktu check-in dan check-out
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkInTime" TIMESTAMPTZ;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkOutTime" TIMESTAMPTZ;

-- Kolom GPS untuk guru
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkInLat" DOUBLE PRECISION;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkInLng" DOUBLE PRECISION;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkInDistance" DOUBLE PRECISION; -- dalam meter

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "isCheckInMock" BOOLEAN DEFAULT FALSE; -- true jika terdeteksi fake GPS

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS "checkInSelfieUrl" TEXT; -- URL foto selfie saat check-in

-- Buat studentId nullable (karena jika type='GURU', studentId tidak perlu diisi)
ALTER TABLE public.attendances
  ALTER COLUMN "studentId" DROP NOT NULL;

-- ---- 2. DROP constraint unique lama (studentId, date) ----
-- Yang lama tidak mendukung guru (karena studentId bisa null)
DROP INDEX IF EXISTS attendances_student_date_key;

-- ---- 3. Buat constraint unique baru yang lebih pintar ----
-- Untuk siswa: schoolId + studentId + date + type harus unik
-- Untuk guru: schoolId + teacherId + date + type harus unik
CREATE UNIQUE INDEX IF NOT EXISTS attendances_student_date_type_key
  ON public.attendances ("schoolId", "studentId", "date", "type")
  WHERE "studentId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendances_teacher_date_type_key
  ON public.attendances ("schoolId", "teacherId", "date", "type")
  WHERE "teacherId" IS NOT NULL;

-- ---- 4. Index tambahan untuk performa query ----
CREATE INDEX IF NOT EXISTS attendances_teacher_idx
  ON public.attendances ("teacherId");

CREATE INDEX IF NOT EXISTS attendances_type_idx
  ON public.attendances ("type");

-- ---- 5. TAMBAH KOLOM KOORDINAT KE TABEL schools ----
-- Untuk menentukan radius absensi guru

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS "attendanceRadiusMeters" INTEGER DEFAULT 200;

-- ---- 6. UPDATE RLS Policy untuk mendukung guru absen ----

-- Drop policy lama jika ada
DROP POLICY IF EXISTS attendances_manage ON public.attendances;
DROP POLICY IF EXISTS attendances_select ON public.attendances;

-- Policy: select - semua staff sekolah yang sama bisa lihat
CREATE POLICY attendances_select ON public.attendances
  FOR SELECT
  USING (
    "schoolId" IN (
      SELECT "schoolId" FROM public.users WHERE id = auth.uid()
    )
  );

-- Policy: insert - staf, guru, dan system bisa insert
CREATE POLICY attendances_insert ON public.attendances
  FOR INSERT
  WITH CHECK (
    "schoolId" IN (
      SELECT "schoolId" FROM public.users WHERE id = auth.uid()
    )
  );

-- Policy: update - hanya admin dan staff yang bisa update
CREATE POLICY attendances_update ON public.attendances
  FOR UPDATE
  USING (
    "schoolId" IN (
      SELECT u."schoolId" FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'WALI_KELAS', 'STAFF_TU')
    )
  );

-- ---- 7. Komentar dokumentasi ----
COMMENT ON COLUMN public.attendances."type" IS 'SISWA = absensi siswa, GURU = absensi guru/staf';
COMMENT ON COLUMN public.attendances."teacherId" IS 'Diisi jika type = GURU';
COMMENT ON COLUMN public.attendances."checkInLat" IS 'Latitude GPS saat check-in guru';
COMMENT ON COLUMN public.attendances."checkInLng" IS 'Longitude GPS saat check-in guru';
COMMENT ON COLUMN public.attendances."checkInDistance" IS 'Jarak dari sekolah saat check-in (meter)';
COMMENT ON COLUMN public.attendances."isCheckInMock" IS 'TRUE jika sistem mendeteksi fake GPS';
COMMENT ON COLUMN public.schools."latitude" IS 'Koordinat sekolah untuk radius absensi';
COMMENT ON COLUMN public.schools."longitude" IS 'Koordinat sekolah untuk radius absensi';
COMMENT ON COLUMN public.schools."attendanceRadiusMeters" IS 'Radius valid absensi GPS dalam meter (default: 200m)';

-- ============================================================
-- SELESAI! Jalankan di Supabase SQL Editor → Run
-- ============================================================
