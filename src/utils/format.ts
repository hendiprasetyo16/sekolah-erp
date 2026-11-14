// src/utils/format.ts
import dayjs from 'dayjs';
import 'dayjs/locale/id';

export const formatCurrency = (amount: number | null | undefined): string => {
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const formatNumber = (num: number | null | undefined): string => {
  const safeNum = typeof num === 'number' && Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('id-ID').format(safeNum);
};

export const formatDate = (
  date: string | Date | null | undefined,
  format = 'DD MMMM YYYY'
): string => {
  if (!date) return '-';
  const parsed = dayjs(date);
  if (!parsed.isValid()) return '-';
  return parsed.locale('id').format(format);
};

export const formatDateShort = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const parsed = dayjs(date);
  if (!parsed.isValid()) return '-';
  return parsed.locale('id').format('DD/MM/YYYY');
};

export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const parsed = dayjs(date);
  if (!parsed.isValid()) return '-';
  return parsed.format('HH:mm');
};

export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('62') && cleaned.length >= 10) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)}-${cleaned.slice(5, 9)}-${cleaned.slice(9)}`;
  }

  if (cleaned.startsWith('08') && cleaned.length >= 10) {
    return `+62 ${cleaned.slice(1, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }

  return phone;
};

export const formatPercentage = (value: number | null | undefined, decimals = 1): string => {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(decimals)}%`;
};

export const getInitials = (name: string | null | undefined): string => {
  if (!name || !name.trim()) return '?';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};