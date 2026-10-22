# SekolahERP - Sistem Manajemen Sekolah Indonesia 🎓

Sistem ERP dan Manajemen Sekolah Indonesia modern, multi-tenant, dan siap produksi untuk jenjang **SD, SMP, SMA, dan SMK**. Aplikasi terhubung langsung secara real-time ke **Supabase (PostgreSQL + Auth + Row Level Security)** tanpa ketergantungan data dummy/mock.

---

## 🌟 Fitur Utama

- 🏫 **Multi-Tenant Architecture**: Isolasi data per sekolah menggunakan Row Level Security (RLS) PostgreSQL & Supabase Auth.
- 👥 **Manajemen Siswa Lengkap**: Profil komprehensif, riwayat kelas, data orang tua/wali, data fisik Dapodik, dan data ekonomi/kesejahteraan.
- 🎯 **Integrasi PIP & Desil (DTKS / P3KE Terbaru)**:
  - Penandaan penerima KIP, status usulan layak PIP, dan kategori **Desil 1 s/d 10**.
  - **Prioritas PIP Otomatis**: Desil 1 (Sangat Miskin), Desil 2 (Miskin), Desil 3 (Hampir Miskin), dan Desil 4 (Rentan Miskin).
  - Tampilan visual badge prioritas pada detail siswa, form entri, dashboard, serta parser import Excel.
- 📊 **Import & Export Data Siswa Massal**: Dukungan format Excel / CSV standar Dapodik Kemendikbudristek.
- 👨‍🏫 **Manajemen Pendidik & Tenaga Kependidikan**: Data NIP, NUPTK, status kepegawaian (PNS, CPNS, GTY, GTT, Honorer), sertifikasi, gaji pokok, dan beban jam mengajar.
- 💳 **Modul Keuangan Real-Time (Direct Supabase)**:
  - Tarif pembayaran / SPP (`fee_templates`)
  - Tagihan siswa (`student_bills`) dengan status `BELUM_BAYAR`, `CICILAN`, `LUNAS`, `DIBATALKAN`
  - Transaksi pembayaran kasir / transfer (`payment_transactions`)
  - Kalkulasi saldo kas, tunggakan tagihan, dan grafik arus kas dinamis tanpa data dummy
- 🔐 **Autentikasi & Otorisasi Bertingkat**:
  - Role: `SUPER_ADMIN`, `ADMIN`, `KEPALA_SEKOLAH`, `OPERATOR`, `BENDAHARA`, `WALI_KELAS`, `GURU`, `STAFF_TU`, `STAFF_SARPRAS`, `ORANG_TUA`, `SISWA`
  - Proteksi pergantian password pertama kali login (`isFirstLogin`)
  - Audit logging keamanan sistem (`audit_logs`)

---

## 🚀 Tech Stack

### Frontend
- **React 19** + **Vite** + **TypeScript**
- **TailwindCSS v4** — Modern styling & sleek dark mode
- **Zustand** — Client state management
- **TanStack Query (React Query)** — Data fetching, caching & real-time sync
- **React Hook Form + Zod** — Type-safe validation
- **Framer Motion** — Smooth micro-animations
- **Recharts** — Dynamic analytics & reporting charts
- **Lucide React** — Modern iconography
- **Sonner** — Interactive toast notifications
- **XLSX** — Excel parser & generator

### Database & Backend
- **Supabase Cloud**
- **PostgreSQL 15+**
- **Supabase Auth** — Identity & session management
- **Row Level Security (RLS)** — Multi-tenant tenant-level isolation
- **PostgreSQL Triggers & Functions** — Otomasi kalkulasi status tagihan, sinkronisasi stok sarpras, dan `updatedAt`.

---

## 🗄️ Skema Database Supabase (24 Tabel)

Struktur tabel di bawah ini telah disinkronkan 100% antara file SQL repositori (`supabase_schema.sql` dan `supabase_setup.sql`) dengan database Supabase aktif:

