// src/modules/grades/types/grade.types.ts

export type ReportExamMode = 'STS' | 'SAS';

export type PromotionStatus =
  | 'PROSES'
  | 'NAIK_KELAS'
  | 'TINGGAL_KELAS'
  | 'LULUS'
  | 'TIDAK_LULUS';

export interface GradeWeights {
  formative: number; // Contoh: 40
  sts: number;       // Contoh: 30
  sas: number;       // Contoh: 30
}

export interface ExtracurricularItem {
  name: string;
  predicate: string;
  description: string;
}

export interface StudentGradeRecord {
  id?: string;
  schoolId: string;
  academicYearId: string;
  semesterId: string;
  classId: string;
  studentId: string;
  subjectId: string;
  teacherId?: string | null;
  formativeScores: number[];
  formativeAvg: number | null;
  stsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  predicate: string | null;
  stsCompetencyDescription: string | null;
  competencyDescription: string | null;
}

export interface StudentReportNoteRecord {
  id?: string;
  schoolId: string;
  academicYearId: string;
  semesterId: string;
  classId: string;
  studentId: string;
  extracurriculars: ExtracurricularItem[];
  cocurricularNote: string | null;
  stsHomeroomNote: string | null;
  homeroomNote: string | null;
  stsSickDays: number;
  stsPermissionDays: number;
  stsAlphaDays: number;
  sickDays: number;
  permissionDays: number;
  alphaDays: number;
  promotionStatus: PromotionStatus;
  reportDateSts: string | null;
  reportDateSas: string | null;
  isStsPublished: boolean;
  isSasPublished: boolean;
}

export interface StudentAchievementItem {
  id: string;
  title: string;
  category: string;
  level: string;
  rank: string | null;
  year: number;
  organizer: string | null;
  showOnReport: boolean;
}

export interface ClassRankingRow {
  studentId: string;
  nis: string | null;
  nisn: string;
  fullName: string;
  gender: string;
  gradedSubjects: number;
  totalScore: number;
  averageScore: number;
  rank: number | null;
}

export interface SchoolReportProfile {
  id: string;
  name: string;
  npsn: string;
  level: string;
  address: string;
  city: string;
  province: string;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  principalName?: string | null;
  principalNip?: string | null;
  principalSignatureUrl?: string | null;
  schoolStampUrl?: string | null;
}

export interface StudentBasicProfile {
  id: string;
  nis: string | null;
  nisn: string;
  fullName: string;
  gender: string;
  birthPlace: string;
  birthDate: string;
  religion?: string | null;
  address: string;
}

export interface ClassReportContext {
  classId: string;
  className: string;
  gradeLevel: number;
  major?: string | null;
  academicYearName: string;
  semesterType: 'GANJIL' | 'GENAP';
  homeroomTeacherName: string;
  homeroomTeacherNip?: string | null;
}

export interface SubjectOption {
  id: string;
  code: string | null;
  name: string;
  category: string;
  sortOrder: number;
}

export interface ServiceResponse<T> {
  success: boolean;
  data: T;
  message: string;
}