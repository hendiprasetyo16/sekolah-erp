# 📊 Status Pengembangan SekolahERP

## Ringkasan

Aplikasi **SekolahERP** menggunakan arsitektur *serverless* **React 19 + Vite + TypeScript** di sisi frontend dan **Supabase Cloud (PostgreSQL + Auth + Hardened RLS)** di sisi backend.

- **Fondasi Database (`supabase_schema.sql` v14+ / v17):** Selesai penuh (**26 tabel**, *triggers*, RPC, dan *Hardened Row Level Security*).
- **Aplikasi Frontend (UI & Integrasi):** Fondasi inti dan seluruh modul Master Data telah selesai (`auth`, `dashboard`, `academic`, `admin`, `profile`, `students`, dan `teachers`). Tahap berikutnya adalah pembangunan modul operasional (**Jadwal Pelajaran** dan **Absensi**).

---

## ✅ Yang Sudah Selesai (Frontend + Database Terhubung)

### Frontend (React 19 + Vite + TypeScript)

| Komponen / Modul | Status | Keterangan |
| :--- | :---: | :--- |
| **Auth & Multi-Tenant Selector (`auth`)** | ✅ Selesai | Login fleksibel (Email / NUPTK / NIP / NIK / NISN / NIS via RPC) serta konsol pemilihan & pendaftaran satuan pendidikan multi-tenant. |
| **Dashboard Utama (`dashboard`)** | ✅ Selesai | Ringkasan statistik operasional sekolah setelah login. |
| **Master Akademik (`academic`)** | ✅ Selesai | CRUD Profil Sekolah (termasuk koordinat GPS & radius absensi), Tahun Ajaran, Semester, Kelas/Rombel (filter tingkat dinamis per jenjang), dan Mata Pelajaran. |
| **Standarisasi Multi-Jenjang** | ✅ Selesai | *Single Source of Truth* (`school.constants.ts`) untuk 11 jenjang (`TK, RA, SD, MI, SMP, MTs, SMA, MA, SMK, SLB, PKBM`) dan rentang tingkat kelas otomatis (`0–12`). |
| **Manajemen Siswa (`students`)** | ✅ Selesai | List, Detail, Form CRUD (termasuk data Orang Tua, Kesejahteraan/PIP/Desil, dan Impor Excel). |
| **Manajemen Guru / PTK (`teachers`)** | ✅ Selesai | List, Detail, Form CRUD lengkap data PTK & sinkronisasi tugas tambahan. |
| **Manajemen Akun & Multi-Role (`admin`)** | ✅ Selesai | Pengelolaan akun pengguna sekolah, sinkronisasi peran utama (`role`) dan peran tambahan (`additionalRoles`), serta kontrol hak akses. |
| **Profil Pengguna (`profile`)** | ✅ Selesai | Halaman pengaturan profil akun dan keamanan kata sandi pengguna aktif. |
| **Sidebar, Header & UI Library** | ✅ Selesai | Navigasi responsif dengan *toggle* tema Gelap/Terang, dwibahasa (ID/EN), dan komponen UI terstandar. |

### Database & Keamanan Backend (Supabase PostgreSQL v14+ / v17)

| Komponen | Status | Detail |
| :--- | :---: | :--- |
| **Skema Database (`supabase_schema.sql`)** | ✅ Selesai | **26 tabel** terrelasi lintas tenant dengan *composite foreign key* berbasis `schoolId`. |
| **Hardened RLS Policies** | ✅ Selesai | Isolasi ketat antar sekolah dan pembatasan akses akun `ORANG_TUA` & `SISWA`. |
| **Database Triggers & RPC** | ✅ Selesai | Otomasi stok sarpras, stok buku perpus, kalkulasi tagihan & anti-*overpayment*, sinkronisasi tahun ajaran/semester, dan *bulk import*. |
| **Fondasi Multi-Role (SQL)** | ✅ Selesai | Kolom `additionalRoles`, pemetaan otomatis dari `tugasTambahan` PTK, dan fungsi `get_user_all_roles()`. |

---

## 🔨 Sedang / Akan Dikerjakan Berikutnya (Fase 2 — Operasional Harian)

| Pekerjaan | Status | Keterangan |
| :--- | :---: | :--- |
| **Modul Jadwal Pelajaran (`/schedules/*`)** | 🔜 Prioritas 1 | Penyusunan jadwal mengajar per kelas, hari, jam pelajaran, guru pengampu, dan deteksi bentrok jadwal. |
| **Modul Absensi (`/attendance/*`)** | 🔜 Prioritas 2 | Presensi harian siswa per kelas (Hadir/Sakit/Izin/Alpa) dan presensi mandiri Guru/Tendik berbasis GPS + radius sekolah. |

---

## 🚧 Belum Dimulai di Frontend (Tabel SQL Sudah Siap, UI Masih Placeholder)

Seluruh modul di bawah ini sudah memiliki tabel, *trigger*, dan kebijakan RLS di database, namun halaman frontend-nya **belum dibuat**:

| Modul | Route | Fase Rencana |
| :--- | :--- | :--- |
| **Jadwal Pelajaran** | `/schedules/*` | Phase 2 |
| **Absensi (Siswa & GPS Guru)** | `/attendance/*` | Phase 2 |
| **Keuangan & Kasir SPP** | `/finance/*` | Phase 3 |
| **Inventaris & Sarpras** | `/inventory/*` | Phase 3 |
| **Perpustakaan** | `/library/*` | Phase 3 |
| **Persuratan / Administrasi TU** | `/correspondence/*` atau `/tu/*` | Phase 3 |
| **Beasiswa / PIP** | `/scholarships/*` | Phase 3–4 |
| **Laporan & Rekapitulasi** | `/reports/*` | Phase 4 |
| **Pengaturan Lanjutan & Audit Log** | `/settings/*` | Phase 4 |

---

## 📐 Arsitektur Sistem

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Vite + TypeScript)"]
        DONE[Selesai: Auth, Dashboard, Academic, Admin/Multi-Role, Profile, Students, Teachers]
        NEXT[Prioritas Berikutnya: Jadwal Pelajaran & Absensi GPS/Siswa]
        TODO[Fase Lanjutan: Keuangan, Sarpras, Perpus, TU, Beasiswa, Laporan]
    end

    subgraph Supabase["Supabase Cloud (PostgreSQL v14+ / v17)"]
        AUTH[Supabase Auth]
        RPC[Security Definer RPCs & Triggers]
        RLS[Hardened RLS Multi-Tenant & Multi-Role]
        DB[(26 Tables Ready)]
    end

    DONE --> AUTH
    DONE --> RPC
    DONE --> RLS
    NEXT -.-> RLS
    TODO -.-> RLS
    AUTH --> DB
    RPC --> DB
    RLS --> DB

📱 Cara Memperbarui dan Menghasilkan File APK
Setiap kali kamu selesai mengubah kode React di VS Code, kamu hanya perlu menjalankan rangkaian perintah ini untuk memperbarui dan membuat file APK-nya:

Bash
# 1. Build project React/Vite (untuk menghasilkan folder dist)
npm run build

# 2. Sinkronkan (copy) hasil build ke folder Android
npx cap sync

# 3. Buka project-mu di Android Studio untuk build APK
npx cap open android

Ketika Android Studio terbuka secara otomatis:

Hubungkan HP-mu dengan kabel USB (atau gunakan Emulator).

Di Android Studio, klik menu Build > Build Bundle(s) / APK(s) > Build APK(s).

Android Studio akan bekerja membuat file app-debug.apk yang bisa langsung kamu install dan diuji di perangkat.