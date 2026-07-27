import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabaseUrl = 'https://kgoqjbccgmsrwtbxqshq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnb3FqYmNjZ21zcnd0Ynhxc2hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzQzNjQsImV4cCI6MjEwMDc1MDM2NH0.DYPfbpOsM1VPX3xfRX-EL6QGJrO_vVAhjj5q6NGUCdU';

const supabase = createClient(supabaseUrl, supabaseKey);

function uuid() {
  return crypto.randomUUID();
}

async function seed() {
  console.log('Starting seed...');

  // 1. Create School
  const schoolId = uuid();
  await supabase.from('schools').insert({
    id: schoolId,
    name: 'SD MUHAMMADIYAH PAJANGAN 1',
    npsn: '12345678', // Example NPSN
    level: 'SD',
    type: 'SWASTA',
    address: 'Jl. Wonosari, Km 9 Pajangan Sendangtirto',
    city: 'Sleman',
    province: 'Yogyakarta',
    email: 'sdmuhammadiyahpajangan1@gmail.com',
    updatedAt: new Date().toISOString()
  });
  console.log('School created.');

  // 2. Create Academic Year 2026/2027
  const academicYearId = uuid();
  await supabase.from('academic_years').insert({
    id: academicYearId,
    schoolId,
    name: '2026/2027',
    startYear: 2026,
    endYear: 2027,
    isActive: true
  });
  console.log('Academic year created.');

  // 3. Create Classes 1-6
  const classIds: any = {};
  for (let grade = 1; grade <= 6; grade++) {
    const cid = uuid();
    classIds[grade] = cid;
    await supabase.from('classes').insert({
      id: cid,
      schoolId,
      academicYearId,
      name: `Kelas ${grade}`,
      gradeLevel: grade,
      capacity: 30
    });
  }
  console.log('Classes created.');

  // 4. Create Fee Templates
  const feeTemplates = [
    // CLASS 1
    { grade: 1, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 300000 },
    { grade: 1, category: 'TAHUNAN', name: 'Map Raport', amount: 60000 },
    { grade: 1, category: 'TAHUNAN', name: 'Foto siswa baru', amount: 25000 },
    { grade: 1, category: 'TAHUNAN', name: 'Kartu pelajar', amount: 20000 },
    { grade: 1, category: 'TAHUNAN', name: 'Pengembangan bakat dan kemampuan akademik', amount: 100000 },
    { grade: 1, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kenaikan Kelas)', amount: 50000 },
    { grade: 1, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 1, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 1, category: 'TAHUNAN', name: 'Baju adat lurik (Kamis Pon&Angklung)', amount: 100000 },
    { grade: 1, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 1, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 1, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 1, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 1, category: 'TAHUNAN', name: 'Kegiatan Ramadhan (buka bersama)', amount: 30000 },
    { grade: 1, category: 'BUKU', name: 'LKS Lantip (7 mapel)', amount: 170000 },
    { grade: 1, category: 'BUKU', name: 'LKS ISMUBA', amount: 40000 },
    { grade: 1, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia)', amount: 172000 },

    // CLASS 2
    { grade: 2, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 240000 },
    { grade: 2, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kenaikan Kelas)', amount: 50000 },
    { grade: 2, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 2, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 2, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 2, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 2, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 2, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 2, category: 'TAHUNAN', name: 'Kegiatan Ramadhan', amount: 30000 },
    { grade: 2, category: 'BUKU', name: 'LKS Lantip (7 mapel)', amount: 170000 },
    { grade: 2, category: 'BUKU', name: 'LKS ISMUBA', amount: 40000 },
    { grade: 2, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia)', amount: 167000 },

    // CLASS 3
    { grade: 3, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 240000 },
    { grade: 3, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kenaikan Kelas)', amount: 50000 },
    { grade: 3, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 3, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 3, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 3, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 3, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 3, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 3, category: 'TAHUNAN', name: 'Kegiatan Ramadhan', amount: 30000 },
    { grade: 3, category: 'BUKU', name: 'LKS Lantip (8 mapel)', amount: 190000 },
    { grade: 3, category: 'BUKU', name: 'LKS ISMUBA', amount: 100000 },
    { grade: 3, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia, IPAS)', amount: 245000 },

    // CLASS 4
    { grade: 4, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 240000 },
    { grade: 4, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kenaikan Kelas)', amount: 50000 },
    { grade: 4, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 4, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 4, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 4, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 4, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 4, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 4, category: 'TAHUNAN', name: 'Kegiatan Ramadhan', amount: 30000 },
    { grade: 4, category: 'BUKU', name: 'LKS Lantip (8 mapel)', amount: 190000 },
    { grade: 4, category: 'BUKU', name: 'LKS ISMUBA', amount: 100000 },
    { grade: 4, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia, IPAS)', amount: 239000 },

    // CLASS 5
    { grade: 5, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 240000 },
    { grade: 5, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kenaikan Kelas)', amount: 50000 },
    { grade: 5, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 5, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 5, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 5, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 5, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 5, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 5, category: 'TAHUNAN', name: 'Kegiatan Ramadhan', amount: 30000 },
    { grade: 5, category: 'BUKU', name: 'LKS Lantip (8 mapel)', amount: 190000 },
    { grade: 5, category: 'BUKU', name: 'LKS ISMUBA', amount: 100000 },
    { grade: 5, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia, IPAS)', amount: 241000 },

    // CLASS 6
    { grade: 6, category: 'TAHUNAN', name: 'Kegiatan Ekstrakurikuler', amount: 200000 },
    { grade: 6, category: 'TAHUNAN', name: 'Apresiasi Ortu (Kelulusan)', amount: 50000 },
    { grade: 6, category: 'TAHUNAN', name: 'Fieldtrip /Outing Class', amount: 250000 },
    { grade: 6, category: 'TAHUNAN', name: 'Alat Pembelajaran', amount: 50000 },
    { grade: 6, category: 'TAHUNAN', name: 'Latihan Qurban', amount: 35000 },
    { grade: 6, category: 'TAHUNAN', name: 'Renang', amount: 25000 },
    { grade: 6, category: 'TAHUNAN', name: 'Les', amount: 350000 },
    { grade: 6, category: 'TAHUNAN', name: 'Parenting', amount: 50000 },
    { grade: 6, category: 'TAHUNAN', name: 'Persyarikatan Muhammadiyah', amount: 30000 },
    { grade: 6, category: 'TAHUNAN', name: 'Pas Foto', amount: 20000 },
    { grade: 6, category: 'TAHUNAN', name: 'Kegiatan Ramadhan', amount: 30000 },
    { grade: 6, category: 'TAHUNAN', name: 'Akhirussanah (Samir, Konsumsi, Sauvenir, kenangan2an)', amount: 400000 },
    { grade: 6, category: 'TAHUNAN', name: 'Buku Ujian Kelas 6', amount: 150000 },
    { grade: 6, category: 'TAHUNAN', name: 'Do\'a Bersama Persiapan ASPD', amount: 70000 },
    { grade: 6, category: 'BUKU', name: 'LKS Lantip (8 mapel)', amount: 190000 },
    { grade: 6, category: 'BUKU', name: 'LKS ISMUBA', amount: 100000 },
    { grade: 6, category: 'BUKU', name: 'Buku Pegangan Siswa (Matematika, Bhs Indonesia, IPAS)', amount: 237000 },
  ];

  const templatesToInsert = feeTemplates.map(t => ({
    id: uuid(),
    schoolId,
    academicYearId,
    gradeLevel: t.grade,
    name: t.name,
    category: t.category,
    amount: t.amount,
  }));

  const { error } = await supabase.from('fee_templates').insert(templatesToInsert);
  if (error) {
    console.error('Error inserting fee templates:', error);
  } else {
    console.log(`Inserted ${templatesToInsert.length} fee templates.`);
  }

  // Add 1 test student in Class 1
  const studentId = uuid();
  await supabase.from('students').insert({
    id: studentId,
    schoolId,
    nisn: '001001001',
    nik: '340400000001',
    fullName: 'Budi Santoso',
    gender: 'L',
    birthDate: '2019-01-01T00:00:00Z',
    birthPlace: 'Bantul',
    address: 'Pajangan',
    city: 'Bantul',
    province: 'Yogyakarta',
    status: 'AKTIF',
    entryDate: new Date().toISOString(),
    classId: classIds[1],
    updatedAt: new Date().toISOString()
  });
  console.log('Test student created in Class 1.');

  // Create Bill for Student
  const billId = uuid();
  await supabase.from('student_bills').insert({
    id: billId,
    studentId,
    academicYearId,
    title: 'Biaya Tahunan & Buku Kelas 1 (2026/2027)',
    totalAmount: 1125000 + 382000,
    paidAmount: 0,
    status: 'BELUM_BAYAR',
    updatedAt: new Date().toISOString()
  });
  console.log('Test bill created.');

  console.log('Seed completed successfully!');
}

seed().catch(console.error);
