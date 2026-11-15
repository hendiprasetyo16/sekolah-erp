# 🗺️ Rencana Implementasi: Sistem Informasi Sekolah (Multi-Tenant)

## 🎯 Tujuan & Standar Arsitektur

1. **Arsitektur Multi-Tenant (Berbasis `schoolId`)**: Memastikan seluruh data dari Master Akademik hingga Transaksi Operasional terisolasi aman per sekolah menggunakan Supabase RLS dan *composite foreign key*.
2. **Penyempurnaan Bertahap (Iterative)**: Menyelesaikan modul satu per satu hingga stabil dan bebas *bug* sebelum melangkah ke modul berikutnya.
3. **Fleksibilitas Multi-Jenjang & Multi-Role**: Mendukung penuh 11 jenjang satuan pendidikan (**TK, RA, SD, MI, SMP, MTs, SMA, MA, SMK, SLB, PKBM**) beserta pemetaan tingkat otomatis (`0–12`) dan rangkap tugas PTK (`additionalRoles` & `tugasTambahan`).

> [!WARNING]
> **Standar Wajib Pengembangan Frontend:**
> * Setiap query Supabase pada tabel operasional wajib menyertakan filter `schoolId` aktif.
> * Seluruh *Query Keys* pada TanStack Query wajib menyertakan `schoolId` (contoh: `['schedules', schoolId]`) agar *cache* tidak bocor saat perpindahan akun/sekolah.
> * Gunakan konstanta terpusat dari `src/constants/school.constants.ts` untuk validasi dan tampilan jenjang/tingkat.

---

## 🛠️ Roadmap & Status Eksekusi

### Fase 1: Fondasi Database, Master Akademik, Manajemen User, Siswa & Guru — ✅ Selesai
- **Database Schema v14+ / v17**: 26 tabel lengkap dengan RLS, *triggers*, dan RPC di `supabase_schema.sql`.
- **Autentikasi & Multi-Tenant (`auth`)**: Login fleksibel (Email/NUPTK/NIP/NIK/NISN/NIS) dan konsol pemilihan/pendaftaran satuan pendidikan.
- **Dashboard & Profil (`dashboard`, `profile`)**: Ringkasan data sekolah dan pengaturan akun pengguna.
- **Data Master Akademik (`academic`)**: CRUD Profil Sekolah (beserta titik GPS & radius absensi), Tahun Ajaran, Semester, Kelas/Rombel (filter tingkat dinamis per jenjang), dan Mata Pelajaran.
- **Manajemen Akun & Multi-Role (`admin`)**: Pengelolaan pengguna, penetapan `role` utama dan `additionalRoles`, serta sinkronisasi hak akses menu.
- **Modul Siswa & Guru (`students`, `teachers`)**: CRUD lengkap, relasi orang tua, kesejahteraan/PIP/Desil, impor massal Dapodik, dan manajemen data PTK.

### Fase 2: Modul Jadwal Pelajaran & Absensi — 🔜 Dikerjakan Berikutnya
- **Modul Jadwal Pelajaran (`/schedules/*`)**:
  - Penyusunan jadwal pelajaran per kelas, hari, jam pelajaran (`startTime`–`endTime`), mata pelajaran, guru pengampu, dan ruangan.
  - Validasi otomatis untuk mencegah bentrok jadwal guru maupun bentrok ruangan di jam yang sama.
  - Tampilan jadwal khusus untuk Guru (jadwal mengajar saya) dan Siswa/Orang Tua.
- **Modul Absensi (`/attendance/*`)**:
  - Input presensi harian/per-sesi siswa per kelas (`HADIR`, `SAKIT`, `IZIN`, `ALPA`) oleh Wali Kelas atau Guru Mata Pelajaran.
  - Presensi mandiri Guru & Tendik berbasis koordinat GPS perangkat, validasi jarak menggunakan rumus Haversine terhadap titik koordinat & `attendanceRadiusMeters` sekolah, serta bukti foto selfie.

### Fase 3: Modul Keuangan, Sarpras, Perpustakaan & Persuratan TU — ⏳ Terjadwal
- **Modul Keuangan (`/finance/*`)**:
  - Pengaturan template biaya (`fee_templates`) dinamis per jenjang/tingkat kelas.
  - *Generate* tagihan siswa (`student_bills`) per periode.
  - Antarmuka kasir untuk pencatatan pembayaran cicilan maupun pelunasan (`payment_transactions`).
- **Modul Inventaris & Sarpras (`/inventory/*`)**:
  - Manajemen daftar aset dan pencatatan transaksi barang masuk/keluar (`inventory_transactions`).
- **Modul Perpustakaan (`/library/*`)**:
  - Katalog buku (`library_books`) dan sirkulasi peminjaman/pengembalian buku siswa & guru (`library_loans`).
- **Modul Persuratan TU & Beasiswa (`/correspondence/*`, `/scholarships/*`)**:
  - Pengarsipan surat masuk/keluar dan pencatatan beasiswa non-PIP.

### Fase 4: Laporan, Pengaturan Lanjutan & Optimasi Mobile APK — ⏳ Terjadwal
- **Modul Laporan (`/reports/*`)**: Rekapitulasi presensi bulanan/semester, laporan arus kas/tunggakan SPP, statistik siswa & PTK, serta ekspor Excel/PDF.
- **Pengaturan Sistem (`/settings/*`)**: Audit log aktivitas dan konfigurasi lanjutan sistem.
- **Optimasi Android APK (Capacitor)**: Penyempurnaan akses kamera & GPS *native* pada Android untuk presensi guru dan pemantauan orang tua/siswa.