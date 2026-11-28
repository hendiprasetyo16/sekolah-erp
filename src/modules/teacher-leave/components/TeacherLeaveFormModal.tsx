// src/modules/teacher-leave/components/TeacherLeaveFormModal.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    FileText,
    Info,
    Loader2,
    Paperclip,
    Trash2,
    Upload,
    UserCheck,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { teacherLeaveService } from '../services/teacher-leave.service';
import {
    LEAVE_TYPE_OPTIONS,
    type LeaveType,
    type TeacherLeaveQuota,
    type TeacherSummaryRef,
} from '../types/teacher-leave.types';

interface TeacherLeaveFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    schoolId: string;
    teacherProfile: TeacherSummaryRef;
    quota: TeacherLeaveQuota | null;
    academicYearId?: string | null;
    semesterId?: string | null;
    isSuperAdminSimulation?: boolean;
}

function getTodayIsoLocal(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function TeacherLeaveFormModal({
    isOpen,
    onClose,
    onSuccess,
    schoolId,
    teacherProfile,
    quota,
    academicYearId = null,
    semesterId = null,
    isSuperAdminSimulation = false,
}: TeacherLeaveFormModalProps) {
    const { t, locale } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const todayIso = useMemo(() => getTodayIsoLocal(), []);

    const [leaveType, setLeaveType] = useState<LeaveType>('CUTI_TAHUNAN');
    const [startDate, setStartDate] = useState<string>(todayIso);
    const [endDate, setEndDate] = useState<string>(todayIso);
    const [reason, setReason] = useState<string>('');
    const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
    const [delegationNotes, setDelegationNotes] = useState<string>('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [colleagues, setColleagues] = useState<TeacherSummaryRef[]>([]);
    const [isLoadingColleagues, setIsLoadingColleagues] = useState<boolean>(false);

    const [calculatedWorkDays, setCalculatedWorkDays] = useState<number>(1);
    const [isCalculatingDays, setIsCalculatingDays] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const selectedTypeMeta = useMemo(
        () =>
            LEAVE_TYPE_OPTIONS.find((item) => item.value === leaveType) ??
            LEAVE_TYPE_OPTIONS[0],
        [leaveType]
    );

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSubmitting, onClose]);

    useEffect(() => {
        if (!isOpen || !schoolId) return;

        let active = true;
        setIsLoadingColleagues(true);

        teacherLeaveService
            .getActiveSchoolTeachers(schoolId, teacherProfile.id)
            .then((list) => {
                if (active) setColleagues(list);
            })
            .catch(() => {
                if (active) setColleagues([]);
            })
            .finally(() => {
                if (active) setIsLoadingColleagues(false);
            });

        return () => {
            active = false;
        };
    }, [isOpen, schoolId, teacherProfile.id]);

    useEffect(() => {
        if (!isOpen || !schoolId || !startDate || !endDate) return;

        if (endDate < startDate) {
            setCalculatedWorkDays(0);
            return;
        }

        let cancelled = false;
        setIsCalculatingDays(true);

        const timer = window.setTimeout(() => {
            teacherLeaveService
                .calculateWorkDays(schoolId, startDate, endDate)
                .then((days) => {
                    if (!cancelled) setCalculatedWorkDays(days);
                })
                .catch(() => {
                    if (!cancelled) setCalculatedWorkDays(0);
                })
                .finally(() => {
                    if (!cancelled) setIsCalculatingDays(false);
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isOpen, schoolId, startDate, endDate]);

    if (!isOpen) return null;

    const isDateRangeInvalid = Boolean(startDate && endDate && endDate < startDate);
    const isQuotaInsufficient =
        selectedTypeMeta.deductsQuota &&
        quota !== null &&
        calculatedWorkDays > quota.remainingDays;

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0] ?? null;
        if (!file) return;

        const allowedTypes = new Set([
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
        ]);

        if (!allowedTypes.has(file.type)) {
            toast.error(
                locale === 'id'
                    ? 'Format berkas harus PDF, JPG, PNG, atau WEBP.'
                    : 'File format must be PDF, JPG, PNG, or WEBP.'
            );
            event.target.value = '';
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error(
                locale === 'id'
                    ? 'Ukuran lampiran maksimal 2 MB.'
                    : 'Maximum attachment size is 2 MB.'
            );
            event.target.value = '';
            return;
        }

        setSelectedFile(file);
    };

    const handleRemoveFile = (): void => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const resetForm = (): void => {
        setLeaveType('CUTI_TAHUNAN');
        setStartDate(todayIso);
        setEndDate(todayIso);
        setReason('');
        setSubstituteTeacherId('');
        setDelegationNotes('');
        handleRemoveFile();
    };

    const handleSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();

        if (isDateRangeInvalid) {
            toast.error(t('teacherLeave.errDateInvalid'));
            return;
        }

        if (calculatedWorkDays <= 0) {
            toast.error(t('teacherLeave.errZeroWorkDays'));
            return;
        }

        if (isQuotaInsufficient && quota) {
            toast.error(
                t('teacherLeave.quotaWarningInsufficient')
                    .replace('{remaining}', String(quota.remainingDays))
                    .replace('{days}', String(calculatedWorkDays))
            );
            return;
        }

        const trimmedReason = reason.trim();
        if (trimmedReason.length < 10) {
            toast.error(t('teacherLeave.errReasonMin'));
            return;
        }

        if (selectedTypeMeta.requiresAttachment && !selectedFile) {
            toast.error(t('teacherLeave.errAttachmentRequired'));
            return;
        }

        setIsSubmitting(true);
        try {
            let attachmentUrl: string | null = null;
            let attachmentName: string | null = null;

            if (selectedFile) {
                const uploaded = await teacherLeaveService.uploadLeaveAttachment(
                    schoolId,
                    teacherProfile.id,
                    selectedFile
                );
                attachmentUrl = uploaded.storagePath;
                attachmentName = uploaded.fileName;
            }

            await teacherLeaveService.submitLeaveRequest({
                schoolId,
                teacherId: teacherProfile.id,
                leaveType,
                startDate,
                endDate,
                reason: trimmedReason,
                attachmentUrl,
                attachmentName,
                substituteTeacherId: substituteTeacherId || null,
                delegationNotes: delegationNotes.trim() || null,
                academicYearId,
                semesterId,
            });

            toast.success(t('teacherLeave.toastSubmitSuccess'));
            resetForm();
            onSuccess();
            onClose();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal mengirim pengajuan cuti.'
                        : 'Failed to submit leave request.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-form-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            onClick={() => {
                if (!isSubmitting) onClose();
            }}
        >
            <div
                className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CalendarClock size={20} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2
                                    id="leave-form-modal-title"
                                    className="text-base font-bold text-foreground"
                                >
                                    {t('teacherLeave.formTitle')}
                                </h2>
                                {isSuperAdminSimulation && (
                                    <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                                        {locale === 'id' ? 'Simulasi Super Admin' : 'Super Admin Simulation'}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {t('teacherLeave.formSubtitle')}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form
                    onSubmit={(e) => void handleSubmit(e)}
                    className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/25 px-3.5 py-2.5 text-xs">
                        <div>
                            <span className="text-muted-foreground">
                                {locale === 'id' ? 'Pemohon:' : 'Applicant:'}{' '}
                            </span>
                            <span className="font-semibold text-foreground">
                                {teacherProfile.fullName}
                            </span>
                            {teacherProfile.nip && (
                                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                    (NIP {teacherProfile.nip})
                                </span>
                            )}
                        </div>
                        {quota && (
                            <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {locale === 'id' ? 'Sisa Cuti Tahunan:' : 'Annual Balance:'}{' '}
                                {quota.remainingDays} {t('teacherLeave.daysUnit')}
                            </span>
                        )}
                    </div>

                    <div>
                        <label
                            htmlFor="leave-type-select"
                            className="mb-1.5 block text-xs font-semibold text-foreground"
                        >
                            {t('teacherLeave.labelLeaveType')}
                        </label>
                        <select
                            id="leave-type-select"
                            value={leaveType}
                            disabled={isSubmitting}
                            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                            {LEAVE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label[locale]}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Info size={12} className="shrink-0 text-sky-600 dark:text-sky-400" />
                            <span>
                                {selectedTypeMeta.deductsQuota
                                    ? t('teacherLeave.quotaDeductNote')
                                    : t('teacherLeave.quotaNonDeductNote')}
                            </span>
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="leave-start-date"
                                className="mb-1.5 block text-xs font-semibold text-foreground"
                            >
                                {t('teacherLeave.labelStartDate')}
                            </label>
                            <input
                                id="leave-start-date"
                                type="date"
                                required
                                value={startDate}
                                disabled={isSubmitting}
                                onChange={(e) => {
                                    const nextStart = e.target.value;
                                    setStartDate(nextStart);
                                    if (endDate && nextStart > endDate) {
                                        setEndDate(nextStart);
                                    }
                                }}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="leave-end-date"
                                className="mb-1.5 block text-xs font-semibold text-foreground"
                            >
                                {t('teacherLeave.labelEndDate')}
                            </label>
                            <input
                                id="leave-end-date"
                                type="date"
                                required
                                min={startDate}
                                value={endDate}
                                disabled={isSubmitting}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                    </div>

                    <div
                        className={`rounded-xl border px-3.5 py-2.5 text-xs ${isDateRangeInvalid || calculatedWorkDays === 0 || isQuotaInsufficient
                                ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                            }`}
                    >
                        {isCalculatingDays ? (
                            <div className="flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                <span>{t('teacherLeave.calculatingWorkDays')}</span>
                            </div>
                        ) : isDateRangeInvalid ? (
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>{t('teacherLeave.errDateInvalid')}</span>
                            </div>
                        ) : calculatedWorkDays === 0 ? (
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>{t('teacherLeave.zeroWorkDaysWarning')}</span>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 font-semibold tabular-nums">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>
                                        {t('teacherLeave.calculatedWorkDays').replace(
                                            '{days}',
                                            String(calculatedWorkDays)
                                        )}
                                    </span>
                                </div>
                                {isQuotaInsufficient && quota && (
                                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                                        <AlertTriangle size={13} className="shrink-0" />
                                        <span>
                                            {t('teacherLeave.quotaWarningInsufficient')
                                                .replace('{remaining}', String(quota.remainingDays))
                                                .replace('{days}', String(calculatedWorkDays))}
                                        </span>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="leave-substitute-select"
                                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground"
                            >
                                <UserCheck size={13} className="text-muted-foreground" />
                                <span>{t('teacherLeave.labelSubstituteTeacher')}</span>
                            </label>
                            <select
                                id="leave-substitute-select"
                                value={substituteTeacherId}
                                disabled={isSubmitting || isLoadingColleagues}
                                onChange={(e) => setSubstituteTeacherId(e.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            >
                                <option value="">
                                    {isLoadingColleagues
                                        ? t('common.loading')
                                        : t('teacherLeave.placeholderSubstituteTeacher')}
                                </option>
                                {colleagues.map((colleague) => (
                                    <option key={colleague.id} value={colleague.id}>
                                        {colleague.fullName}
                                        {colleague.nip ? ` (NIP ${colleague.nip})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="leave-delegation-notes"
                                className="mb-1.5 block text-xs font-semibold text-foreground"
                            >
                                {t('teacherLeave.labelDelegationNotes')}
                            </label>
                            <input
                                id="leave-delegation-notes"
                                type="text"
                                maxLength={250}
                                value={delegationNotes}
                                disabled={isSubmitting}
                                placeholder={t('teacherLeave.placeholderDelegationNotes')}
                                onChange={(e) => setDelegationNotes(e.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label
                                htmlFor="leave-reason-textarea"
                                className="text-xs font-semibold text-foreground"
                            >
                                {t('teacherLeave.labelReason')}
                            </label>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                {reason.trim().length}/10 min
                            </span>
                        </div>
                        <textarea
                            id="leave-reason-textarea"
                            rows={3}
                            required
                            maxLength={1000}
                            value={reason}
                            disabled={isSubmitting}
                            placeholder={t('teacherLeave.placeholderReason')}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                            <Paperclip size={13} className="text-muted-foreground" />
                            <span>{t('teacherLeave.labelAttachment')}</span>
                            <span
                                className={
                                    selectedTypeMeta.requiresAttachment
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'font-normal text-muted-foreground'
                                }
                            >
                                {selectedTypeMeta.requiresAttachment
                                    ? t('teacherLeave.attachmentRequiredTag')
                                    : t('teacherLeave.attachmentOptionalTag')}
                            </span>
                        </label>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,image/jpeg,image/png,image/webp"
                            disabled={isSubmitting}
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {!selectedFile ? (
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => fileInputRef.current?.click()}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-xs font-medium text-muted-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-foreground"
                            >
                                <Upload size={15} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{t('teacherLeave.attachmentDropHint')}</span>
                            </button>
                        ) : (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-xs">
                                <div className="flex min-w-0 items-center gap-2">
                                    <FileText
                                        size={15}
                                        className="shrink-0 text-emerald-600 dark:text-emerald-400"
                                    />
                                    <span className="truncate font-medium text-foreground">
                                        {t('teacherLeave.attachmentSelected').replace(
                                            '{name}',
                                            selectedFile.name
                                        )}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={handleRemoveFile}
                                    title={t('teacherLeave.btnRemoveFile')}
                                    className="rounded-lg p-1 text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                isSubmitting ||
                                isCalculatingDays ||
                                isDateRangeInvalid ||
                                calculatedWorkDays <= 0 ||
                                isQuotaInsufficient
                            }
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            {isSubmitting && (
                                <Loader2 size={14} className="mr-1.5 animate-spin" />
                            )}
                            {isSubmitting
                                ? t('teacherLeave.btnSubmittingRequest')
                                : t('teacherLeave.btnSubmitRequest')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}