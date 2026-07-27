export interface FeeTemplate {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeLevel: number;
  name: string;
  category: string;
  amount: number;
  description?: string;
  createdAt: string;
}

export interface StudentBill {
  id: string;
  studentId: string;
  title: string;
  totalAmount: number;
  paidAmount: number;
  status: 'BELUM_BAYAR' | 'SEBAGIAN' | 'LUNAS';
  dueDate?: string;
  academicYearId: string;
  createdAt: string;
  updatedAt: string;
  student?: {
    fullName: string;
    nisn: string;
    classes: { name: string } | null;
  };
}

export interface PaymentTransaction {
  id: string;
  billId: string;
  studentId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string;
  recordedBy?: string;
  status: 'PENDING' | 'BERHASIL' | 'DIBATALKAN';
}
