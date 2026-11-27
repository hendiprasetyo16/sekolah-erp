// src/modules/teacher-attendance/components/TeacherLeaveTab.tsx
/**
 * ============================================================================
 * MENU 4: FORMULIR IZIN / DINAS LUAR / SAKIT (TeacherLeaveTab)
 * ============================================================================
 * Menampilkan:
 * 1. Pengunci otomatis apabila hari ini adalah hari libur.
 * 2. Pilihan kategori (Dinas Luar, Izin, Sakit), rentang tanggal + hitung hari,
 *    nomor surat tugas (wajib khusus Dinas Luar), alasan, serta unggah bukti.
 * ============================================================================
 */
import { useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
    FileCheck2,
    Menu,
    Lock,
    CheckCircle2,
    Upload,
    Loader2,
    Send,
    X,
    CalendarRange,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    MAX_LEAVE_FILE_BYTES,
    MIN_REASON_LENGTH,
} from '../constants/teacherAttendance.constants';
import type {
    LeaveCategory,
    TeacherProfile,
} from '../types/teacherAttendance.types';

interface TeacherLeaveTabProps {
    teacher: TeacherProfile | null;
    onToggleSidebar: () => void;
    isLeaveFormLocked: boolean;
    holidayReason: string;
    leaveCategory: LeaveCategory;
    setLeaveCategory: (category: LeaveCategory) => void;
    leaveStartDate: string;
    setLeaveStartDate: (date: string) => void;
    leaveEndDate: string;
    setLeaveEndDate: (date: string) => void;
    leaveRefNumber: string;
    setLeaveRefNumber: (ref: string) => void;
    leaveReason: string;
    setLeaveReason: (reason: string) => void;
    leaveFile: File | null;
    setLeaveFile: (file: File | null) => void;
    isSubmittingLeave: boolean;
    isLeaveFormReady: boolean;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    showToast: (type: 'success' | 'error', message: string) => void;
}