| No | Nama Tabel | Deskripsi |
|---|---|---|
| 1 | `schools` | Identitas sekolah tenant (NPSN, alamat, kontak, logo, settings). |
| 2 | `academic_years` | Tahun ajaran sekolah (misal: 2026/2027) dan status aktif. |
| 3 | `semesters` | Semester (Ganjil / Genap) per tahun ajaran. |
| 4 | `users` | Profil otorisasi pengguna aplikasi terhubung ke `auth.users`. |
| 5 | `refresh_tokens` | Manajemen token sesi pengguna. |
| 6 | `teachers` | Data guru dan tenaga kependidikan (NIP, NUPTK, pendidikan, sertifikasi, dll). |
| 7 | `classes` | Rombongan belajar / kelas per tahun ajaran dan wali kelas. |
| 8 | `students` | Master data siswa (NIS, NISN, NIK, identitas fisik Dapodik, rekening bantuan). |
| 9 | `student_class_history` | Riwayat penempatan kelas siswa per tahun ajaran. |
| 10 | `student_parents` | Data orang tua / wali siswa (NIK, pekerjaan, penghasilan). |
| 11 | `student_economics` | **Data PIP, KIP, DTKS, PKH, KKS, dan Desil (1-10)**. |
| 12 | `attendances` | Presensi harian siswa (Hadir, Sakit, Izin, Alpa). |
| 13 | `announcements` | Papan pengumuman internal sekolah. |
| 14 | `subjects` | Master mata pelajaran sekolah. |
| 15 | `schedule_entries` | Jadwal pelajaran per kelas, hari, jam, guru, dan ruangan. |
| 16 | `inventory_items` | Master aset & barang inventaris sarana prasarana. |
| 17 | `inventory_transactions`| Mutasi barang masuk, keluar, dan penyesuaian stok. |
| 18 | `administration_records`| Arsip surat masuk, surat keluar, dan administrasi sekolah. |
| 19 | `scholarship_records` | Pencatatan beasiswa internal/eksternal non-PIP. |
| 20 | `fee_templates` | Pengaturan tarif iuran sekolah (SPP, DSP, gedung, seragam). |
| 21 | `student_bills` | Tagihan pembayaran siswa per periode bulan/tahun. |
| 22 | `payment_transactions` | Rekaman mutasi transaksi pembayaran tagihan. |
| 23 | `user_student_links` | Relasi akun wali murid/siswa dengan data siswa. |
| 24 | `audit_logs` | Catatan audit aktivitas keamanan dan perubahan data. |

---

## ⚡ Skrip SQL & Migrasi Desil PIP

### Menjalankan Database Baru di Supabase
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) ➜ Masuk ke proyek Anda.
2. Buka menu **SQL Editor**.
3. Buka file [`supabase_schema.sql`](supabase_schema.sql) dari repositori ini, salin seluruh kodenya, lalu klik **Run**.

### Menambahkan Kolom Desil pada Database yang Sudah Berjalan
Jika tabel `student_economics` sudah ada di database Supabase Anda, jalankan potongan query berikut di **SQL Editor**:

```sql
-- Tambahkan kolom desil pada tabel student_economics
ALTER TABLE public.student_economics 
ADD COLUMN IF NOT EXISTS "desil" INTEGER;

-- Tambahkan constraint nilai desil 1 sampai 10
ALTER TABLE public.student_economics 
DROP CONSTRAINT IF EXISTS student_economics_desil_check;

ALTER TABLE public.student_economics 
ADD CONSTRAINT student_economics_desil_check 
CHECK ("desil" IS NULL OR ("desil" >= 1 AND "desil" <= 10));

-- Perbarui fungsi import massal jika diperlukan
COMMENT ON COLUMN public.student_economics."desil" IS 'Desil DTKS/P3KE (1-4 prioritas PIP, 5-10 non-prioritas)';
```

---

## 🚫 Bebas Data Dummy (Zero Mock Data)

Aplikasi telah dikonfigurasi untuk terhubung **100% langsung ke Supabase**:
1. File seed data dummy statis (`supabase_seed_data.sql`, `seed_finance.ts`, `mock-data.ts`) telah **dihapus**.
2. Nilai `VITE_ENABLE_MOCK=false` pada environment aplikasi.
3. Dashboard Keuangan dan Dashboard Utama membaca langsung data riil dari tabel `payment_transactions`, `student_bills`, `student_economics`, dan `students`.
4. Jika database kosong, sistem akan menampilkan indikator visual yang bersih dan rapi (*empty state* informatif).

---

## ⚙️ Panduan Menjalankan Proyek

### 1. Salin Environment
Buat file `.env` di root direktori dengan menyalin dari `.env.example`:

```bash
cp .env.example .env
```

Pastikan variabel berikut terisi dengan kredensial Supabase Anda:

```env
VITE_APP_NAME=SekolahERP
VITE_APP_VERSION=1.0.0
VITE_ENABLE_MOCK=false
VITE_ENABLE_DEBUG=false

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Jalankan Server Development
```bash
npm run dev
```
Buka browser di `http://localhost:5173`.

### 4. Build Produksi
```bash
npm run build
```

---

## 📄 Lisensi
Hak Cipta © 2026 Tim Pengembang SekolahERP. Dilindungi undang-undang.
