# Rencana Deploy SekolahERP ke Vercel + GitHub

## Analisis Situasi

Aplikasi saat ini memiliki arsitektur **dual-stack**:
- **Frontend**: React + Vite (siap build, sudah punya mock data)
- **Backend**: NestJS + Prisma + SQLite (tidak bisa jalan di Vercel serverless)

Frontend sudah dirancang dengan **mock mode** (`VITE_ENABLE_MOCK=true`) yang memungkinkan semua halaman bekerja tanpa backend. Ini adalah kunci deployment cepat.

## Strategi Deployment

> [!IMPORTANT]
> **Pendekatan yang saya rekomendasikan**: Deploy frontend dulu ke Vercel dengan **mock mode ON**. Semua fitur yang sudah ada (Login, Dashboard, CRUD Siswa, dll) akan berfungsi penuh. Database Supabase akan diintegrasikan di fase berikutnya ketika backend siap.

### Kenapa tidak langsung pakai Supabase sekarang?
- NestJS **tidak bisa berjalan di Vercel** (terlalu berat untuk serverless)
- Mengubah seluruh arsitektur backend ke Supabase client langsung membutuhkan refactor besar (~2-3 hari kerja)
- Dengan mock mode, aplikasi sudah **fully functional** dan bisa di-demo-kan

## Proposed Changes

### 1. Fix Build Errors
Pastikan `npm run build` berhasil tanpa error.

#### [MODIFY] [vite.config.ts](file:///c:/Users/Administrator/.gemini/antigravity/scratch/sekolah-erp/vite.config.ts)
- Pastikan konfigurasi build production benar

#### [MODIFY] File-file yang mungkin ada TypeScript error
- Fix import errors dan type issues yang muncul saat build production

---

### 2. Setup Environment untuk Production

#### [MODIFY] [.env](file:///c:/Users/Administrator/.gemini/antigravity/scratch/sekolah-erp/.env)
- Set `VITE_ENABLE_MOCK=true` untuk deployment awal (semua data pakai mock)
- Set `VITE_ENABLE_DEBUG=false`

#### [MODIFY] [.env.example](file:///c:/Users/Administrator/.gemini/antigravity/scratch/sekolah-erp/.env.example)
- Update template dengan variabel Supabase (untuk masa depan)

---

### 3. Fix Vercel Configuration

#### [MODIFY] [vercel.json](file:///c:/Users/Administrator/.gemini/antigravity/scratch/sekolah-erp/vercel.json)
- Konfigurasi SPA routing (semua path → `/index.html`)
- Ignore folder `server/` agar tidak di-build Vercel

---

### 4. Update .gitignore

#### [MODIFY] [.gitignore](file:///c:/Users/Administrator/.gemini/antigravity/scratch/sekolah-erp/.gitignore)
- Pastikan `node_modules/`, `.env`, `dist/`, `server/node_modules/`, `*.db` tidak masuk Git
- Pastikan `server/.env` juga di-exclude

---

### 5. Complete Placeholder Modules (Basic Pages)

Modul-modul yang masih placeholder akan diberi halaman dasar agar terlihat lebih lengkap saat online:

#### [MODIFY] Routes — Sambungkan TeacherListPage yang sudah ada
#### Modul placeholder tetap tampil dengan pesan "Coming Soon" yang profesional

---

### 6. Git + GitHub Setup

```bash
# Initialize git
git init
git add .
git commit -m "feat: SekolahERP Phase 1 MVP"

# Push ke GitHub (user perlu buat repo dulu atau pakai GitHub CLI)
gh repo create sekolah-erp --public --source=. --push
# ATAU
git remote add origin https://github.com/USERNAME/sekolah-erp.git
git push -u origin main
```

---

### 7. Deploy ke Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login ke Vercel
vercel login

# Deploy
vercel --prod
```

## Open Questions

> [!IMPORTANT]
> **Pertanyaan untuk Anda:**
> 1. **Akun GitHub**: Apakah Anda sudah punya akun GitHub? Apa username-nya? Atau mau saya bantu buat repo via GitHub CLI (`gh`)?
> 2. **Akun Vercel**: Apakah Anda sudah punya akun Vercel? Sudah pernah login via `vercel login`?
> 3. **GitHub CLI**: Apakah `gh` (GitHub CLI) sudah terinstall? Jika belum, kita bisa push manual.

## Verification Plan

### Build Test
```bash
npm run build
```
Harus berhasil tanpa error.

### Local Preview
```bash
npm run preview
```
Test semua halaman: Login → Dashboard → Students → Teachers → Placeholder pages

### Deployment Check
- Buka URL Vercel yang diberikan setelah deploy
- Test login dengan demo account
- Navigasi ke semua halaman
