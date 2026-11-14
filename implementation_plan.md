# 🗺️ Rencana Implementasi: Sistem Informasi Sekolah (Multi-Tenant)

## 🎯 Tujuan & Standar Arsitektur

1. **Arsitektur Multi-Tenant (Berbasis `schoolId`)**: Memastikan seluruh data dari Master Akademik hingga Transaksi Operasional terisolasi aman per sekolah menggunakan Supabase RLS dan *composite foreign key*.
2. **Penyempurnaan Bertahap (Iterative)**: Menyelesaikan modul satu per satu hingga stabil dan bebas *bug* sebelum melangkah ke modul berikutnya.
3. **Fleksibilitas Multi-Jenjang & Multi-Role**: Mendukung seluruh jenjang sekolah (**TK, SD, SMP, SMA, SMK**) serta rangkap tugas guru/tendik (`additionalRoles` & `tugasTambahan`).

> [!WARNING]
> **Standar Wajib Pengembangan Frontend:**
> * Setiap query Supabase pada tabel operasional wajib menyertakan filter `schoolId` aktif.
> * Seluruh *Query Keys* pada TanStack Query wajib menyertakan `schoolId` (contoh: `['teachers', schoolId]`) agar *cache* tidak bocor saat perpindahan akun/sekolah.

---

## 🛠️ Roadmap & Status Eksekusi

### Fase 1: Fondasi Database, Master Akademik, Siswa & Guru — ✅ Selesai
* **Database Schema v13.1**: 26 tabel lengkap dengan RLS, *triggers*, dan RPC di `supabase_schema.sql`.
* **Autentikasi & Dashboard**: Login fleksibel (Email/NUPTK/NIP/NIK/NISN/NIS) dan ringkasan dashboard.
* **Data Master Akademik**: CRUD Profil Sekolah, Tahun Ajaran, Semester, Kelas, dan Mata Pelajaran.
* **Modul Siswa & Guru (PTK)**: CRUD lengkap, relasi orang tua, kesejahteraan/PIP/Desil, impor massal Dapodik, dan manajemen data guru.

### Fase 2: Integrasi Multi-Role UI, Jadwal Pelajaran & Absensi — 🔜 Dikerjakan Berikutnya
* **Integrasi Multi-Role di Frontend**:
  * Memperbarui `authStore` dan `usePermission` agar membaca `role` utama + `additionalRoles` (via RPC `get_user_all_roles()`).
  * Menyinkronkan hak akses menu di `Sidebar` dan rute terproteksi.
  * Membuat UI manajemen akun pengguna & penetapan peran tambahan.
* **Modul Jadwal Pelajaran (`/schedules/*`)**:
  * Penyusunan jadwal per kelas, hari, jam pelajaran, mata pelajaran, guru pengampu, dan ruangan.
  * Validasi bentrok jadwal guru/kelas.
* **Modul Absensi (`/attendance/*`)**:
  * Input presensi harian siswa per kelas (Hadir, Sakit, Izin, Alpa) dan rekap kehadiran.
  * Presensi mandiri Guru & Tendik berbasis koordinat GPS, validasi radius sekolah (`attendanceRadiusMeters`), dan foto selfie.

### Fase 3: Modul Keuangan, Sarpras, Perpustakaan & Administrasi TU — ⏳ Terjadwal
* **Modul Keuangan (`/finance/*`)**:
  * Pengaturan template biaya (`fee_templates`) dinamis per jenjang/tingkat kelas.
  * *Generate* tagihan siswa (`student_bills`) per periode.
  * Antarmuka kasir untuk pencatatan pembayaran cicilan maupun pelunasan (`payment_transactions`).
* **Modul Inventaris & Sarpras (`/inventory/*`)**:
  * Manajemen daftar aset dan pencatatan transaksi barang masuk/keluar (`inventory_transactions`).
* **Modul Perpustakaan (`/library/*`)**:
  * Katalog buku (`library_books`) dan sirkulasi peminjaman/pengembalian buku siswa & guru (`library_loans`).
* **Modul Administrasi TU & Beasiswa (`/admin/*`, `/scholarships/*`)**:
  * Pengarsipan surat masuk/keluar dan pencatatan beasiswa non-PIP.

### Fase 4: Laporan, Pengaturan Lanjutan & Optimasi Mobile APK — ⏳ Terjadwal
* **Modul Laporan (`/reports/*`)**: Rekapitulasi presensi, laporan arus kas/tunggakan SPP, statistik siswa & PTK, serta ekspor Excel/PDF.
* **Pengaturan Sistem (`/settings/*`)**: Konfigurasi titik koordinat GPS sekolah, radius absensi, dan audit log aktivitas.
* **Optimasi Android APK (Capacitor)**: Penyempurnaan tampilan *mobile* untuk absensi GPS guru dan pemantauan oleh orang tua/siswa.