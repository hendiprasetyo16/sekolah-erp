-- ============================================================
-- Supabase Seed Data: Kelas, Siswa, Guru, Keuangan
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================

-- Gunakan schoolId dan academicYearId dari setup sebelumnya
DO $$ 
DECLARE
    v_school_id TEXT := 'school-001';
    v_ay_id TEXT := 'ay-2025-2026';
    v_teacher_1_id TEXT := uuid_generate_v4()::TEXT;
    v_teacher_2_id TEXT := uuid_generate_v4()::TEXT;
    v_teacher_3_id TEXT := uuid_generate_v4()::TEXT;
    v_class_1_id TEXT := uuid_generate_v4()::TEXT;
    v_class_2_id TEXT := uuid_generate_v4()::TEXT;
    v_class_3_id TEXT := uuid_generate_v4()::TEXT;
    v_student_1_id TEXT := uuid_generate_v4()::TEXT;
    v_student_2_id TEXT := uuid_generate_v4()::TEXT;
    v_student_3_id TEXT := uuid_generate_v4()::TEXT;
    v_student_4_id TEXT := uuid_generate_v4()::TEXT;
    v_fee_1_id TEXT := uuid_generate_v4()::TEXT;
    v_fee_2_id TEXT := uuid_generate_v4()::TEXT;
    v_bill_1_id TEXT := uuid_generate_v4()::TEXT;
    v_bill_2_id TEXT := uuid_generate_v4()::TEXT;