export const TeacherLeaveTab = memo(function TeacherLeaveTab({
    teacher,
    onToggleSidebar,
    isLeaveFormLocked,
    holidayReason,
    leaveCategory,
    setLeaveCategory,
    leaveStartDate,
    setLeaveStartDate,
    leaveEndDate,
    setLeaveEndDate,
    leaveRefNumber,
    setLeaveRefNumber,
    leaveReason,
    setLeaveReason,
    leaveFile,
    setLeaveFile,
    isSubmittingLeave,
    isLeaveFormReady,
    onSubmit,
    showToast,
}: TeacherLeaveTabProps) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Hitung jumlah hari kalender secara presisi menggunakan Date.UTC (bebas pergeseran DST)
    const leaveDurationDays = useMemo(() => {
        if (!leaveStartDate || !leaveEndDate) return 1;
        const [sy, sm, sd] = leaveStartDate.split('-').map(Number);
        const [ey, em, ed] = leaveEndDate.split('-').map(Number);
        if (!sy || !sm || !sd || !ey || !em || !ed) return 1;

        const startUtc = Date.UTC(sy, sm - 1, sd);
        const endUtc = Date.UTC(ey, em - 1, ed);
        const diff = Math.round((endUtc - startUtc) / 86_400_000) + 1;
        return Math.max(1, diff);
    }, [leaveStartDate, leaveEndDate]);

    const handleClearFile = useCallback(() => {
        setLeaveFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [setLeaveFile]);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0] ?? null;
            if (!file) return;

            const isAllowedType =
                file.type.startsWith('image/') || file.type === 'application/pdf';
            if (!isAllowedType) {
                e.target.value = '';
                showToast('error', t('teacherAttendance.errInvalidFileType'));
                return;
            }

            if (file.size > MAX_LEAVE_FILE_BYTES) {
                e.target.value = '';
                showToast('error', t('teacherAttendance.errFileMax2Mb'));
                return;
            }

            setLeaveFile(file);
            e.target.value = '';
        },
        [setLeaveFile, showToast, t]
    );

    const removeAttachmentLabel = t('teacherAttendance.btnRemoveAttachment');

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="data-card space-y-4"
        >
            {/* ==================================================================
                BAGIAN 1: HEADER FORMULIR IZIN / DINAS LUAR
            ================================================================== */}
            <div className="border-b border-border pb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <FileCheck2 size={18} className="text-amber-500" />
                        {t('teacherAttendance.leaveFormTitle')}
                    </h2>
                    <p className="text-xs opacity-70 mt-0.5">
                        {t('teacherAttendance.leaveFormSubtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition"
                    title={t('teacherAttendance.titleToggleSidebar')}
                    aria-label={t('teacherAttendance.titleToggleSidebar')}
                >
                    <Menu size={16} />
                </button>
            </div>

            {/* ==================================================================
                BAGIAN 2: KONDISI HARI LIBUR ATAU FORMULIR PENGAJUAN AKTIF
            ================================================================== */}
            {isLeaveFormLocked ? (
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-200 text-xs space-y-1.5 leading-relaxed">
                    <div className="flex items-center gap-2 font-bold text-sm">
                        <Lock size={16} className="text-amber-500 shrink-0" />
                        <span>
                            {t('teacherAttendance.toastHolidayError', {
                                reason: holidayReason,
                            })}
                        </span>
                    </div>
                    <p className="opacity-85">
                        {t('teacherAttendance.leaveFormHolidayLockedDesc')}
                    </p>
                </div>
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    {/* Pilihan Kategori: Dinas Luar / Izin / Sakit */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            {t('teacherAttendance.leaveTypeLabel')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(
                                [
                                    {
                                        value: 'DINAS_LUAR',
                                        label: t('teacherAttendance.leaveCatDinasLuar'),
                                    },
                                    {
                                        value: 'IZIN',
                                        label: t('teacherAttendance.leaveCatIzin'),
                                    },
                                    {
                                        value: 'SAKIT',
                                        label: t('teacherAttendance.leaveCatSakit'),
                                    },
                                ] as const
                            ).map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    disabled={isSubmittingLeave}
                                    onClick={() => setLeaveCategory(item.value)}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition disabled:opacity-60 ${leaveCategory === item.value
                                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-xs'
                                            : 'bg-muted/50 border-border opacity-80 hover:opacity-100'
                                        }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input Tanggal Mulai & Tanggal Selesai + Indikator Durasi Hari */}
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    {t('teacherAttendance.leaveStartDateLabel')}
                                </label>
                                <input
                                    type="date"
                                    required
                                    disabled={isSubmittingLeave}
                                    value={leaveStartDate}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        setLeaveStartDate(val);
                                        if (leaveEndDate && leaveEndDate < val) {
                                            setLeaveEndDate(val);
                                        }
                                    }}
                                    className="form-input w-full text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    {t('teacherAttendance.leaveEndDateLabel')}
                                </label>
                                <input
                                    type="date"
                                    required
                                    disabled={isSubmittingLeave}
                                    min={leaveStartDate}
                                    value={leaveEndDate}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            setLeaveEndDate(e.target.value);
                                        }
                                    }}
                                    className="form-input w-full text-xs"
                                />
                            </div>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 text-[11px] font-medium opacity-80">
                            <CalendarRange size={13} className="text-emerald-500" />
                            <span>
                                {t('teacherAttendance.leaveDurationDays', {
                                    days: leaveDurationDays,
                                })}
                            </span>
                        </div>
                    </div>

                    {/* Nomor Surat Tugas / Dokumen Pendukung */}
                    <div>
                        <label className="block text-xs font-semibold mb-1">
                            {leaveCategory === 'DINAS_LUAR'
                                ? t('teacherAttendance.leaveRefRequiredLabel')
                                : t('teacherAttendance.leaveRefOptionalLabel')}
                        </label>
                        <input
                            type="text"
                            disabled={isSubmittingLeave}
                            required={leaveCategory === 'DINAS_LUAR'}
                            value={leaveRefNumber}
                            onChange={(e) => setLeaveRefNumber(e.target.value)}
                            placeholder={
                                leaveCategory === 'DINAS_LUAR'
                                    ? t('teacherAttendance.leaveRefRequiredPlaceholder')
                                    : t('teacherAttendance.leaveRefOptionalPlaceholder')
                            }
                            className="form-input w-full text-xs"
                        />
                    </div>

                    {/* Keterangan / Alasan Lengkap */}
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <label className="font-semibold">
                                {t('teacherAttendance.leaveReasonLabel')}
                            </label>
                            <span
                                className={
                                    leaveReason.trim().length >= MIN_REASON_LENGTH
                                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                        : 'text-amber-600 dark:text-amber-400'
                                }
                            >
                                {t('teacherAttendance.charCounter', {
                                    current: leaveReason.trim().length,
                                    min: MIN_REASON_LENGTH,
                                })}
                            </span>
                        </div>
                        <textarea
                            rows={3}
                            required
                            minLength={MIN_REASON_LENGTH}
                            disabled={isSubmittingLeave}
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                            placeholder={t('teacherAttendance.leaveReasonPlaceholder')}
                            className="form-input w-full text-xs"
                        />
                    </div>

                    {/* Unggah Lampiran Bukti (Foto / PDF maks 2 MB) */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            {t('teacherAttendance.leaveFileLabel')}
                        </label>
                        <div className="relative">
                            <label
                                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed transition ${isSubmittingLeave
                                        ? 'opacity-60 cursor-not-allowed'
                                        : 'cursor-pointer'
                                    } ${leaveFile
                                        ? 'border-emerald-500/70 bg-emerald-500/10 pr-10'
                                        : 'border-border hover:border-emerald-500/60 bg-muted/30'
                                    }`}
                            >
                                {leaveFile ? (
                                    <CheckCircle2 size={22} className="text-emerald-500 mb-1.5" />
                                ) : (
                                    <Upload size={22} className="text-emerald-500 mb-1.5" />
                                )}
                                <span className="text-xs font-semibold text-center break-all">
                                    {leaveFile
                                        ? t('teacherAttendance.leaveFileReady', {
                                            name: leaveFile.name,
                                        })
                                        : t('teacherAttendance.leaveFilePrompt')}
                                </span>
                                <span className="text-[11px] opacity-60 mt-0.5">
                                    {leaveFile
                                        ? `${(leaveFile.size / 1024).toFixed(0)} KB • ${t(
                                            'teacherAttendance.leaveFileReplaceHint'
                                        )}`
                                        : t('teacherAttendance.leaveFileSizeHint')}
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,.pdf"
                                    disabled={isSubmittingLeave}
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </label>

                            {leaveFile && !isSubmittingLeave && (
                                <button
                                    type="button"
                                    onClick={handleClearFile}
                                    aria-label={removeAttachmentLabel}
                                    title={removeAttachmentLabel}
                                    className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 transition"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tombol Kirim Pengajuan */}
                    <div className="pt-1">
                        <button
                            type="submit"
                            disabled={isSubmittingLeave || !teacher}
                            className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${isLeaveFormReady
                                    ? 'bg-linear-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-400/40'
                                    : 'bg-linear-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 shadow-md'
                                }`}
                        >
                            {isSubmittingLeave ? (
                                <>
                                    <Loader2 size={18} className="animate-spin shrink-0" />
                                    <span>{t('teacherAttendance.btnUploadingAndSaving')}</span>
                                </>
                            ) : (
                                <>
                                    <Send size={17} className="shrink-0" />
                                    <span>{t('teacherAttendance.btnSubmitOfficialLeave')}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            )}
        </motion.div>
    );
});