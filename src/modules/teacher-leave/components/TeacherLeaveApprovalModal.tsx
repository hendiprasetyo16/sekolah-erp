// src/modules/teacher-leave/components/TeacherLeaveApprovalModal.tsx
import { useState, useEffect, useMemo } from 'react';
import {
    Ban,
    CheckCircle2,
    Loader2,
    ShieldCheck,
    X,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { teacherLeaveService } from '../services/teacher-leave.service';
import {
    LEAVE_TYPE_OPTIONS,
    type LeaveReviewAction,
    type TeacherLeaveRequest,
} from '../types/teacher-leave.types';

interface TeacherLeaveApprovalModalProps {
    request: TeacherLeaveRequest | null;
    action: LeaveReviewAction | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function TeacherLeaveApprovalModal({
    request,
    action,
    onClose,
    onSuccess,
}: TeacherLeaveApprovalModalProps) {
    const { t, locale } = useTranslation();
    const [notes, setNotes] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    useEffect(() => {
        setNotes('');
    }, [request?.id, action]);

    useEffect(() => {
        if (!request || !action) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !isProcessing) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [request, action, isProcessing, onClose]);

    const leaveTypeLabel = useMemo(() => {
        if (!request) return '';
        const found = LEAVE_TYPE_OPTIONS.find((opt) => opt.value === request.leaveType);
        return found ? found.label[locale] : request.leaveType;
    }, [request, locale]);

    if (!request || !action) return null;

    const isNotesMandatory = action === 'REJECT' || action === 'CANCEL';

    const modalConfig: Record<
        LeaveReviewAction,
        {
            title: string;
            desc: string;
            confirmLabel: string;
            badgeClass: string;
            buttonClass: string;
            icon: React.ReactNode;
        }
    > = {
        VERIFY_TU: {
            title: t('teacherLeave.modalVerifyTitle'),
            desc: t('teacherLeave.modalVerifyDesc'),
            confirmLabel: t('teacherLeave.btnConfirmVerify'),
            badgeClass:
                'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400',
            buttonClass: 'bg-sky-600 text-white hover:bg-sky-700',
            icon: <ShieldCheck size={20} />,
        },
        APPROVE: {
            title: t('teacherLeave.modalApproveTitle'),
            desc: t('teacherLeave.modalApproveDesc'),
            confirmLabel: t('teacherLeave.btnConfirmApprove'),
            badgeClass:
                'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            buttonClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
            icon: <CheckCircle2 size={20} />,
        },
        REJECT: {
            title: t('teacherLeave.modalRejectTitle'),
            desc: t('teacherLeave.modalRejectDesc'),
            confirmLabel: t('teacherLeave.btnConfirmReject'),
            badgeClass:
                'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
            buttonClass: 'bg-rose-600 text-white hover:bg-rose-700',
            icon: <XCircle size={20} />,
        },
        CANCEL: {
            title: t('teacherLeave.modalCancelTitle'),
            desc: t('teacherLeave.modalCancelDesc'),
            confirmLabel: t('teacherLeave.btnConfirmCancel'),
            badgeClass:
                'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
            buttonClass: 'bg-rose-600 text-white hover:bg-rose-700',
            icon: <Ban size={20} />,
        },
    };

    const activeConfig = modalConfig[action];

    const handleConfirm = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();

        const trimmedNotes = notes.trim();
        if (isNotesMandatory && trimmedNotes.length < 5) {
            toast.error(t('teacherLeave.errActionNotesRequired'));
            return;
        }

        setIsProcessing(true);
        try {
            await teacherLeaveService.reviewLeaveRequest({
                leaveRequestId: request.id,
                action,
                notes: trimmedNotes || undefined,
            });

            toast.success(t('teacherLeave.toastActionSuccess'));
            onSuccess();
            onClose();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal memproses tindakan pengajuan cuti.'
                        : 'Failed to process leave request action.'
            );
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-approval-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => {
                if (!isProcessing) onClose();
            }}
        >
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${activeConfig.badgeClass}`}
                        >
                            {activeConfig.icon}
                        </div>
                        <div>
                            <h3
                                id="leave-approval-modal-title"
                                className="text-base font-bold text-foreground"
                            >
                                {activeConfig.title}
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {activeConfig.desc}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={(e) => void handleConfirm(e)} className="space-y-4 px-6 py-5">
                    {/* Ringkasan Pengajuan */}
                    <div className="rounded-xl border border-border bg-muted/25 p-3.5 text-xs">
                        <p className="font-bold text-foreground">
                            {request.teacher?.fullName || 'PTK'}
                        </p>
                        <p className="mt-0.5 text-muted-foreground">
                            {leaveTypeLabel} • {request.startDate} s.d. {request.endDate} (
                            <span className="font-semibold tabular-nums text-foreground">
                                {request.totalWorkDays} {t('teacherLeave.workDaysUnit')}
                            </span>
                            )
                        </p>
                    </div>

                    {/* Catatan / Alasan */}
                    <div>
                        <label
                            htmlFor="approval-notes-textarea"
                            className="mb-1.5 block text-xs font-semibold text-foreground"
                        >
                            {isNotesMandatory
                                ? t('teacherLeave.labelActionNotesRequired')
                                : t('teacherLeave.labelActionNotesOptional')}
                        </label>
                        <textarea
                            id="approval-notes-textarea"
                            rows={3}
                            required={isNotesMandatory}
                            maxLength={500}
                            value={notes}
                            disabled={isProcessing}
                            placeholder={
                                isNotesMandatory
                                    ? t('teacherLeave.placeholderActionNotesRequired')
                                    : t('teacherLeave.placeholderActionNotesOptional')
                            }
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isProcessing}
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isProcessing}
                            className={activeConfig.buttonClass}
                        >
                            {isProcessing && (
                                <Loader2 size={14} className="mr-1.5 animate-spin" />
                            )}
                            {isProcessing
                                ? t('teacherLeave.btnProcessingAction')
                                : activeConfig.confirmLabel}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}