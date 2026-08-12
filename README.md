# SekolahERP - Aplikasi Manajemen Sekolah Indonesia 🎓

Sistem Manajemen Sekolah Indonesia berbasis web yang modern, scalable, dan siap produksi untuk SD, SMP, SMA, dan SMK.

---

## 🚀 Tech Stack

### Frontend
- **React 19** + **Vite** + **TypeScript**
- **TailwindCSS v4** — Styling
- **Zustand** — State management
- **Tanstack Query (React Query)** — Data fetching & caching
- **React Hook Form + Zod** — Form validation
- **Framer Motion** — Animations
- **Recharts** — Charts & analytics
- **Lucide React** — Icons
- **Sonner** — Toast notifications

### Backend
- **NestJS** — Enterprise Node.js framework
- **Prisma ORM** — Database ORM
- **PostgreSQL** — Database
- **JWT** — Authentication (access + refresh tokens)
- **Bcrypt** — Password hashing
- **Class Validator** — DTO validation

---

## 📁 Struktur Folder

```
sekolah-erp/
├── src/                         # Frontend (React)
│   ├── app/                     # App root, providers
│   ├── components/
│   │   ├── layouts/             # Sidebar, Header, MainLayout
│   │   └── ui/                  # Shadcn-like UI components
│   ├── config/
│   │   └── env.ts               # Centralized env config (no hardcoding)
│   ├── constants/               # App constants, translations
│   ├── hooks/                   # Custom hooks (useTranslation, etc.)
│   ├── modules/
│   │   ├── auth/                # Login, JWT auth store
│   │   ├── dashboard/           # Admin dashboard with charts
│   │   ├── students/            # Students CRUD (full)
│   │   ├── teachers/            # Teachers CRUD (full)
│   │   ├── finance/             # Finance dashboard
│   │   ├── schedules/           # Schedule overview
│   │   └── reports/             # Analytics & reports
│   ├── routes/                  # React Router setup
│   ├── services/                # API client (Axios + interceptors)
│   ├── stores/                  # Zustand stores (auth, ui)
│   ├── types/                   # TypeScript types
│   └── utils/                   # cn(), format helpers
│
└── server/                      # Backend (NestJS)
    ├── prisma/
    │   └── schema.prisma        # Database schema
    └── src/
        ├── modules/
        │   ├── auth/            # JWT auth, refresh tokens, RBAC
        │   ├── students/        # Students API
        │   └── teachers/        # Teachers API
        └── prisma/              # Prisma service
```

---

## 🗄️ Database

Proyek ini menggunakan **PostgreSQL** sebagai database utama, dikelola oleh **Prisma ORM**.

### Kenapa PostgreSQL?
- **Enterprise-grade**: Mendukung transaksi ACID, relasi kompleks, dan JSON fields.
- **Scalable**: Dapat menangani ribuan siswa dan transaksi sekolah.
- **Aman**: Row-level security, encryption at rest (saat di cloud).

### Setup Database Lokal

1. Install PostgreSQL dan buat database:
   ```sql
   CREATE DATABASE sekolah_erp_db;
   ```

2. Copy file `.env`:
   ```bash
   cp server/.env.example server/.env
   ```

3. Update `DATABASE_URL` di `server/.env`:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/sekolah_erp_db"
   ```

4. Jalankan migrasi:
   ```bash
   cd server
   npx prisma migrate dev --name init
   npx prisma db seed
   ```

---

## ⚡ Quick Start

### Frontend
```bash
# Install dependencies
npm install

# Copy .env
cp .env.example .env

# Jalankan development server
npm run dev
```

### Backend
```bash
cd server

# Install dependencies
npm install

# Copy .env
cp .env.example .env

# Migrasi database
npx prisma migrate dev

# Seed data demo
npx prisma db seed

# Jalankan server
npm run start:dev
```

**Akun Demo (setelah seed):**
| Email | Password | Role |
|-------|----------|------|
| admin@sekolah.sch.id | Admin@123 | SUPER_ADMIN |
| kepala@sekolah.sch.id | Admin@123 | KEPALA_SEKOLAH |
| bendahara@sekolah.sch.id | Admin@123 | BENDAHARA |

---

## 🚀 Deployment

### Frontend → Vercel

1. Push ke GitHub
2. Import project di [vercel.com](https://vercel.com)
3. Set environment variables di Vercel dashboard:
   ```
   VITE_API_BASE_URL=https://your-backend-url.railway.app/api
   VITE_APP_NAME=SekolahERP
   VITE_ENABLE_MOCK=false
   ```
4. Deploy! Routing sudah dikonfigurasi via `vercel.json`.

### Backend → Railway (Rekomendasi)

1. Push code ke GitHub
2. Buat project baru di [railway.app](https://railway.app)
3. Tambahkan **PostgreSQL** plugin dari Railway
4. Set environment variables:
   ```
   DATABASE_URL=<dari Railway PostgreSQL>
   JWT_SECRET=<random-secret-kuat-min-32-chars>
   JWT_REFRESH_SECRET=<random-secret-kuat-min-32-chars>
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://your-app.vercel.app
   ```
5. Deploy otomatis dari GitHub!

### Backend → Render (Alternatif Gratis)

1. Buat account di [render.com](https://render.com)
2. New Web Service → Connect GitHub repo
3. Build command: `cd server && npm install && npm run build`
4. Start command: `cd server && node dist/main`
5. Add PostgreSQL database dari Render

---

## 🔐 Keamanan

- ✅ JWT Authentication (Access + Refresh Token Rotation)
- ✅ Password di-hash dengan Bcrypt (cost factor 12)
- ✅ RBAC (Role-Based Access Control) dengan 10 role
- ✅ Semua URL/config via environment variables (tidak hardcode)
- ✅ CORS dikonfigurasi hanya untuk frontend domain
- ✅ Request validation dengan class-validator
- ✅ Audit log untuk setiap perubahan data

---

## 📋 Modul MVP V1.0

| Modul | Status | Keterangan |
|-------|--------|------------|
| 🔐 Autentikasi | ✅ Complete | Login, Refresh Token, RBAC |
| 📊 Dashboard | ✅ Complete | Statistik, Charts, Real-time |
| 👨‍🎓 Siswa | ✅ Complete | CRUD lengkap, Data Orang Tua |
| 👨‍🏫 Guru & Pegawai | ✅ Complete | CRUD, Data Kepegawaian |
| 💰 Keuangan | 🟡 Preview | Dashboard, Charts, Transaksi |
| 📅 Jadwal | 🟡 Preview | Tampilan Jadwal Mingguan |
| 📦 Sarpras | 🔲 Phase 2 | Inventarisasi Barang |
| 🎓 Beasiswa | 🔲 Phase 2 | KIP, PIP, Bantuan |
| 📑 Laporan | 🟡 Preview | Analytics, Export |
| ⚙️ Pengaturan | 🔲 Phase 2 | Konfigurasi Sekolah |

---

## 🌐 Bilingual Support

Aplikasi mendukung **Bahasa Indonesia** dan **English** via sistem i18n custom yang ringan, tanpa library eksternal berat.

---

*Built with ❤️ untuk sekolah-sekolah Indonesia*
