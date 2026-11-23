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

export interface GenerateReportPdfInput {
  mode: ReportExamMode; // 'STS' atau 'SAS'
  lang?: 'id' | 'en';
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

interface LoadedImageAsset {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
}

/**
 * Mengonversi URL gambar (Supabase Storage) ke DataURL Base64 & mendeteksi formatnya
 */
async function fetchImageAsDataUrl(
  url?: string | null
): Promise<LoadedImageAsset | null> {
  if (!url || url.trim() === '') return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const format: 'PNG' | 'JPEG' =
      blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG';

    return await new Promise<LoadedImageAsset | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(
          typeof reader.result === 'string'
            ? { dataUrl: reader.result, format }
            : null
        );
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Memformat tanggal YYYY-MM-DD secara lokal agar tidak tergeser oleh konversi UTC
 */
function formatTanggalRaport(
  dateStr?: string | null,
  lang: 'id' | 'en' = 'id'
): string {
  const locale = lang === 'en' ? 'en-US' : 'id-ID';
  if (!dateStr) {
    return new Date().toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  const parsed = isoMatch
    ? new Date(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3])
      )
    : new Date(dateStr);

  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getFaseKurikulumMerdeka(
  gradeLevel: number,
  lang: 'id' | 'en' = 'id'
): string {
  const prefix = lang === 'en' ? 'Phase' : 'Fase';
  if (gradeLevel >= 1 && gradeLevel <= 2) return `${prefix} A`;
  if (gradeLevel >= 3 && gradeLevel <= 4) return `${prefix} B`;
  if (gradeLevel >= 5 && gradeLevel <= 6) return `${prefix} C`;
  if (gradeLevel >= 7 && gradeLevel <= 9) return `${prefix} D`;
  if (gradeLevel === 10) return `${prefix} E`;
  if (gradeLevel === 11 || gradeLevel === 12) return `${prefix} F`;
  return lang === 'en' ? `Grade ${gradeLevel}` : `Kelas ${gradeLevel}`;
}

function formatPromotionLabel(
  status: PromotionStatus,
  gradeLevel: number,
  lang: 'id' | 'en' = 'id'
): string {
  if (lang === 'en') {
    switch (status) {
      case 'NAIK_KELAS':
        return `PROMOTED TO GRADE ${gradeLevel + 1}`;
      case 'TINGGAL_KELAS':
        return `RETAINED IN GRADE ${gradeLevel}`;
      case 'LULUS':
        return 'GRADUATED FROM EDUCATIONAL UNIT';
      case 'TIDAK_LULUS':
        return 'NOT GRADUATED';
      default:
        return 'UNDER SEMESTER EVALUATION';
    }
  }

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

/**
 * Mengelompokkan mata pelajaran berdasarkan kategori Kurikulum Merdeka
 */
function groupSubjectsByCategory(
  subjects: SubjectOption[],
  lang: 'id' | 'en' = 'id'
): Array<{ groupTitle: string; items: SubjectOption[] }> {
  const sorted = [...subjects].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });

  const groups = new Map<string, SubjectOption[]>();
  sorted.forEach((subj) => {
    const cat = (subj.category || 'UMUM').toUpperCase().trim();
    let title =
      lang === 'en'
        ? 'General / Compulsory Subjects'
        : 'Kelompok Mata Pelajaran Umum';

    if (cat === 'PILIHAN') {
      title =
        lang === 'en' ? 'Elective Subjects' : 'Kelompok Mata Pelajaran Pilihan';
    } else if (cat === 'MUATAN_LOKAL' || cat === 'MULOK') {
      title = lang === 'en' ? 'Local Content' : 'Muatan Lokal';
    } else if (cat === 'KEJURUAN') {
      title =
        lang === 'en'
          ? 'Vocational / Specialization Subjects'
          : 'Kelompok Mata Pelajaran Kejuruan';
    } else if (cat === 'KOKURIKULER') {
      title = lang === 'en' ? 'Co-curricular / Project' : 'Kokurikuler / Projek';
    } else if (cat !== 'UMUM') {
      title = lang === 'en' ? `Group ${cat}` : `Kelompok ${cat}`;
    }

    const list = groups.get(title) ?? [];
    list.push(subj);
    groups.set(title, list);
  });

  return Array.from(groups.entries()).map(([groupTitle, items]) => ({
    groupTitle,
    items,
  }));
}

/**
 * Merender satu raport siswa ke dalam instance jsPDF yang diberikan
 */
async function renderSingleReportIntoDoc(
  doc: AutoTableDoc,
  input: GenerateReportPdfInput,
  preloadedSchoolAssets?: {
    logoAsset: LoadedImageAsset | null;
    signatureAsset: LoadedImageAsset | null;
    stampAsset: LoadedImageAsset | null;
  }
): Promise<void> {
  const {
    mode,
    lang = 'id',
    school,
    classContext,
    student,
    subjects,
    grades,
    reportNote,
    achievements,
  } = input;

  const isEn = lang === 'en';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;

  const assets =
    preloadedSchoolAssets ??
    (await (async () => {
      const [logoAsset, signatureAsset, stampAsset] = await Promise.all([
        fetchImageAsDataUrl(school.logoUrl),
        fetchImageAsDataUrl(school.principalSignatureUrl),
        fetchImageAsDataUrl(school.schoolStampUrl),
      ]);
      return { logoAsset, signatureAsset, stampAsset };
    })());

  let cursorY = 14;

  // 1. KOP SURAT SEKOLAH
  if (assets.logoAsset) {
    try {
      doc.addImage(
        assets.logoAsset.dataUrl,
        assets.logoAsset.format,
        marginX,
        cursorY - 2,
        18,
        18
      );
    } catch {
      // Abaikan jika format gambar tidak didukung
    }
  }

  const headerCenterX = assets.logoAsset ? pageWidth / 2 + 6 : pageWidth / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(school.name.toUpperCase(), headerCenterX, cursorY + 3, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const addressLine = `${school.address}, ${school.city}, ${school.province}${
    school.postalCode ? ` ${school.postalCode}` : ''
  }`;
  doc.text(addressLine, headerCenterX, cursorY + 8, { align: 'center' });

  const phoneLabel = isEn ? 'Phone' : 'Telp';
  const contactLine = `NPSN: ${school.npsn}${
    school.phone ? ` | ${phoneLabel}: ${school.phone}` : ''
  }${school.email ? ` | Email: ${school.email}` : ''}`;
  doc.text(contactLine, headerCenterX, cursorY + 12.5, { align: 'center' });

  cursorY += 17;
  doc.setLineWidth(0.7);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1, pageWidth - marginX, cursorY + 1);

  cursorY += 7;

  // 2. JUDUL RAPORT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleText =
    mode === 'STS'
      ? isEn
        ? 'MID-SEMESTER LEARNING REPORT CARD (STS)'
        : 'LAPORAN HASIL BELAJAR TENGAH SEMESTER (STS)'
      : isEn
        ? 'END-OF-SEMESTER LEARNING REPORT CARD (SAS)'
        : 'LAPORAN HASIL BELAJAR AKHIR SEMESTER (SAS)';
  doc.text(titleText, pageWidth / 2, cursorY, { align: 'center' });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    isEn ? 'MERDEKA CURRICULUM' : 'KURIKULUM MERDEKA',
    pageWidth / 2,
    cursorY + 4.5,
    {
      align: 'center',
    }
  );

