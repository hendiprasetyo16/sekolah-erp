# SekolahERP - Sistem Manajemen Sekolah Indonesia 🎓

Sistem ERP dan Manajemen Sekolah Indonesia *multi-tenant* untuk jenjang **TK, SD, SMP, SMA, dan SMK**. Aplikasi terhubung langsung secara *real-time* ke **Supabase (PostgreSQL + Auth + Hardened Row Level Security)** tanpa ketergantungan data *dummy*/*mock*.

---

## 🌟 Status & Cakupan Fitur

### ✅ Sudah Berjalan di Aplikasi (Frontend + Supabase)
- 🏫 **Multi-Tenant Architecture**: Isolasi data per sekolah menggunakan *Row Level Security* (RLS) PostgreSQL & Supabase Auth.
- 🔐 **Autentikasi Fleksibel**: Login menggunakan Email maupun NUPTK, NIP, NIK, NISN, atau NIS (`resolve_user_email`) serta proteksi ganti password saat login pertama (`isFirstLogin`).
- 📚 **Data Master Akademik**: Pengelolaan profil sekolah, tahun ajaran, semester, rombongan belajar/kelas, dan mata pelajaran.
- 👥 **Manajemen Siswa Lengkap**: Profil komprehensif, riwayat kelas, data orang tua/wali, atribut fisik Dapodik, dan klasifikasi ekonomi/kesejahteraan (**KIP, KKS, PKH, DTKS, dan Desil 1–10** beserta prioritas PIP otomatis).
- 📊 **Import & Export Massal Dapodik**: Dukungan unggah Excel/CSV standar Dapodik untuk data siswa dan PTK.
- 👨‍🏫 **Manajemen Pendidik & Tenaga Kependidikan (PTK)**: CRUD lengkap data NIP, NUPTK, NIK, status kepegawaian, sertifikasi, dan atribut Dapodik PTK.

### 🛠️ Siap di Skema Database (Tahap Integrasi UI Berikutnya)
- 🎭 **Multi-Role & Tugas Tambahan**: Skema database sudah mendukung peran ganda (`additionalRoles`) dan pemetaan otomatis dari `tugasTambahan` PTK; integrasi antarmuka (UI) sedang disiapkan.
- 📅 **Jadwal Pelajaran & Presensi**: Tabel jadwal mengajar, presensi harian siswa, serta presensi GPS & selfie guru/tendik.
- 💳 **Keuangan & Kasir SPP**: Template tarif (`fee_templates`), tagihan siswa (`student_bills`), dan pembayaran cicilan/lunas dengan proteksi *anti-overpayment* di level database.
- 📦 **Sarpras, Perpustakaan & Administrasi TU**: Manajemen aset inventaris, sirkulasi peminjaman buku perpustakaan, arsip surat TU, dan pencatatan beasiswa.

---

## 🚀 Tech Stack

### Frontend & Mobile
- **React 19** + **Vite** + **TypeScript**
- **TailwindCSS v4** — Styling modern & *dark/light mode*
- **Zustand** — Manajemen *state* autentikasi
- **TanStack Query (React Query)** — *Data fetching*, *caching* per `schoolId`, dan sinkronisasi *real-time*
- **React Hook Form + Zod** — Validasi formulir *type-safe*
- **Framer Motion**, **Lucide React**, **Recharts**, **Sonner**, **XLSX**
- **Capacitor** — Build aplikasi mobile Android (APK)

### Database & Backend
- **Supabase Cloud** (PostgreSQL 15+ & Supabase Auth)
- **Hardened Row Level Security (RLS)** — Isolasi multi-tenant dan kontrol akses berbasis peran
- **PostgreSQL Triggers & Security Definer RPCs** — Otomasi validasi keuangan, stok sarpras, stok perpustakaan, sinkronisasi semester, dan *bulk import*.

---

## Arsitektur & Struktur Aplikasi (`sekolah-erp`)

Aplikasi ini dibangun menggunakan **React + TypeScript + Vite**, terintegrasi dengan **Supabase** (PostgreSQL, Auth, RLS, Storage, Edge Functions), serta mendukung build Android via **Capacitor**.

### Diagram Alur Sistem

```mermaid
graph TD
    subgraph Frontend ["Frontend (Vite + React + TypeScript)"]
        UI["Pages & Components (Tailwind CSS)"]
        Store["State Management (src/stores)"]
        Services["Module Services (src/modules/*/services)"]
        PDF["PDF Generator (jsPDF + AutoTable)"]
        UI --> Store
        UI --> Services
        UI --> PDF
    end

    subgraph Supabase ["Backend (Supabase)"]
        Auth["Supabase Auth & Multi-Role JWT"]
        DB[("PostgreSQL + RLS Multi-Tenant")]
        RPC["Server-Side RPC Functions"]
        Storage["Storage Buckets (selfies, attachments, school-assets)"]
        Edge["Edge Functions (create-user, send-whatsapp, dll)"]
    end

    Services --> Auth
    Services --> DB
    Services --> RPC
    Services --> Storage
    Services --> Edge

