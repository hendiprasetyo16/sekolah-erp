# 📊 Status Pengembangan SekolahERP

## Ringkasan

Aplikasi **SekolahERP** menggunakan arsitektur *serverless* **React 19 + Vite + TypeScript** di sisi frontend dan **Supabase Cloud (PostgreSQL + Auth + Hardened RLS)** di sisi backend. 

* **Fondasi Database (`supabase_schema.sql` v13.1):** Selesai penuh (**26 tabel**, *triggers*, RPC, dan *Hardened Row Level Security*).
* **Aplikasi Frontend (UI & Integrasi):** Selesai bertahap hingga modul **Manajemen Guru**. Modul **Absensi** dan modul operasional lainnya masih dalam daftar pengerjaan berikutnya.

---

## ✅ Yang Sudah Selesai (Frontend + Database Terhubung)

### Frontend (React 19 + Vite + TypeScript)

| Komponen / Modul | Status | Keterangan |
| :--- | :---: | :--- |
| **Login Page** | ✅ Selesai | Autentikasi terhubung dengan Supabase Auth (mendukung Email / NUPTK / NIP / NIK / NISN / NIS via RPC). |
| **Admin Dashboard** | ✅ Selesai | Halaman utama setelah login. |
| **Data Master Akademik** | ✅ Selesai | Manajemen Profil Sekolah, Tahun Ajaran, Semester, Kelas, dan Mata Pelajaran. |
| **Manajemen Siswa** | ✅ Selesai | List, Detail, Form CRUD (termasuk data Orang Tua, Kesejahteraan/PIP/Desil, dan Impor Excel). |
| **Manajemen Guru** | ✅ Selesai | List, Detail, Form CRUD lengkap data PTK. |
| **Sidebar & Header** | ✅ Selesai | Navigasi responsif dengan *toggle* tema Gelap/Terang dan dwibahasa (ID/EN). |
| **UI Component Library** | ✅ Selesai | Komponen dasar (Button, Card, Badge, Form, Input, Label, Select, Tabs, dll.). |
| **Auth Store & Route Guards** | ✅ Selesai | Manajemen sesi Zustand dan proteksi rute dasar (`role` utama). |

### Database & Keamanan Backend (Supabase PostgreSQL v13.1)

| Komponen | Status | Detail |
| :--- | :---: | :--- |
| **Skema Database (`supabase_schema.sql`)** | ✅ Selesai | **26 tabel** terrelasi lintas tenant dengan *composite foreign key* berbasis `schoolId`. |
| **Hardened RLS Policies** | ✅ Selesai | Isolasi ketat antar sekolah dan pembatasan akses akun `ORANG_TUA` & `SISWA`. |
| **Database Triggers & RPC** | ✅ Selesai | Otomasi stok sarpras, stok buku perpus, kalkulasi tagihan & anti-*overpayment*, sinkronisasi tahun ajaran/semester, dan *bulk import*. |
| **Fondasi Multi-Role (SQL)** | ✅ Selesai | Kolom `additionalRoles`, pemetaan otomatis dari `tugasTambahan` PTK, dan fungsi `get_user_all_roles()`. |

---

## 🔨 Sedang / Perlu Diselesaikan Berikutnya (Integrasi Frontend)

| Pekerjaan | Status | Keterangan |
| :--- | :---: | :--- |
| **Integrasi Multi-Role di Frontend** | 🔨 Belum di UI | Skema SQL sudah siap, namun `authStore`, `usePermission`, `Sidebar`, dan form manajemen user masih perlu dihubungkan ke `additionalRoles` / `get_user_all_roles()`. |

---

## 🚧 Belum Dimulai di Frontend (Tabel SQL Sudah Siap, UI Masih Placeholder)

Seluruh modul di bawah ini sudah memiliki tabel, *trigger*, dan kebijakan RLS di `supabase_schema.sql`, namun halaman frontend-nya **belum dibuat**:

| Modul | Route | Fase Rencana |
| :--- | :--- | :--- |
| **Jadwal Pelajaran** | `/schedules/*` | Phase 2 |
| **Absensi (Siswa & GPS Guru)** | `/attendance/*` | Phase 2 |
| **Keuangan & Kasir SPP** | `/finance/*` | Phase 2–3 |
| **Inventaris & Sarpras** | `/inventory/*` | Phase 3 |
| **Perpustakaan** | `/library/*` | Phase 3 |
| **Administrasi TU** | `/admin/*` | Phase 3 |
| **Beasiswa / PIP** | `/scholarships/*` | Phase 3–4 |
| **Laporan** | `/reports/*` | Phase 3–4 |
| **Pengaturan & Manajemen Akun** | `/settings/*` | Phase 4 |

---

## 📐 Arsitektur Sistem

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Vite + TypeScript)"]
        DONE[Selesai: Login, Dashboard, Master Akademik, Siswa, Guru]
        TODO[Belum UI: Multi-Role Hook, Jadwal, Absensi, Keuangan, Sarpras, Perpus, TU, Laporan]
    end

    subgraph Supabase["Supabase Cloud (PostgreSQL v13.1)"]
        AUTH[Supabase Auth]
        RPC[Security Definer RPCs & Triggers]
        RLS[Hardened RLS Multi-Tenant & Multi-Role]
        DB[(26 Tables Ready)]
    end

    DONE --> AUTH
    DONE --> RPC
    DONE --> RLS
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