  cursorY += 10;

  // 3. IDENTITAS PESERTA DIDIK
  doc.setFontSize(9);
  const leftColX = marginX;
  const leftValX = marginX + 34;
  const rightColX = pageWidth / 2 + 6;
  const rightValX = rightColX + 32;

  const faseLabel = getFaseKurikulumMerdeka(classContext.gradeLevel, lang);

  const identityRows: Array<[string, string, string, string]> = [
    [
      isEn ? 'Student Name' : 'Nama Peserta Didik',
      student.fullName,
      isEn ? 'Class / Phase' : 'Kelas / Fase',
      `${classContext.className} (${faseLabel})`,
    ],
    [
      'NIS / NISN',
      `${student.nis || '-'} / ${student.nisn}`,
      'Semester',
      classContext.semesterType,
    ],
    [
      isEn ? 'School Name' : 'Satuan Pendidikan',
      school.name,
      isEn ? 'Academic Year' : 'Tahun Ajaran',
      classContext.academicYearName,
    ],
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

  // 4. TABEL NILAI & CAPAIAN KOMPETENSI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    isEn
      ? 'A. SUBJECT GRADES & COMPETENCY ACHIEVEMENTS'
      : 'A. NILAI MATA PELAJARAN & CAPAIAN KOMPETENSI',
    marginX,
    cursorY
  );
  cursorY += 2.5;

