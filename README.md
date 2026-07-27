# SekolahERP - Sistem Manajemen Sekolah Indonesia

Sistem ERP/Manajemen sekolah modern berbasis React + TypeScript untuk sekolah Indonesia (SD, SMP, SMA, SMK).

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Styling**: TailwindCSS v4
- **State**: Zustand
- **Routing**: React Router v7
- **Charts**: Recharts
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Date**: Day.js

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@smknusantara.sch.id | admin123 |
| Kepala Sekolah | kepsek@smknusantara.sch.id | admin123 |
| Bendahara | bendahara@smknusantara.sch.id | admin123 |
| Operator | operator@smknusantara.sch.id | admin123 |
| Guru | guru@smknusantara.sch.id | admin123 |
| Wali Kelas | walikelas@smknusantara.sch.id | admin123 |

## Project Structure

```
src/
├── app/              # App entry point & providers
├── components/       # Shared reusable components
│   └── layouts/      # Layout components (Sidebar, Header)
├── modules/          # Feature modules (domain-driven)
│   ├── auth/         # Authentication
│   ├── dashboard/    # Dashboard
│   └── students/     # Student management
├── routes/           # Route definitions & guards
├── stores/           # Global Zustand stores
├── hooks/            # Shared custom hooks
├── constants/        # App constants & translations
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── styles/           # Global styles
```

## Features (Phase 1 MVP)

- ✅ Premium login page with role switching
- ✅ Admin dashboard with analytics charts
- ✅ Dark/Light theme toggle
- ✅ Bilingual UI (Indonesian/English)
- ✅ Role-based sidebar navigation
- ✅ Student list with search, filter, pagination
- ✅ Responsive design (mobile + desktop)
- ✅ RBAC permission system

## License

MIT