BEGIN

    -- 1. Insert Teachers
    INSERT INTO "teachers" ("id", "schoolId", "nuptk", "nip", "fullName", "nik", "gender", "birthDate", "birthPlace", "address", "phone", "email", "education", "major", "university", "status", "position", "isCertified", "joinDate", "isActive", "baseSalary", "maxHoursPerWeek")
    VALUES
        (v_teacher_1_id, v_school_id, '1234567890', '198001012005011001', 'Budi Santoso, S.Pd.', '3273010101800001', 'L', '1980-01-01', 'Bandung', 'Jl. Merdeka No. 1', '081234567890', 'budi@sekolah.sch.id', 'S1', 'Pendidikan Matematika', 'UPI', 'PNS', 'GURU_TETAP', true, '2010-07-01', true, 4500000, 24),
        (v_teacher_2_id, v_school_id, '0987654321', '198502022010012002', 'Siti Aminah, M.Pd.', '3273020202850002', 'P', '1985-02-02', 'Jakarta', 'Jl. Sudirman No. 2', '081298765432', 'siti@sekolah.sch.id', 'S2', 'Pendidikan Bahasa Inggris', 'UNJ', 'GTY', 'GURU_TETAP', true, '2012-07-01', true, 4000000, 24),
        (v_teacher_3_id, v_school_id, '1122334455', NULL, 'Agus Pratama, S.Kom.', '3273030303900003', 'L', '1990-03-03', 'Surabaya', 'Jl. Pahlawan No. 3', '081311223344', 'agus@sekolah.sch.id', 'S1', 'Teknik Informatika', 'ITS', 'HONORER', 'GURU_HONORER', false, '2020-07-01', true, 2500000, 12);

    -- 2. Insert Classes
    INSERT INTO "classes" ("id", "schoolId", "academicYearId", "name", "gradeLevel", "major", "homeroomTeacherId", "capacity")
    VALUES
        (v_class_1_id, v_school_id, v_ay_id, '10A', 10, 'UMUM', v_teacher_1_id, 32),
        (v_class_2_id, v_school_id, v_ay_id, '11A', 11, 'UMUM', v_teacher_2_id, 32),
        (v_class_3_id, v_school_id, v_ay_id, '12A', 12, 'UMUM', v_teacher_3_id, 32);

    -- 3. Insert Students
    INSERT INTO "students" ("id", "schoolId", "nisn", "nik", "noKk", "fullName", "nickname", "gender", "birthDate", "birthPlace", "religion", "address", "city", "province", "phone", "email", "status", "entryDate", "classId")
    VALUES
        (v_student_1_id, v_school_id, '0051234567', '3273040404050004', '3273040404050000', 'Ahmad Rizal', 'Rizal', 'L', '2005-04-04', 'Bandung', 'ISLAM', 'Jl. Cempaka No. 4', 'Bandung', 'Jawa Barat', '081412345678', 'rizal@siswa.com', 'AKTIF', '2023-07-15', v_class_1_id),
        (v_student_2_id, v_school_id, '0069876543', '3273050505060005', '3273050505060000', 'Dina Amelia', 'Dina', 'P', '2006-05-05', 'Jakarta', 'ISLAM', 'Jl. Melati No. 5', 'Bandung', 'Jawa Barat', '081598765432', 'dina@siswa.com', 'AKTIF', '2023-07-15', v_class_1_id),
        (v_student_3_id, v_school_id, '0041122334', '3273060606040006', '3273060606040000', 'Kevin Sanjaya', 'Kevin', 'L', '2004-06-06', 'Surabaya', 'KRISTEN', 'Jl. Mawar No. 6', 'Bandung', 'Jawa Barat', '081611223344', 'kevin@siswa.com', 'AKTIF', '2022-07-15', v_class_2_id),
        (v_student_4_id, v_school_id, '0039988776', '3273070707030007', '3273070707030000', 'Putri Ayu', 'Putri', 'P', '2003-07-07', 'Yogyakarta', 'ISLAM', 'Jl. Kenanga No. 7', 'Bandung', 'Jawa Barat', '081799887766', 'putri@siswa.com', 'AKTIF', '2021-07-15', v_class_3_id);

    -- 4. Insert Student Parents
    INSERT INTO "student_parents" ("id", "studentId", "relation", "fullName", "phone", "occupation", "isAlive")
    VALUES
        (uuid_generate_v4()::TEXT, v_student_1_id, 'AYAH', 'Haryanto', '081812345678', 'WIRASWASTA', true),
        (uuid_generate_v4()::TEXT, v_student_2_id, 'IBU', 'Sri Mulyani', '081998765432', 'IBU_RUMAH_TANGGA', true);

    -- 5. Insert Fee Templates (Tarif Pembayaran)
    INSERT INTO "fee_templates" ("id", "schoolId", "academicYearId", "gradeLevel", "name", "category", "amount", "description")
    VALUES
        (v_fee_1_id, v_school_id, v_ay_id, 10, 'SPP Bulan Juli', 'SPP', 350000, 'SPP Wajib Kelas 10'),
        (v_fee_2_id, v_school_id, v_ay_id, 10, 'Uang Gedung', 'BANGUNAN', 1500000, 'Uang Pangkal');

    -- 6. Insert Student Bills (Tagihan Siswa)
    INSERT INTO "student_bills" ("id", "studentId", "title", "totalAmount", "paidAmount", "status", "dueDate", "academicYearId")
    VALUES
        (v_bill_1_id, v_student_1_id, 'SPP Bulan Juli', 350000, 350000, 'LUNAS', '2025-07-10', v_ay_id),
        (v_bill_2_id, v_student_2_id, 'Uang Gedung', 1500000, 500000, 'SEBAGIAN', '2025-12-31', v_ay_id);

    -- 7. Insert Payment Transactions (Riwayat Transaksi)
    INSERT INTO "payment_transactions" ("id", "billId", "studentId", "amount", "paymentMethod", "paymentDate", "reference", "recordedBy", "status")
    VALUES
        (uuid_generate_v4()::TEXT, v_bill_1_id, v_student_1_id, 350000, 'TRANSFER', '2025-07-05 10:00:00', 'TRX-12345', 'user-003', 'BERHASIL'),
        (uuid_generate_v4()::TEXT, v_bill_2_id, v_student_2_id, 500000, 'TUNAI', '2025-07-08 14:30:00', 'KW-001', 'user-003', 'BERHASIL');

END $$;
