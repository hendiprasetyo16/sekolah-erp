// src/modules/grades/utils/reportPdfGenerator.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ClassReportContext,
  PromotionStatus,
  ReportExamMode,
  SchoolReportProfile,
  StudentAchievementItem,
  StudentBasicProfile,
  StudentGradeRecord,
  StudentReportNoteRecord,
  SubjectOption,
} from '../types/grade.types';

interface GenerateReportPdfInput {
  mode: ReportExamMode; // 'STS' atau 'SAS'
  school: SchoolReportProfile;
  classContext: ClassReportContext;
  student: StudentBasicProfile;
  subjects: SubjectOption[];
  grades: StudentGradeRecord[];
  reportNote: StudentReportNoteRecord;
  achievements: StudentAchievementItem[];
}

interface AutoTableDoc extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

/**
 * Mengonversi URL gambar (Supabase Storage) ke DataURL Base64 secara aman
 */
async function fetchImageAsDataUrl(url?: string | null): Promise<string | null> {
  if (!url || url.trim() === '') return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatTanggalIndonesia(dateStr?: string | null): string {
  if (!dateStr) {
    return new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatPromotionLabel(status: PromotionStatus, gradeLevel: number): string {
  switch (status) {
    case 'NAIK_KELAS':
      return `NAIK KE KELAS ${gradeLevel + 1}`;
    case 'TINGGAL_KELAS':
      return `TINGGAL DI KELAS ${gradeLevel}`;
    case 'LULUS':
      return 'LULUS DARI SATUAN PENDIDIKAN';
    case 'TIDAK_LULUS':
      return 'TIDAK LULUS';
    default:
      return 'DALAM PROSES EVALUASI SEMESTER';
  }
}

export async function generateCurriculumMerdekaReportPdf(
  input: GenerateReportPdfInput
): Promise<void> {
  const {
    mode,
    school,
    classContext,
    student,
    subjects,
    grades,
    reportNote,
    achievements,
  } = input;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as AutoTableDoc;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;

  // Muat gambar aset sekolah secara paralel
  const [logoBase64, signatureBase64, stampBase64] = await Promise.all([
    fetchImageAsDataUrl(school.logoUrl),
    fetchImageAsDataUrl(school.principalSignatureUrl),
    fetchImageAsDataUrl(school.schoolStampUrl),
  ]);

  let cursorY = 14;

  // ==========================================================================
  // 1. KOP SURAT SEKOLAH
  // ==========================================================================
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', marginX, cursorY - 2, 18, 18);
    } catch {
      // Abaikan jika format gambar tidak didukung
    }
  }

  const headerCenterX = logoBase64 ? pageWidth / 2 + 6 : pageWidth / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(school.name.toUpperCase(), headerCenterX, cursorY + 3, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const addressLine = `${school.address}, ${school.city}, ${school.province}${
    school.postalCode ? ` ${school.postalCode}` : ''
  }`;
  doc.text(addressLine, headerCenterX, cursorY + 8, { align: 'center' });

  const contactLine = `NPSN: ${school.npsn}${school.phone ? ` | Telp: ${school.phone}` : ''}${
    school.email ? ` | Email: ${school.email}` : ''
  }`;
  doc.text(contactLine, headerCenterX, cursorY + 12.5, { align: 'center' });

  cursorY += 17;
  doc.setLineWidth(0.7);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1, pageWidth - marginX, cursorY + 1);

  cursorY += 7;

  // ==========================================================================
  // 2. JUDUL RAPORT
  // ==========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleText =
    mode === 'STS'
      ? 'LAPORAN HASIL BELAJAR TENGAH SEMESTER (STS)'
      : 'LAPORAN HASIL BELAJAR AKHIR SEMESTER (SAS)';
  doc.text(titleText, pageWidth / 2, cursorY, { align: 'center' });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('KURIKULUM MERDEKA', pageWidth / 2, cursorY + 4.5, { align: 'center' });

  cursorY += 10;

  // ==========================================================================
  // 3. IDENTITAS PESERTA DIDIK (2 KOLOM)
  // ==========================================================================
  doc.setFontSize(9);
  const leftColX = marginX;
  const leftValX = marginX + 34;
  const rightColX = pageWidth / 2 + 6;
  const rightValX = rightColX + 32;

  const faseLabel =
    classContext.gradeLevel === 10
      ? 'Fase E'
      : classContext.gradeLevel >= 11
      ? 'Fase F'
      : `Kelas ${classContext.gradeLevel}`;

  const identityRows: Array<[string, string, string, string]> = [
    ['Nama Peserta Didik', student.fullName, 'Kelas / Fase', `${classContext.className} (${faseLabel})`],
    ['NIS / NISN', `${student.nis || '-'} / ${student.nisn}`, 'Semester', classContext.semesterType],
    ['Satuan Pendidikan', school.name, 'Tahun Ajaran', classContext.academicYearName],
  ];

  identityRows.forEach(([lLabel, lVal, rLabel, rVal]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(lLabel, leftColX, cursorY);
    doc.text(':', leftValX - 2, cursorY);
    doc.setFont('helvetica', 'bold');
    doc.text(lVal, leftValX, cursorY, { maxWidth: 56 });

    doc.setFont('helvetica', 'normal');
    doc.text(rLabel, rightColX, cursorY);
    doc.text(':', rightValX - 2, cursorY);
    doc.setFont('helvetica', 'bold');
    doc.text(rVal, rightValX, cursorY, { maxWidth: 48 });

    cursorY += 5;
  });

  cursorY += 3;

  // ==========================================================================
  // 4. TABEL NILAI & CAPAIAN KOMPETENSI (A. INTRAKURIKULER)
  // ==========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('A. NILAI MATA PELAJARAN & CAPAIAN KOMPETENSI', marginX, cursorY);
  cursorY += 2.5;

  const gradeBySubject = new Map<string, StudentGradeRecord>();
  grades.forEach((g) => gradeBySubject.set(g.subjectId, g));

  const tableRows = subjects.map((subj, idx) => {
    const g = gradeBySubject.get(subj.id);
    const scoreValue =
      mode === 'STS'
        ? g?.stsScore ?? g?.formativeAvg ?? null
        : g?.finalScore ?? null;

    const scoreDisplay = scoreValue !== null && scoreValue !== undefined ? String(Math.round(scoreValue)) : '-';
    const descDisplay =
      mode === 'STS'
        ? g?.stsCompetencyDescription || g?.competencyDescription || '-'
        : g?.competencyDescription || '-';

    return [String(idx + 1), subj.name, scoreDisplay, descDisplay];
  });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [['No', 'Mata Pelajaran', mode === 'STS' ? 'Nilai STS' : 'Nilai Akhir', 'Capaian Kompetensi']],
    body: tableRows.length > 0 ? tableRows : [['-', 'Belum ada mata pelajaran aktif', '-', '-']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [20, 20, 20],
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: contentWidth - 82, halign: 'left' },
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

  // Helper cek sisa halaman sebelum menggambar blok baru
  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > pageHeight - 15) {
      doc.addPage();
      cursorY = 16;
    }
  };

  // ==========================================================================
  // 5. EKSTRAKURIKULER & KOKURIKULER (KHUSUS RAPORT SAS / AKHIR)
  // ==========================================================================
  if (mode === 'SAS') {
    ensureSpace(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('B. KEGIATAN EKSTRAKURIKULER', marginX, cursorY);
    cursorY += 2.5;

    const extraRows =
      reportNote.extracurriculars.length > 0
        ? reportNote.extracurriculars.map((ex, i) => [
            String(i + 1),
            ex.name || '-',
            ex.predicate || '-',
            ex.description || '-',
          ])
        : [['1', '-', '-', 'Tidak mengikuti kegiatan ekstrakurikuler']];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Kegiatan Ekstrakurikuler', 'Predikat', 'Keterangan']],
      body: extraRows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [120, 120, 120], lineWidth: 0.2 },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 52 },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: contentWidth - 86 },
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

    // Kokurikuler / Projek P5
    if (reportNote.cocurricularNote && reportNote.cocurricularNote.trim() !== '') {
      ensureSpace(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('C. CATATAN KOKURIKULER / PROJEK PENGUATAN PROFIL PELAJAR PANCASILA', marginX, cursorY);
      cursorY += 2.5;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        body: [[reportNote.cocurricularNote]],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, lineColor: [120, 120, 120], lineWidth: 0.2 },
      });

      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;
    }

    // Prestasi Siswa (jika ada dan showOnReport = true)
    if (achievements.length > 0) {
      ensureSpace(26);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('D. PRESTASI PESERTA DIDIK', marginX, cursorY);
      cursorY += 2.5;

      const achRows = achievements.map((ach, idx) => [
        String(idx + 1),
        `${ach.title}${ach.rank ? ` (${ach.rank})` : ''}`,
        `${ach.category} - Tingkat ${ach.level} (${ach.year})`,
      ]);

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        head: [['No', 'Jenis / Nama Prestasi', 'Tingkat & Penyelenggara']],
        body: achRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [120, 120, 120], lineWidth: 0.2 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], halign: 'center' },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 80 },
          2: { cellWidth: contentWidth - 90 },
        },
      });

      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;
    }
  }

  // ==========================================================================
  // 6. KETIDAKHADIRAN & CATATAN WALI KELAS (BERDAMPINGAN)
  // ==========================================================================
  ensureSpace(34);
  const sectionLetter = mode === 'STS' ? 'B' : achievements.length > 0 ? 'E' : 'D';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${sectionLetter}. KETIDAKHADIRAN & CATATAN WALI KELAS`, marginX, cursorY);
  cursorY += 2.5;

  const sakit = mode === 'STS' ? reportNote.stsSickDays : reportNote.sickDays;
  const izin = mode === 'STS' ? reportNote.stsPermissionDays : reportNote.permissionDays;
  const alpha = mode === 'STS' ? reportNote.stsAlphaDays : reportNote.alphaDays;
  const walasNote =
    mode === 'STS'
      ? reportNote.stsHomeroomNote || 'Terus tingkatkan semangat belajar dan kedisiplinan di sekolah.'
      : reportNote.homeroomNote || 'Pertahankan prestasi dan sikap baik yang telah dicapai selama semester ini.';

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [['Rekap Ketidakhadiran', 'Hari', 'Catatan Wali Kelas']],
    body: [
      ['Sakit', `${sakit} hari`, { content: walasNote, rowSpan: 3, styles: { valign: 'top' } }],
      ['Izin', `${izin} hari`],
      ['Tanpa Keterangan (Alpha)', `${alpha} hari`],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.3, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], halign: 'center' },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: contentWidth - 70 },
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

  // ==========================================================================
  // 7. KEPUTUSAN KENAIKAN KELAS / KELULUSAN (KHUSUS SAS SEMESTER GENAP)
  // ==========================================================================
  if (mode === 'SAS' && classContext.semesterType === 'GENAP') {
    ensureSpace(18);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      body: [
        [
          `Keputusan: Berdasarkan pencapaian seluruh kompetensi pada semester ganjil dan genap, peserta didik ditetapkan: ${formatPromotionLabel(
            reportNote.promotionStatus,
            classContext.gradeLevel
          )}`,
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        fontStyle: 'bold',
        cellPadding: 3,
        fillColor: [241, 245, 249],
        lineColor: [100, 116, 139],
        lineWidth: 0.3,
      },
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;
  }

  // ==========================================================================
  // 8. BLOK TANDA TANGAN (ORANG TUA, WALI KELAS & KEPALA SEKOLAH + STEMPEL)
  // ==========================================================================
  ensureSpace(46);
  const reportDateFormatted = formatTanggalIndonesia(
    mode === 'STS' ? reportNote.reportDateSts : reportNote.reportDateSas
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Baris 1: Orang Tua/Wali & Wali Kelas
  doc.text('Mengetahui,', marginX, cursorY + 4);
  doc.text('Orang Tua / Wali Peserta Didik,', marginX, cursorY + 8.5);

  const rightSignX = pageWidth - marginX - 62;
  doc.text(`${school.city}, ${reportDateFormatted}`, rightSignX, cursorY + 4);
  doc.text('Wali Kelas,', rightSignX, cursorY + 8.5);

  cursorY += 25;
  doc.text('( ........................................ )', marginX, cursorY);

  doc.setFont('helvetica', 'bold');
  doc.text(classContext.homeroomTeacherName, rightSignX, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`NIP/NBM. ${classContext.homeroomTeacherNip || '-'}`, rightSignX, cursorY + 4);

  // Baris 2: Mengetahui Kepala Sekolah (Khusus SAS / Raport Akhir)
  if (mode === 'SAS') {
    cursorY += 9;
    ensureSpace(34);
    const centerSignX = pageWidth / 2 - 30;
    doc.setFontSize(9);
    doc.text('Mengetahui,', centerSignX, cursorY);
    doc.text('Kepala Sekolah,', centerSignX, cursorY + 4.5);

    // Tempelkan TTD Kepala Sekolah & Stempel Sekolah jika tersedia
    if (signatureBase64) {
      try {
        doc.addImage(signatureBase64, 'PNG', centerSignX + 4, cursorY + 5, 36, 16);
      } catch {
        // Fallback jika gagal render gambar
      }
    }
    if (stampBase64) {
      try {
        doc.addImage(stampBase64, 'PNG', centerSignX - 8, cursorY + 3, 22, 22);
      } catch {
        // Fallback jika gagal render gambar
      }
    }

    cursorY += 22;
    doc.setFont('helvetica', 'bold');
    doc.text(school.principalName || '( ........................................ )', centerSignX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`NIP/NBM. ${school.principalNip || '-'}`, centerSignX, cursorY + 4);
  }

  // Simpan file PDF otomatis
  const cleanStudentName = student.fullName.replace(/[^a-zA-Z0-9]+/g, '_');
  const fileName = `Raport_${mode}_${classContext.className}_${cleanStudentName}.pdf`;
  doc.save(fileName);
}