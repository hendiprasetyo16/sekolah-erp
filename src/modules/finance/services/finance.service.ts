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

class FinanceService {
  async getSummary(): Promise<FinanceSummary> {
    // In a real app, this would be a complex view or RPC function.
    // For MVP, we'll fetch basic aggregates or return placeholder logic if needed,
    // but here we do actual queries.
    
    const { data: incomeData } = await supabase
      .from('payment_transactions')
      .select('amount')
      .eq('status', 'BERHASIL');

    const totalIncome = incomeData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
    
    // For expense, we don't have an expenses table yet, so we mock it based on a ratio for MVP,
    // or return 0. We'll use 0 for now.
    const totalExpense = 0;

    const { data: billsData } = await supabase
      .from('student_bills')
      .select('totalAmount, paidAmount')
      .in('status', ['BELUM_BAYAR', 'SEBAGIAN']);

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

    return data.map((item: any) => ({
      ...item,
      studentName: item.students?.fullName,
      billTitle: item.student_bills?.title
    }));
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
      .in('status', ['BELUM_BAYAR', 'SEBAGIAN'])
      .limit(5);

    if (error) throw new Error(error.message);

    return data.map((item: any) => ({
      id: item.id,
      studentName: item.students?.fullName || 'Unknown',
      className: item.students?.classes?.name || '-',
      amount: Number(item.totalAmount) - Number(item.paidAmount),
      months: 1 // Simplified
    })).sort((a, b) => b.amount - a.amount);
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
        let newStatus = 'SEBAGIAN';
        if (newPaidAmount >= Number(bill.totalAmount)) newStatus = 'LUNAS';
        await supabase.from('student_bills').update({ paidAmount: newPaidAmount, status: newStatus }).eq('id', payload.billId);
      }
    }
    
    return data as PaymentTransaction;
  }
}

export const financeService = new FinanceService();