sekolah-erp/
├── android/                  # Project native Android (Capacitor)
├── supabase/
│   └── functions/            # Supabase Edge Functions (user management & WA gateway)
├── src/
│   ├── app/                  # Konfigurasi utama aplikasi & provider
│   ├── assets/               # Aset statis (gambar, ikon)
│   ├── components/           # Komponen UI global & layouts (MainLayout)
│   ├── config/               # Konfigurasi environment & client Supabase
│   ├── constants/            # Konstanta global aplikasi
│   ├── hooks/                # Custom React hooks global
│   ├── modules/              # Fitur bisnis berbasis modul (Domain-Driven)
│   │   ├── academic/         # Manajemen Kelas, Mapel, Tahun Ajaran & Jadwal
│   │   ├── admin/            # Manajemen Sekolah, User & Pengaturan Tenant
│   │   ├── attendance/       # Presensi GPS Guru, Presensi Siswa & Kiosk
│   │   └── grades/           # Modul Nilai & Raport Kurikulum Merdeka (Baru)
│   ├── routes/               # Definisi routing & proteksi role (src/routes/index.tsx)
│   ├── services/             # Layanan API umum
│   ├── stores/               # Global state (Zustand / Context)
│   ├── types/                # Definisi tipe TypeScript global
│   └── utils/                # Fungsi helper umum
└── supabase_schema.sql       # Skema database PostgreSQL lengkap (v22.2)

## 🗄️ Skema Database Supabase (26 Tabel — v13.1)

Seluruh definisi tabel, *trigger*, fungsi RPC, dan kebijakan RLS tersimpan dalam satu file skema utama [`supabase_schema.sql`](supabase_schema.sql):

| No | Nama Tabel | Deskripsi |
| :---: | :--- | :--- |
| 1 | `schools` | Identitas sekolah tenant (NPSN, jenjang, status, alamat, koordinat GPS & radius absensi). |
| 2 | `academic_years` | Tahun ajaran sekolah dan status aktif (maksimal 1 aktif per sekolah). |
| 3 | `semesters` | Semester (`GANJIL` / `GENAP`) per tahun ajaran. |
| 4 | `users` | Profil otorisasi pengguna terhubung ke `auth.users` (`role` utama & `additionalRoles`). |
| 5 | `refresh_tokens` | Tabel sesi *legacy* (dikunci *default deny* dari klien). |
| 6 | `audit_logs` | Catatan audit aktivitas sistem yang bersifat *immutable*. |
| 7 | `teachers` | Data guru dan tenaga kependidikan standar Dapodik PTK. |
| 8 | `classes` | Rombongan belajar / kelas per tahun ajaran dan wali kelas. |
| 9 | `students` | Master data siswa (NIS, NISN, NIK, identitas fisik Dapodik, rekening bantuan). |
| 10 | `student_class_history` | Riwayat penempatan kelas siswa per tahun ajaran. |
| 11 | `user_student_links` | Relasi akun wali murid/siswa dengan data siswa. |
| 12 | `student_parents` | Data orang tua / wali siswa (NIK, pendidikan, pekerjaan, penghasilan). |
| 13 | `student_economics` | Data PIP, KIP, KKS, PKH, DTKS, kondisi rumah, dan **Desil (1–10)**. |
| 14 | `attendances` | Presensi harian siswa serta presensi GPS & selfie guru/tendik. |
| 15 | `subjects` | Master mata pelajaran sekolah. |
| 16 | `schedule_entries` | Jadwal pelajaran per kelas, hari, jam, guru, dan ruangan. |
| 17 | `announcements` | Papan pengumuman internal sekolah. |
| 18 | `inventory_items` | Master aset & barang inventaris sarana prasarana. |
| 19 | `inventory_transactions` | Mutasi barang masuk, keluar, dan penyesuaian stok otomatis. |
| 20 | `administration_records` | Arsip surat masuk, surat keluar, dan administrasi TU. |
| 21 | `scholarship_records` | Pencatatan beasiswa internal/eksternal non-PIP. |
| 22 | `fee_templates` | Pengaturan tarif iuran sekolah (SPP, daftar ulang, kegiatan, dll.). |
| 23 | `student_bills` | Tagihan pembayaran siswa per periode bulan/tahun. |
| 24 | `payment_transactions` | Mutasi transaksi pembayaran tagihan dengan validasi anti-*overpayment*. |
| 25 | `library_books` | Katalog koleksi buku perpustakaan dan stok eksemplar tersedia. |
| 26 | `library_loans` | Sirkulasi peminjaman dan pengembalian buku siswa maupun guru. |

---

## ⚡ Setup Database di Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan masuk ke proyek Anda.
2. Buka menu **SQL Editor**.
3. Salin seluruh kode dari file [`supabase_schema.sql`](supabase_schema.sql), tempelkan ke editor, lalu klik **Run**.
4. Buat akun `SUPER_ADMIN` atau `ADMIN` awal pada menu **Authentication > Users**, lalu sisipkan profilnya ke tabel `public.users` secara terpisah melalui SQL Editor (jangan menyimpan email/kredensial asli di repositori).

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