  const gradeBySubject = new Map<string, StudentGradeRecord>();
  grades.forEach((g) => gradeBySubject.set(g.subjectId, g));

  const groupedSubjects = groupSubjectsByCategory(subjects, lang);
  const tableRows: Array<
    Array<
      | string
      | { content: string; colSpan: number; styles?: Record<string, unknown> }
    >
  > = [];
  let rowIndex = 1;

  groupedSubjects.forEach((group) => {
    if (groupedSubjects.length > 1) {
      tableRows.push([
        {
          content: group.groupTitle,
          colSpan: 4,
          styles: {
            fillColor: [241, 245, 249],
            fontStyle: 'bold',
            textColor: [30, 41, 59],
          },
        },
      ]);
    }

    group.items.forEach((subj) => {
      const g = gradeBySubject.get(subj.id);
      const scoreValue =
        mode === 'STS'
          ? (g?.stsScore ?? g?.formativeAvg ?? null)
          : (g?.finalScore ?? null);

      const scoreDisplay =
        scoreValue !== null && scoreValue !== undefined
          ? String(Math.round(scoreValue))
          : '-';
      const descDisplay =
        mode === 'STS'
          ? g?.stsCompetencyDescription || g?.competencyDescription || '-'
          : g?.competencyDescription || '-';

      tableRows.push([String(rowIndex++), subj.name, scoreDisplay, descDisplay]);
    });
  });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'No',
        isEn ? 'Subject' : 'Mata Pelajaran',
        mode === 'STS'
          ? isEn
            ? 'STS Score'
            : 'Nilai STS'
          : isEn
            ? 'Final Score'
            : 'Nilai Akhir',
        isEn ? 'Competency Achievement' : 'Capaian Kompetensi',
      ],
    ],
    body:
      tableRows.length > 0
        ? tableRows
        : [
            [
              '-',
              isEn
                ? 'No active subjects recorded'
                : 'Belum ada mata pelajaran aktif',
              '-',
              '-',
            ],
          ],
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

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > pageHeight - 15) {
      doc.addPage();
      cursorY = 16;
    }
  };

  // 5. EKSTRAKURIKULER, KOKURIKULER P5 & PRESTASI (KHUSUS SAS)
  if (mode === 'SAS') {
    ensureSpace(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      isEn ? 'B. EXTRACURRICULAR ACTIVITIES' : 'B. KEGIATAN EKSTRAKURIKULER',
      marginX,
      cursorY
    );
    cursorY += 2.5;

    const extraRows =
      reportNote.extracurriculars.length > 0
        ? reportNote.extracurriculars.map((ex, i) => [
            String(i + 1),
            ex.name || '-',
            ex.predicate || '-',
            ex.description || '-',
          ])
        : [
            [
              '1',
              '-',
              '-',
              isEn
                ? 'Did not participate in extracurricular activities'
                : 'Tidak mengikuti kegiatan ekstrakurikuler',
            ],
          ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'No',
          isEn ? 'Extracurricular Activity' : 'Kegiatan Ekstrakurikuler',
          isEn ? 'Predicate' : 'Predikat',
          isEn ? 'Remarks' : 'Keterangan',
        ],
      ],
      body: extraRows,
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 2.2,
        lineColor: [120, 120, 120],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 52 },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: contentWidth - 86 },
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

    // Bagian C selalu dirender pada mode SAS agar penomoran sub-bab tetap konsisten
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      isEn
        ? 'C. CO-CURRICULAR / PANCASILA STUDENT PROFILE PROJECT (P5)'
        : 'C. KOKURIKULER / PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5)',
      marginX,
      cursorY
    );
    cursorY += 2.5;

    const p5BodyText =
      reportNote.cocurricularNote && reportNote.cocurricularNote.trim() !== ''
        ? reportNote.cocurricularNote
        : isEn
          ? 'No P5 project achievement description recorded for this semester.'
          : 'Belum ada catatan capaian projek P5 pada semester ini.';

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      body: [[p5BodyText]],
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        lineColor: [120, 120, 120],
        lineWidth: 0.2,
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

    if (achievements.length > 0) {
      ensureSpace(26);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(
        isEn ? 'D. STUDENT ACHIEVEMENTS' : 'D. PRESTASI PESERTA DIDIK',
        marginX,
        cursorY
      );
      cursorY += 2.5;

      const achRows = achievements.map((ach, idx) => [
        String(idx + 1),
        `${ach.title}${ach.rank ? ` (${ach.rank})` : ''}`,
        isEn
          ? `${ach.category} - ${ach.level} Level (${ach.year})`
          : `${ach.category} - Tingkat ${ach.level} (${ach.year})`,
      ]);

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        head: [
          [
            'No',
            isEn ? 'Achievement Title' : 'Jenis / Nama Prestasi',
            isEn ? 'Level & Year' : 'Tingkat & Penyelenggara',
          ],
        ],
        body: achRows,
        theme: 'grid',
        styles: {
          fontSize: 8.5,
          cellPadding: 2.2,
          lineColor: [120, 120, 120],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 80 },
          2: { cellWidth: contentWidth - 90 },
        },
      });

      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;
    }
  }

  // 6. KETIDAKHADIRAN & CATATAN WALI KELAS
  ensureSpace(34);
  const sectionLetter =
    mode === 'STS' ? 'B' : achievements.length > 0 ? 'E' : 'D';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    isEn
      ? `${sectionLetter}. ATTENDANCE & HOMEROOM TEACHER NOTES`
      : `${sectionLetter}. KETIDAKHADIRAN & CATATAN WALI KELAS`,
    marginX,
    cursorY
  );
  cursorY += 2.5;

  const sakit = mode === 'STS' ? reportNote.stsSickDays : reportNote.sickDays;
  const izin =
    mode === 'STS' ? reportNote.stsPermissionDays : reportNote.permissionDays;
  const alpha =
    mode === 'STS' ? reportNote.stsAlphaDays : reportNote.alphaDays;
  const walasNote =
    mode === 'STS'
      ? reportNote.stsHomeroomNote ||
        (isEn
          ? 'Keep up your enthusiasm for learning and discipline at school.'
          : 'Terus tingkatkan semangat belajar dan kedisiplinan di sekolah.')
      : reportNote.homeroomNote ||
        (isEn
          ? 'Maintain the good achievements and character demonstrated throughout this semester.'
          : 'Pertahankan prestasi dan sikap baik yang telah dicapai selama semester ini.');

  const dayUnit = isEn ? 'days' : 'hari';

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [
      [
        isEn ? 'Attendance Summary' : 'Rekap Ketidakhadiran',
        isEn ? 'Days' : 'Hari',
        isEn ? 'Homeroom Teacher Notes' : 'Catatan Wali Kelas',
      ],
    ],
    body: [
      [
        isEn ? 'Sick' : 'Sakit',
        `${sakit} ${dayUnit}`,
        { content: walasNote, rowSpan: 3, styles: { valign: 'top' } },
      ],
      [isEn ? 'Permission' : 'Izin', `${izin} ${dayUnit}`],
      [
        isEn ? 'Unexcused (Alpha)' : 'Tanpa Keterangan (Alpha)',
        `${alpha} ${dayUnit}`,
      ],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2.3,
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: contentWidth - 70 },
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 6;

  // 7. KEPUTUSAN KENAIKAN KELAS / KELULUSAN (KHUSUS SAS SEMESTER GENAP)
  if (mode === 'SAS' && classContext.semesterType === 'GENAP') {
    ensureSpace(18);
    const decisionText = isEn
      ? `Decision: Based on the achievement of all competencies in the odd and even semesters, the student is declared: ${formatPromotionLabel(
          reportNote.promotionStatus,
          classContext.gradeLevel,
          lang
        )}`
      : `Keputusan: Berdasarkan pencapaian seluruh kompetensi pada semester ganjil dan genap, peserta didik ditetapkan: ${formatPromotionLabel(
          reportNote.promotionStatus,
          classContext.gradeLevel,
          lang
        )}`;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      body: [[decisionText]],
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

  // 8. BLOK TANDA TANGAN (ORANG TUA, WALI KELAS & KEPALA SEKOLAH + STEMPEL)
  ensureSpace(46);
  const reportDateFormatted = formatTanggalRaport(
    mode === 'STS' ? reportNote.reportDateSts : reportNote.reportDateSas,
    lang
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.text(isEn ? 'Acknowledged by,' : 'Mengetahui,', marginX, cursorY + 4);
  doc.text(
    isEn ? 'Parent / Legal Guardian,' : 'Orang Tua / Wali Peserta Didik,',
    marginX,
    cursorY + 8.5
  );

  const rightSignX = pageWidth - marginX - 62;
  doc.text(`${school.city}, ${reportDateFormatted}`, rightSignX, cursorY + 4);
  doc.text(
    isEn ? 'Homeroom Teacher,' : 'Wali Kelas,',
    rightSignX,
    cursorY + 8.5
  );

  cursorY += 25;
  doc.text('( ........................................ )', marginX, cursorY);

  doc.setFont('helvetica', 'bold');
  doc.text(classContext.homeroomTeacherName, rightSignX, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `NIP/NBM. ${classContext.homeroomTeacherNip || '-'}`,
    rightSignX,
    cursorY + 4
  );

  if (mode === 'SAS') {
    cursorY += 9;
    ensureSpace(34);
    const centerSignX = pageWidth / 2 - 30;
    doc.setFontSize(9);
    doc.text(isEn ? 'Approved by,' : 'Mengetahui,', centerSignX, cursorY);
    doc.text(
      isEn ? 'School Principal,' : 'Kepala Sekolah,',
      centerSignX,
      cursorY + 4.5
    );

    if (assets.signatureAsset) {
      try {
        doc.addImage(
          assets.signatureAsset.dataUrl,
          assets.signatureAsset.format,
          centerSignX + 4,
          cursorY + 5,
          36,
          16
        );
      } catch {
        // Fallback jika gagal render gambar
      }
    }
    if (assets.stampAsset) {
      try {
        doc.addImage(
          assets.stampAsset.dataUrl,
          assets.stampAsset.format,
          centerSignX - 8,
          cursorY + 3,
          22,
          22
        );
      } catch {
        // Fallback jika gagal render gambar
      }
    }

    cursorY += 22;
    doc.setFont('helvetica', 'bold');
    doc.text(
      school.principalName || '( ........................................ )',
      centerSignX,
      cursorY
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      `NIP/NBM. ${school.principalNip || '-'}`,
      centerSignX,
      cursorY + 4
    );
  }
}

/**
 * Mengunduh PDF Raport untuk 1 siswa
 */
export async function generateCurriculumMerdekaReportPdf(
  input: GenerateReportPdfInput
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as AutoTableDoc;

  await renderSingleReportIntoDoc(doc, input);

  const cleanStudentName = input.student.fullName.replace(/[^a-zA-Z0-9]+/g, '_');
  const fileName = `Raport_${input.mode}_${input.classContext.className}_${cleanStudentName}.pdf`;
  doc.save(fileName);
}

/**
 * Mengunduh gabungan 1 PDF berisi seluruh raport siswa dalam 1 kelas
 */
export async function generateClassBatchReportPdf(
  inputs: GenerateReportPdfInput[]
): Promise<void> {
  if (inputs.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as AutoTableDoc;

  const firstSchool = inputs[0].school;
  const [logoAsset, signatureAsset, stampAsset] = await Promise.all([
    fetchImageAsDataUrl(firstSchool.logoUrl),
    fetchImageAsDataUrl(firstSchool.principalSignatureUrl),
    fetchImageAsDataUrl(firstSchool.schoolStampUrl),
  ]);

  for (let i = 0; i < inputs.length; i++) {
    if (i > 0) {
      doc.addPage('a4', 'portrait');
    }
    await renderSingleReportIntoDoc(doc, inputs[i], {
      logoAsset,
      signatureAsset,
      stampAsset,
    });
  }

  const first = inputs[0];
  const fileName = `Raport_${first.mode}_Kelas_${first.classContext.className}_Semua_Siswa.pdf`;
  doc.save(fileName);
}