// src/modules/teacher-leave/components/TeacherLeaveDetailDrawer.tsx
import { useState, useEffect, useMemo } from 'react';
import {
    Ban,
    CalendarDays,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    Loader2,
    ShieldCheck,
    User,
    UserCheck,
    X,
    XCircle,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { teacherLeaveService } from '../services/teacher-leave.service';
import {
    LEAVE_STATUS_LABELS,
    LEAVE_TYPE_OPTIONS,
    type LeaveReviewAction,
    type TeacherLeaveRequest,
} from '../types/teacher-leave.types';

interface TeacherLeaveDetailDrawerProps {
    request: TeacherLeaveRequest | null;
    onClose: () => void;
    canVerifyTu: boolean;
    canApprovePrincipal: boolean;
    currentTeacherId?: string | null;
    onOpenAction: (request: TeacherLeaveRequest, action: LeaveReviewAction) => void;
}

function formatTimestamp(iso: string | null, locale: 'id' | 'en'): string {
    if (!iso) return '-';
    try {
        return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function isImageAttachment(fileName: string | null, url: string | null): boolean {
    const target = `${fileName ?? ''} ${url ?? ''}`.toLowerCase();
    return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(target);
}

export function TeacherLeaveDetailDrawer({
    request,
    onClose,
    canVerifyTu,
    canApprovePrincipal,
    currentTeacherId = null,
    onOpenAction,
}: TeacherLeaveDetailDrawerProps) {
    const { t, locale } = useTranslation();
    const [signedAttachmentUrl, setSignedAttachmentUrl] = useState<string | null>(null);
    const [isLoadingAttachment, setIsLoadingAttachment] = useState<boolean>(false);

    useEffect(() => {
        if (!request) return;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [request, onClose]);

    useEffect(() => {
        if (!request?.attachmentUrl) {
            setSignedAttachmentUrl(null);
            return;
        }

        let cancelled = false;
        setIsLoadingAttachment(true);

        teacherLeaveService
            .getAttachmentSignedUrl(request.attachmentUrl)
            .then((url) => {
                if (!cancelled) setSignedAttachmentUrl(url);
            })
            .catch(() => {
                if (!cancelled) setSignedAttachmentUrl(null);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingAttachment(false);
            });

        return () => {
            cancelled = true;
        };
    }, [request?.id, request?.attachmentUrl]);

    const leaveTypeLabel = useMemo(() => {
        if (!request) return '';
        const found = LEAVE_TYPE_OPTIONS.find((opt) => opt.value === request.leaveType);
        return found ? found.label[locale] : request.leaveType;
    }, [request, locale]);

    if (!request) return null;

    const isOwner = Boolean(currentTeacherId && request.teacherId === currentTeacherId);
    const canDoVerifyTu = canVerifyTu && request.status === 'SUBMITTED';
    const canDoApproveOrReject =
        canApprovePrincipal &&
        (request.status === 'VERIFIED_TU' || request.status === 'SUBMITTED');
    const canDoCancel =
        (isOwner || canVerifyTu || canApprovePrincipal) &&
        (request.status === 'SUBMITTED' || request.status === 'VERIFIED_TU');

    const showImagePreview =
        Boolean(signedAttachmentUrl) &&
        isImageAttachment(request.attachmentName, request.attachmentUrl);

    const teacherIdentityMeta = [
        request.teacher?.nip ? `NIP ${request.teacher.nip}` : null,
        request.teacher?.nuptk ? `NUPTK ${request.teacher.nuptk}` : null,
    ]
        .filter(Boolean)
        .join(' • ');

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-detail-drawer-title"
            className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
                    <div>
                        <h2
                            id="leave-detail-drawer-title"
                            className="text-base font-bold text-foreground"
                        >
                            {t('teacherLeave.drawerTitle')}
                        </h2>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {t('teacherLeave.drawerSubtitle').replace(
                                '{id}',
                                request.id.slice(0, 8).toUpperCase()
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/25 px-4 py-3">
                        <span className="font-medium text-muted-foreground">
                            {t('common.status')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
                            <Clock size={13} />
                            {LEAVE_STATUS_LABELS[request.status]?.[locale] ?? request.status}
                        </span>
                    </div>

                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <User size={13} />
                            <span>{t('teacherLeave.sectionApplicant')}</span>
                        </h3>
                        <div className="rounded-xl border border-border bg-background p-3.5">
                            <p className="text-sm font-bold text-foreground">
                                {request.teacher?.fullName || 'PTK'}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                                {teacherIdentityMeta ||
                                    (locale === 'id'
                                        ? 'Guru / Tenaga Kependidikan'
                                        : 'Educator / Staff')}
                            </p>
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <CalendarDays size={13} />
                            <span>{t('teacherLeave.sectionLeaveDetail')}</span>
                        </h3>
                        <div className="space-y-2.5 rounded-xl border border-border bg-background p-3.5">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('teacherLeave.colLeaveType')}
                                    </p>
                                    <p className="mt-0.5 font-semibold text-foreground">
                                        {leaveTypeLabel}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {locale === 'id' ? 'Durasi Efektif' : 'Effective Duration'}
                                    </p>
                                    <p className="mt-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                        {request.totalWorkDays} {t('teacherLeave.workDaysUnit')}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <p className="text-[11px] text-muted-foreground">
                                    {locale === 'id' ? 'Rentang Tanggal' : 'Date Range'}
                                </p>
                                <p className="mt-0.5 font-medium tabular-nums text-foreground">
                                    {request.startDate} s.d. {request.endDate}
                                </p>
                            </div>

                            <div>
                                <p className="text-[11px] text-muted-foreground">
                                    {locale === 'id' ? 'Alasan Cuti' : 'Reason'}
                                </p>
                                <p className="mt-1 whitespace-pre-line leading-relaxed text-foreground">
                                    {request.reason}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <UserCheck size={13} />
                            <span>{t('teacherLeave.sectionDelegation')}</span>
                        </h3>
                        <div className="rounded-xl border border-border bg-background p-3.5">
                            <p className="font-semibold text-foreground">
                                {request.substituteTeacher?.fullName ||
                                    t('teacherLeave.noSubstitute')}
                            </p>
                            {request.delegationNotes && (
                                <p className="mt-1 text-muted-foreground">
                                    {request.delegationNotes}
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <FileText size={13} />
                            <span>{t('teacherLeave.sectionAttachment')}</span>
                        </h3>
                        <div className="rounded-xl border border-border bg-background p-3.5">
                            {!request.attachmentUrl ? (
                                <p className="text-muted-foreground">
                                    {t('teacherLeave.noAttachment')}
                                </p>
                            ) : isLoadingAttachment ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                                    <span>{t('teacherLeave.loadingAttachment')}</span>
                                </div>
                            ) : signedAttachmentUrl ? (
                                <div className="space-y-3">
                                    {showImagePreview && (
                                        <img
                                            src={signedAttachmentUrl}
                                            alt={request.attachmentName || 'Lampiran Cuti'}
                                            className="max-h-56 w-full rounded-lg border border-border bg-muted/20 object-contain"
                                        />
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-medium text-foreground">
                                            {request.attachmentName || 'Dokumen_Lampiran'}
                                        </span>
                                        <a
                                            href={signedAttachmentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                                        >
                                            <ExternalLink size={13} />
                                            <span>{t('teacherLeave.btnOpenAttachment')}</span>
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-rose-600 dark:text-rose-400">
                                    {locale === 'id'
                                        ? 'Pratinjau lampiran tidak dapat dimuat.'
                                        : 'Attachment preview could not be loaded.'}
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <ShieldCheck size={13} />
                            <span>{t('teacherLeave.sectionTimeline')}</span>
                        </h3>

                        <div className="space-y-3 rounded-xl border border-border bg-background p-3.5">
                            <div className="border-l-2 border-emerald-500 pl-3">
                                <p className="font-semibold text-foreground">
                                    {t('teacherLeave.timelineStep1')}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {formatTimestamp(request.createdAt, locale)}
                                </p>
                            </div>

                            <div
                                className={`border-l-2 pl-3 ${request.verifiedAt ? 'border-sky-500' : 'border-border'
                                    }`}
                            >
                                <p className="font-semibold text-foreground">
                                    {t('teacherLeave.timelineStep2')}
                                </p>
                                {request.verifiedAt ? (
                                    <>
                                        <p className="text-[11px] text-muted-foreground">
                                            {request.verifier?.fullName || 'Tata Usaha'} •{' '}
                                            {formatTimestamp(request.verifiedAt, locale)}
                                        </p>
                                        {request.verifierNotes && (
                                            <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground">
                                                “{request.verifierNotes}”
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('teacherLeave.timelinePending')}
                                    </p>
                                )}
                            </div>

                            <div
                                className={`border-l-2 pl-3 ${request.status === 'APPROVED'
                                        ? 'border-emerald-500'
                                        : request.status === 'REJECTED'
                                            ? 'border-rose-500'
                                            : 'border-border'
                                    }`}
                            >
                                <p className="font-semibold text-foreground">
                                    {t('teacherLeave.timelineStep3')}
                                </p>
                                {request.reviewedAt ? (
                                    <>
                                        <p className="text-[11px] text-muted-foreground">
                                            {request.reviewer?.fullName || 'Kepala Sekolah'} •{' '}
                                            {formatTimestamp(request.reviewedAt, locale)}
                                        </p>
                                        {request.reviewNotes && (
                                            <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-foreground">
                                                “{request.reviewNotes}”
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('teacherLeave.timelinePending')}
                                    </p>
                                )}
                            </div>

                            {request.status === 'CANCELLED' && (
                                <div className="border-l-2 border-slate-400 pl-3">
                                    <p className="font-semibold text-rose-600 dark:text-rose-400">
                                        {t('teacherLeave.timelineCancelled')}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {formatTimestamp(request.cancelledAt, locale)}
                                    </p>
                                    {request.cancelReason && (
                                        <p className="mt-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                                            “{request.cancelReason}”
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {(canDoVerifyTu || canDoApproveOrReject || canDoCancel) && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
                        {canDoCancel && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                onClick={() => onOpenAction(request, 'CANCEL')}
                            >
                                <Ban size={14} className="mr-1.5" />
                                {t('teacherLeave.btnCancelRequest')}
                            </Button>
                        )}

                        {canDoApproveOrReject && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                onClick={() => onOpenAction(request, 'REJECT')}
                            >
                                <XCircle size={14} className="mr-1.5" />
                                {t('teacherLeave.btnReject')}
                            </Button>
                        )}

                        {canDoVerifyTu && (
                            <Button
                                type="button"
                                size="sm"
                                className="bg-sky-600 text-white hover:bg-sky-700"
                                onClick={() => onOpenAction(request, 'VERIFY_TU')}
                            >
                                <ShieldCheck size={14} className="mr-1.5" />
                                {t('teacherLeave.btnVerifyTu')}
                            </Button>
                        )}

                        {canDoApproveOrReject && (
                            <Button
                                type="button"
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => onOpenAction(request, 'APPROVE')}
                            >
                                <CheckCircle2 size={14} className="mr-1.5" />
                                {t('teacherLeave.btnApprove')}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}