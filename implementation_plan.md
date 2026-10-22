Rencana Implementasi: Sistem Informasi Sekolah (Multi-Tenant) & Modul Keuangan
🎯 Tujuan Utama
Arsitektur Multi-Tenant (Berbasis schoolId): Memastikan seluruh sistem dari Master Data hingga Pembayaran terisolasi dengan aman per institusi menggunakan Supabase. Tidak ada data sekolah yang bercampur.

Penyempurnaan Bertahap (Iterative): Membangun aplikasi secara modular mulai dari Master Data -> Siswa -> Keuangan, memastikan satu modul 100% bug-free dan terelasi kuat sebelum melangkah ke modul berikutnya.

Modul Keuangan Dinamis: Mengelola tagihan dan pembayaran (cicilan/lunas) berdasarkan dokumen rincian biaya, namun didesain fleksibel untuk berbagai jenjang sekolah (TK, SD, SMP, SMA, SMK).

[!WARNING]
Standar Arsitektur Database (Wajib)

Setiap tabel utama (Tahun Ajaran, Kelas, Guru, Siswa, Tagihan) wajib memiliki schoolId.

Frontend Cache menggunakan React Query wajib menyertakan schoolId pada Query Keys (contoh: ['classes', schoolId]).

Operasi Select, Insert, Update, dan Delete harus diverifikasi kepemilikannya ke schoolId aktif.

📝 Desain Database (Ringkasan Skema Master)
schools: Master entitas sekolah.

academic_years: Tahun ajaran (Relasi ke schoolId).

teachers: Data Guru/Wali Kelas (Relasi ke schoolId).

classes: Data Kelas (Relasi ke schoolId, academicYearId, homeroomTeacherId).

students: Data Siswa (Relasi ke schoolId, classId).

(Mendatang) fee_templates: Template tagihan per kelas/jenjang.

(Mendatang) student_bills & payments: Transaksi Keuangan.

🛠️ Langkah-langkah Eksekusi (Roadmap)
Fase 1: Finalisasi Master Data (SEDANG DIKERJAKAN ✅)
Fokus: Memastikan fondasi dasar 100% akurat sebelum memasukkan data masal.

Integrasi profil Institusi, Tahun Ajaran, dan Kelas murni dari Supabase.

Implementasi filter schoolId di semua Service dan Cache.

Menyelesaikan isu siklus hidup komponen UI (Dropdown tidak sinkron, Cache nyangkut).

Validasi Akhir Fase 1: Semua operasi CRUD (Buat, Baca, Ubah, Hapus) pada Data Master berjalan lancar tanpa refresh browser.

Fase 2: Modul Siswa & Import Data (Tertunda - Dikerjakan setelah Fase 1 Selesai)
Fokus: Mengelola data ribuan siswa tanpa merusak performa aplikasi.

UI Tabel Siswa berdasarkan filter Kelas dan Tahun Ajaran.

Pembuatan algoritma Import Excel (500+ baris).

Pemetaan ID Kelas secara otomatis saat import (Mencocokkan string nama kelas dari Excel ke UUID di Supabase).

Penanganan error saat import (Misal: NISN ganda).

Fase 3: Modul Keuangan (Sesuai PDF Rincian Biaya)
Fokus: Tagihan otomatis dan pelacakan cicilan.

Master Tagihan: Form untuk menginput rincian biaya (contoh: LKS, Ekstrakurikuler) berdasarkan jenjang kelas.

Generate Tagihan: Algoritma yang secara otomatis membebankan total biaya kepada siswa saat siswa dimasukkan ke dalam suatu Kelas & Tahun Ajaran aktif.

Penerimaan Pembayaran: UI kasir untuk menerima cicilan atau pelunasan secara penuh.

❓ Konfirmasi Arsitektur (Untuk Anda)
[!IMPORTANT]
Terkait arah aplikasi ke depan:

Fleksibilitas Jenjang: Form profil sekolah Anda sekarang memfasilitasi TK hingga SMA/SMK. Meskipun referensi PDF tagihan yang akan kita buat adalah untuk SD (Kelas 1-6), apakah kita mendesain Modul Keuangan ini agar dinamis (bisa dipakai sekolah SMK) atau dikhususkan strukturnya untuk SD saja?

Keamanan Ekstra: Setelah Fase 1 ini selesai dan berjalan lancar, saya sarankan kita masuk ke Dashboard Supabase Anda untuk mengaktifkan Row Level Security (RLS) agar schoolId difilter langsung oleh database engine. Apakah Anda memegang akses ke dashboard Supabase?