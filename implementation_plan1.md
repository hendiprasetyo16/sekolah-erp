# Rencana Implementasi: Integrasi Supabase & Modul Keuangan

## 🎯 Tujuan Utama
1. **Migrasi Arsitektur**: Menghubungkan frontend React secara langsung ke **Supabase** (PostgreSQL + Auth), menggantikan backend NestJS agar aplikasi bisa berjalan 100% serverless di Vercel.
2. **Modul Keuangan**: Membangun sistem pencatatan tagihan dan pembayaran berdasarkan dokumen PDF (Rincian Biaya Tahunan & Buku untuk Kelas 1-6).

---

> [!WARNING]
> **Perombakan Arsitektur (Major Update)**
> Karena Vercel didesain untuk frontend/serverless, backend NestJS yang ada sebelumnya tidak bisa di-deploy dengan mudah secara gratis. Oleh karena itu, kita akan mengubah aplikasi untuk berkomunikasi **langsung** ke Supabase menggunakan `@supabase/supabase-js`. 

## 📝 Desain Database Keuangan (Tambahan)

Untuk mengakomodasi rincian biaya dari PDF, kita perlu menambahkan beberapa tabel ke dalam database:

1. **`FeeTemplate`** (Master Data Biaya per Kelas)
   - Contoh: "Kegiatan Ekstrakurikuler Kelas 1" (Rp300.000), "LKS Lantip Kelas 1" (Rp170.000)
2. **`StudentBill`** (Tagihan Siswa)
   - Tagihan spesifik yang dibebankan ke siswa setiap awal tahun ajaran.
3. **`Payment`** (Transaksi Pembayaran)
   - Mencatat cicilan atau pelunasan. Sesuai PDF, pembayaran bisa diangsur hingga Oktober atau via transfer ke BPD DIY.

---

## 🛠️ Langkah-langkah Implementasi

### Fase 1: Setup & Migrasi Supabase
1. Install `@supabase/supabase-js` di frontend.
2. Buat `src/services/supabase.client.ts` untuk koneksi.
3. **Migrasi Database**: Saya akan memandu Anda untuk membuat project di Supabase.com, mendapatkan URL database, dan kita akan mem-push skema Prisma saat ini (ditambah tabel keuangan baru) langsung ke database PostgreSQL Supabase Anda.

### Fase 2: Refactor Frontend (Menghapus Mock Data)
Mengubah layanan yang saat ini menggunakan data dummy (Mock Data) menjadi query langsung ke Supabase:
- `auth.service.ts` -> Menggunakan Supabase Auth (Login/Logout).
- `student.service.ts` -> Menggunakan Supabase Database (Select/Insert).
- `teacher.service.ts` -> Menggunakan Supabase Database.

### Fase 3: Pembuatan Modul Keuangan (Sesuai PDF)
1. **Master Data Script**: Membuat script untuk otomatis memasukkan data biaya Kelas 1 s/d Kelas 6 dari PDF ke dalam database.
2. **UI Keuangan**: 
   - Membuat halaman `/finance/dashboard` untuk ringkasan pembayaran.
   - Membuat halaman `/finance/billing` untuk melihat tagihan per siswa.
   - Membuat form **Penerimaan Pembayaran** (cicilan/lunas).

---

## ❓ Open Questions (Pertanyaan untuk Anda)

> [!IMPORTANT]
> Sebelum kita mulai mengeksekusi rencana besar ini, mohon siapkan dan konfirmasi hal berikut:
> 
> 1. **Project Supabase**: Apakah Anda sudah membuat project baru di [Supabase](https://supabase.com)?
> 2. **Kredensial**: Jika sudah, saya akan membutuhkan **Project URL** dan **anon public key** dari Supabase Anda untuk dihubungkan ke kode kita. Apakah Anda sudah memilikinya? (Bisa ditemukan di menu *Project Settings -> API*).
> 3. **Sinkronisasi Kelas**: Di PDF terdapat rincian Kelas 1-6 (khas SD), namun di mock data sebelumnya tertulis SMK (Kelas X, XI, XII). Apakah kita akan merubah data sekolah ini menjadi Sekolah Dasar (SD) sepenuhnya?

## ✅ Rencana Verifikasi
- Menguji login menggunakan sistem autentikasi asli Supabase.
- Memasukkan data 1 siswa SD dan menghasilkan tagihan otomatis berdasarkan kelasnya.
- Melakukan simulasi pembayaran cicilan (misal Rp100.000) dan memastikan sisa tagihan berkurang.
