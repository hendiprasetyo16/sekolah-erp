// src/modules/finance/services/finance.service.ts
import { supabase } from '@/services/supabase.client';
import type { FeeTemplate, StudentBill, PaymentTransaction } from '../types/finance.types';

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  totalArrears: number;
  cashBalance: number;
  arrearsCount: number;
}

export interface Transaction {
  id: string;
  billId: string;
  studentId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference: string;
  status: string;
  studentName?: string;
  billTitle?: string;
}

export interface Arrear {
  id: string;
  studentName: string;
  className: string;
  amount: number;
  months: number;
}

// Struktur baris hasil query payment_transactions beserta relasinya
interface RecentTransactionQueryRow {
  id: string;
  billId: string;
  studentId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference: string;
  status: string;
  student_bills?: { title?: string | null } | Array<{ title?: string | null }> | null;
  students?: { fullName?: string | null } | Array<{ fullName?: string | null }> | null;
}

// Struktur baris hasil query student_bills untuk daftar tunggakan terbesar
interface TopArrearQueryRow {
  id: string;
  totalAmount: number | string;
  paidAmount: number | string;
  students?: {
    fullName?: string | null;
    classes?: { name?: string | null } | Array<{ name?: string | null }> | null;
  } | Array<{
    fullName?: string | null;
    classes?: { name?: string | null } | Array<{ name?: string | null }> | null;
  }> | null;
}

class FinanceService {
  async getSummary(): Promise<FinanceSummary> {
    const { data: incomeData } = await supabase
      .from('payment_transactions')
      .select('amount')
      .eq('status', 'BERHASIL');

    const totalIncome = incomeData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

    // Pengeluaran sementara 0 sampai tabel expenses tersedia
    const totalExpense = 0;

    const { data: billsData } = await supabase
      .from('student_bills')
      .select('totalAmount, paidAmount')
      .in('status', ['BELUM_BAYAR', 'CICILAN']);

    const totalArrears = billsData?.reduce((acc, curr) => acc + (Number(curr.totalAmount) - Number(curr.paidAmount)), 0) || 0;
    const arrearsCount = billsData?.length || 0;

    return {
      totalIncome,
      totalExpense,
      totalArrears,
      cashBalance: totalIncome - totalExpense,
      arrearsCount
    };
  }

  async getRevenueTrend(): Promise<{ name: string; income: number; expense: number }[]> {
    const { data } = await supabase
      .from('payment_transactions')
      .select('amount, paymentDate')
      .eq('status', 'BERHASIL')
      .order('paymentDate', { ascending: true });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const now = new Date();
    const result: { name: string; income: number; expense: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = monthNames[d.getMonth()];
      const year = d.getFullYear();
      const month = d.getMonth();

      let sum = 0;
      if (data) {
        data.forEach(item => {
          const itemDate = new Date(item.paymentDate);
          if (itemDate.getMonth() === month && itemDate.getFullYear() === year) {
            sum += Number(item.amount);
          }
        });
      }
      result.push({ name: mName, income: sum, expense: 0 });
    }

    return result;
  }

  async getRecentTransactions(): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select(`
        *,
        student_bills (title),
        students (fullName)
      `)
      .order('paymentDate', { ascending: false })
      .limit(8);

    if (error) throw new Error(error.message);

    const typedData = (data ?? []) as RecentTransactionQueryRow[];
    return typedData.map((item) => {
      const studentObj = Array.isArray(item.students) ? item.students[0] : item.students;
      const billObj = Array.isArray(item.student_bills) ? item.student_bills[0] : item.student_bills;

      return {
        id: item.id,
        billId: item.billId,
        studentId: item.studentId,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        paymentDate: item.paymentDate,
        reference: item.reference,
        status: item.status,
        studentName: studentObj?.fullName ?? undefined,
        billTitle: billObj?.title ?? undefined,
      };
    });
  }

  async getTopArrears(): Promise<Arrear[]> {
    const { data, error } = await supabase
      .from('student_bills')
      .select(`
        id,
        totalAmount,
        paidAmount,
        students (fullName, classes(name))
      `)
      .in('status', ['BELUM_BAYAR', 'CICILAN'])
      .limit(5);

    if (error) throw new Error(error.message);

    const typedData = (data ?? []) as TopArrearQueryRow[];
    return typedData
      .map((item) => {
        const studentObj = Array.isArray(item.students) ? item.students[0] : item.students;
        const classObj = studentObj?.classes
          ? Array.isArray(studentObj.classes)
            ? studentObj.classes[0]
            : studentObj.classes
          : undefined;

        return {
          id: item.id,
          studentName: studentObj?.fullName || 'Unknown',
          className: classObj?.name || '-',
          amount: Number(item.totalAmount) - Number(item.paidAmount),
          months: 1,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  // --- Fee Templates CRUD ---
  async getFeeTemplates() {
    const { data, error } = await supabase.from('fee_templates').select('*').order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return data as FeeTemplate[];
  }

  async createFeeTemplate(payload: Omit<FeeTemplate, 'id' | 'createdAt'>) {
    const { data, error } = await supabase.from('fee_templates').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data as FeeTemplate;
  }

  async updateFeeTemplate(id: string, payload: Partial<FeeTemplate>) {
    const { data, error } = await supabase.from('fee_templates').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data as FeeTemplate;
  }

  async deleteFeeTemplate(id: string) {
    const { error } = await supabase.from('fee_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }

  // --- Student Bills CRUD ---
  async getStudentBills() {
    const { data, error } = await supabase.from('student_bills').select(`*, students (fullName, nisn, classes(name))`).order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return data as StudentBill[];
  }

  async createStudentBill(payload: Omit<StudentBill, 'id' | 'createdAt' | 'updatedAt' | 'student'>) {
    const { data, error } = await supabase.from('student_bills').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data as StudentBill;
  }

  async updateStudentBill(id: string, payload: Partial<StudentBill>) {
    const { data, error } = await supabase.from('student_bills').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data as StudentBill;
  }

  async deleteStudentBill(id: string) {
    const { error } = await supabase.from('student_bills').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }

  // --- Payment Transactions CRUD ---
  async getPaymentTransactions() {
    const { data, error } = await supabase.from('payment_transactions').select('*').order('paymentDate', { ascending: false });
    if (error) throw new Error(error.message);
    return data as PaymentTransaction[];
  }

  async createPaymentTransaction(payload: Omit<PaymentTransaction, 'id'>) {
    const { data, error } = await supabase.from('payment_transactions').insert(payload).select().single();
    if (error) throw new Error(error.message);

    // Auto update bill paidAmount and status
    if (data) {
      const { data: bill } = await supabase.from('student_bills').select('*').eq('id', payload.billId).single();
      if (bill) {
        const newPaidAmount = Number(bill.paidAmount) + Number(payload.amount);
        let newStatus = 'CICILAN';
        if (newPaidAmount >= Number(bill.totalAmount)) newStatus = 'LUNAS';
        await supabase.from('student_bills').update({ paidAmount: newPaidAmount, status: newStatus }).eq('id', payload.billId);
      }
    }

    return data as PaymentTransaction;
  }
}

export const financeService = new FinanceService();