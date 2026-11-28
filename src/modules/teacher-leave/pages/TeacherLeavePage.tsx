// src/modules/teacher-leave/pages/TeacherLeavePage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Clock,
    Eye,
    FileText,
    History,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    Users,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { getEffectiveRoles } from '@/modules/admin/types/user-management.types';
import { Button } from '@/components/ui/button';
import { teacherLeaveService } from '../services/teacher-leave.service';
import {
    LEAVE_STATUS_LABELS,
    LEAVE_TYPE_OPTIONS,
    type LeaveReviewAction,
    type LeaveStatus,
    type TeacherLeaveQuota,
    type TeacherLeaveRequest,
    type TeacherSummaryRef,
} from '../types/teacher-leave.types';
import { TeacherLeaveFormModal } from '../components/TeacherLeaveFormModal';
import { TeacherLeaveDetailDrawer } from '../components/TeacherLeaveDetailDrawer';
import { TeacherLeaveApprovalModal } from '../components/TeacherLeaveApprovalModal';
import { TeacherLeaveQuotaPanel } from '../components/TeacherLeaveQuotaPanel';

const TU_VERIFIER_ROLES = [
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATOR',
    'STAFF_TU',
    'KEPALA_SEKOLAH',
] as const;

const PRINCIPAL_APPROVER_ROLES = [
    'SUPER_ADMIN',
    'ADMIN',
    'KEPALA_SEKOLAH',
] as const;

type LeaveTabKey =
    | 'MY'
    | 'TU_QUEUE'
    | 'PRINCIPAL_QUEUE'
    | 'ALL_HISTORY'
    | 'QUOTAS';

function getStatusBadgeClass(status: LeaveStatus): string {
    switch (status) {
        case 'SUBMITTED':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'VERIFIED_TU':
            return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        case 'APPROVED':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'REJECTED':
            return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
        case 'CANCELLED':
            return 'border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300';
    }
}

export function TeacherLeavePage() {
    const { t, locale } = useTranslation();
    const user = useAuthStore((state) => state.user);
    const school = useAuthStore((state) => state.school);
    const academicYear = useAuthStore((state) => state.academicYear);
    const storeEffectiveRoles = useAuthStore((state) => state.getEffectiveRoles);

    const [selectedYear, setSelectedYear] = useState<number>(() =>
        new Date().getFullYear()
    );
    const [ownTeacherProfile, setOwnTeacherProfile] =
        useState<TeacherSummaryRef | null>(null);
    const [schoolTeachers, setSchoolTeachers] = useState<TeacherSummaryRef[]>([]);
    const [simulatedTeacherId, setSimulatedTeacherId] = useState<string>('');

    const [quota, setQuota] = useState<TeacherLeaveQuota | null>(null);
    const [requests, setRequests] = useState<TeacherLeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const [activeTab, setActiveTab] = useState<LeaveTabKey>('MY');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'ALL'>('ALL');

    const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
    const [selectedDetailRequest, setSelectedDetailRequest] =
        useState<TeacherLeaveRequest | null>(null);
    const [actionModalState, setActionModalState] = useState<{
        request: TeacherLeaveRequest | null;
        action: LeaveReviewAction | null;
    }>({ request: null, action: null });

    const effectiveRoles = useMemo(
        () =>
            Array.from(new Set([...getEffectiveRoles(user), ...storeEffectiveRoles()])),
        [user, storeEffectiveRoles]
    );

    const isSuperAdmin = useMemo(
        () => effectiveRoles.includes('SUPER_ADMIN'),
        [effectiveRoles]
    );

    const canVerifyTu = useMemo(
        () =>
            effectiveRoles.some((r) =>
                (TU_VERIFIER_ROLES as readonly string[]).includes(r)
            ),
        [effectiveRoles]
    );

    const canApprovePrincipal = useMemo(
        () =>
            effectiveRoles.some((r) =>
                (PRINCIPAL_APPROVER_ROLES as readonly string[]).includes(r)
            ),
        [effectiveRoles]
    );

    const isReviewerOrAdmin = canVerifyTu || canApprovePrincipal;

    // PTK aktif yang dipakai untuk kartu kuota, tab Pengajuan Saya, dan Modal Pengajuan
    const activeApplicantProfile = useMemo<TeacherSummaryRef | null>(() => {
        if (isSuperAdmin) {
            if (simulatedTeacherId) {
                return (
                    schoolTeachers.find((item) => item.id === simulatedTeacherId) ??
                    ownTeacherProfile ??
                    null
                );
            }
            return ownTeacherProfile ?? schoolTeachers[0] ?? null;
        }
        return ownTeacherProfile;
    }, [isSuperAdmin, simulatedTeacherId, schoolTeachers, ownTeacherProfile]);

    const loadLeaveData = useCallback(async (): Promise<void> => {
        if (!user?.id || !school?.id) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const [profile, teachersList] = await Promise.all([
                teacherLeaveService.getCurrentTeacherProfile(user.id, school.id),
                isSuperAdmin
                    ? teacherLeaveService.getActiveSchoolTeachers(school.id)
                    : Promise.resolve<TeacherSummaryRef[]>([]),
            ]);

            setOwnTeacherProfile(profile);
            setSchoolTeachers(teachersList);

            let targetApplicant: TeacherSummaryRef | null = profile;
            if (isSuperAdmin) {
                const chosenId =
                    simulatedTeacherId &&
                        teachersList.some((item) => item.id === simulatedTeacherId)
                        ? simulatedTeacherId
                        : profile?.id ?? teachersList[0]?.id ?? '';

                if (chosenId && chosenId !== simulatedTeacherId) {
                    setSimulatedTeacherId(chosenId);
                }
                targetApplicant =
                    teachersList.find((item) => item.id === chosenId) ?? profile ?? null;
            }

            if (targetApplicant) {
                const quotaData = await teacherLeaveService.ensureTeacherQuota(
                    school.id,
                    targetApplicant.id,
                    selectedYear
                );
                setQuota(quotaData);
            } else {
                setQuota(null);
            }

            const allSchoolRequests = await teacherLeaveService.getLeaveRequests({
                schoolId: school.id,
                year: selectedYear,
                teacherId: isReviewerOrAdmin ? undefined : profile?.id,
            });

            setRequests(allSchoolRequests);

            setSelectedDetailRequest((prev) =>
                prev
                    ? allSchoolRequests.find((item) => item.id === prev.id) ?? null
                    : null
            );
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal memuat data cuti PTK.'
                        : 'Failed to load staff leave data.'
            );
        } finally {
            setIsLoading(false);
        }
    }, [
        user?.id,
        school?.id,
        selectedYear,
        isSuperAdmin,
        simulatedTeacherId,
        isReviewerOrAdmin,
        locale,
    ]);

    useEffect(() => {
        void loadLeaveData();
    }, [loadLeaveData]);

    // Reset simulasi bila Super Admin berpindah sekolah
    useEffect(() => {
        setSimulatedTeacherId('');
    }, [school?.id]);

    // Bila admin sekolah non-SuperAdmin tidak tertaut profil PTK, buka antrean yang sesuai
    useEffect(() => {
        if (
            !isLoading &&
            !isSuperAdmin &&
            !ownTeacherProfile &&
            isReviewerOrAdmin &&
            activeTab === 'MY'
        ) {
            if (canApprovePrincipal) {
                setActiveTab('PRINCIPAL_QUEUE');
            } else if (canVerifyTu) {
                setActiveTab('TU_QUEUE');
            }
        }
    }, [
        isLoading,
        isSuperAdmin,
        ownTeacherProfile,
        isReviewerOrAdmin,
        activeTab,
        canApprovePrincipal,
        canVerifyTu,
    ]);

    const tuPendingCount = useMemo(
        () => requests.filter((r) => r.status === 'SUBMITTED').length,
        [requests]
    );

    const principalPendingCount = useMemo(
        () => requests.filter((r) => r.status === 'VERIFIED_TU').length,
        [requests]
    );

    const displayedRequests = useMemo(() => {
        let baseList = requests;

        if (activeTab === 'MY') {
            baseList = activeApplicantProfile
                ? requests.filter((item) => item.teacherId === activeApplicantProfile.id)
                : [];
        } else if (activeTab === 'TU_QUEUE') {
            baseList = requests.filter((item) => item.status === 'SUBMITTED');
        } else if (activeTab === 'PRINCIPAL_QUEUE') {
            baseList = requests.filter((item) => item.status === 'VERIFIED_TU');
        }

        const q = searchQuery.trim().toLowerCase();
        return baseList.filter((item) => {
            const matchesStatus =
                activeTab === 'TU_QUEUE' ||
                activeTab === 'PRINCIPAL_QUEUE' ||
                statusFilter === 'ALL' ||
                item.status === statusFilter;

            if (!matchesStatus) return false;
            if (!q) return true;

            const teacherName = item.teacher?.fullName?.toLowerCase() ?? '';
            const teacherNip = item.teacher?.nip?.toLowerCase() ?? '';
            const reasonText = item.reason.toLowerCase();
            return (
                teacherName.includes(q) ||
                teacherNip.includes(q) ||
                reasonText.includes(q)
            );
        });
    }, [
        requests,
        activeTab,
        activeApplicantProfile,
        searchQuery,
        statusFilter,
    ]);

    const getLeaveTypeLabel = (type: string): string => {
        const found = LEAVE_TYPE_OPTIONS.find((opt) => opt.value === type);
        return found ? found.label[locale] : type;
    };

    const handleOpenActionModal = (
        request: TeacherLeaveRequest,
        action: LeaveReviewAction
    ): void => {
        setActionModalState({ request, action });
    };

    const isUsingSimulation =
        isSuperAdmin &&
        Boolean(activeApplicantProfile) &&
        activeApplicantProfile?.id !== ownTeacherProfile?.id;

    return (
        <div className="space-y-6">
            {/* Bar Simulasi Super Admin */}
            {isSuperAdmin && (
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                        <Sparkles size={15} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                            {locale === 'id'
                                ? 'Simulasi Super Admin (Uji Pengajuan & Persetujuan Cuti PTK):'
                                : 'Super Admin Simulation (Test Staff Leave Submission & Approval):'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            aria-label="Simulasi PTK Super Admin"
                            value={activeApplicantProfile?.id ?? ''}
                            disabled={isLoading || schoolTeachers.length === 0}
                            onChange={(e) => setSimulatedTeacherId(e.target.value)}
                            className="w-full rounded-lg border border-indigo-500/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:border-indigo-500 focus:outline-none sm:w-72"
                        >
                            {schoolTeachers.length === 0 ? (
                                <option value="">
                                    {locale === 'id'
                                        ? 'Belum ada data PTK aktif di sekolah ini'
                                        : 'No active staff in this school'}
                                </option>
                            ) : (
                                schoolTeachers.map((teacher) => (
                                    <option key={teacher.id} value={teacher.id}>
                                        {teacher.fullName}
                                        {teacher.nip ? ` (NIP ${teacher.nip})` : ''}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </div>
            )}

            {/* Header Halaman */}
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">
                        {t('teacherLeave.pageTitle')}
                    </h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('teacherLeave.pageSubtitle')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => void loadLeaveData()}
                    >
                        <RefreshCw
                            size={14}
                            className={isLoading ? 'mr-1.5 animate-spin' : 'mr-1.5'}
                        />
                        {t('teacherLeave.btnRefresh')}
                    </Button>

                    {activeApplicantProfile && school?.id && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setIsFormOpen(true)}
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            <Plus size={15} className="mr-1.5" />
                            {t('teacherLeave.btnNewRequest')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Info jika akun non-SuperAdmin belum tertaut Master PTK */}
            {!isLoading && !isSuperAdmin && !ownTeacherProfile && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>{t('teacherLeave.unlinkedProfileBanner')}</p>
                </div>
            )}

            {/* Kartu Ringkasan Kuota Cuti Tahunan PTK */}
            {quota && (
                <div className="space-y-2">
                    {isUsingSimulation && activeApplicantProfile && (
                        <p className="text-[11px] font-medium text-muted-foreground">
                            {locale === 'id'
                                ? `Menampilkan saldo kuota cuti untuk simulasi PTK: `
                                : `Showing leave quota balance for simulated staff: `}
                            <span className="font-bold text-foreground">
                                {activeApplicantProfile.fullName}
                            </span>
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                {t('teacherLeave.quotaBaseTitle').replace(
                                    '{year}',
                                    String(selectedYear)
                                )}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                                {quota.baseQuota}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {t('teacherLeave.daysUnit')}
                                </span>
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                {t('teacherLeave.quotaCarryOverTitle')}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
                                +{quota.carriedOver}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {t('teacherLeave.daysUnit')}
                                </span>
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                {t('teacherLeave.quotaUsedTitle')}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                {quota.usedDays}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {t('teacherLeave.daysUnit')}
                                </span>
                            </p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                                {t('teacherLeave.quotaRemainingTitle')}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {quota.remainingDays}{' '}
                                <span className="text-xs font-normal">
                                    {t('teacherLeave.daysUnit')}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigasi Tab */}
            <div className="flex flex-wrap gap-2 border-b border-border pb-2.5">
                {activeApplicantProfile && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('MY')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'MY'
                                ? 'bg-emerald-600 text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                    >
                        {isUsingSimulation
                            ? locale === 'id'
                                ? `Pengajuan (${activeApplicantProfile.fullName.split(' ')[0]})`
                                : `Requests (${activeApplicantProfile.fullName.split(' ')[0]})`
                            : t('teacherLeave.tabMyRequests')}
                    </button>
                )}

                {canVerifyTu && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('TU_QUEUE')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'TU_QUEUE'
                                ? 'bg-emerald-600 text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                    >
                        <Clock size={13} />
                        <span>{t('teacherLeave.tabTuQueue')}</span>
                        {tuPendingCount > 0 && (
                            <span
                                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${activeTab === 'TU_QUEUE'
                                        ? 'bg-white/20 text-white'
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    }`}
                            >
                                {tuPendingCount}
                            </span>
                        )}
                    </button>
                )}

                {canApprovePrincipal && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('PRINCIPAL_QUEUE')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'PRINCIPAL_QUEUE'
                                ? 'bg-emerald-600 text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                    >
                        <CheckCircle2 size={13} />
                        <span>{t('teacherLeave.tabPrincipalQueue')}</span>
                        {principalPendingCount > 0 && (
                            <span
                                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${activeTab === 'PRINCIPAL_QUEUE'
                                        ? 'bg-white/20 text-white'
                                        : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                    }`}
                            >
                                {principalPendingCount}
                            </span>
                        )}
                    </button>
                )}

                {isReviewerOrAdmin && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('ALL_HISTORY')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'ALL_HISTORY'
                                ? 'bg-emerald-600 text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                    >
                        <History size={13} />
                        <span>{t('teacherLeave.tabAllHistory')}</span>
                    </button>
                )}

                {isReviewerOrAdmin && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('QUOTAS')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'QUOTAS'
                                ? 'bg-emerald-600 text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                    >
                        <Users size={13} />
                        <span>{t('teacherLeave.tabQuotas')}</span>
                    </button>
                )}
            </div>

            {/* Konten Tab Kuota PTK */}
            {activeTab === 'QUOTAS' && school?.id ? (
                <TeacherLeaveQuotaPanel
                    schoolId={school.id}
                    year={selectedYear}
                    onYearChange={setSelectedYear}
                    canManageQuotas={isReviewerOrAdmin}
                    onQuotaUpdated={() => void loadLeaveData()}
                />
            ) : (
                <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative flex-1 sm:max-w-sm">
                            <Search
                                size={15}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('teacherLeave.searchPlaceholder')}
                                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-xs text-foreground focus:border-emerald-500 focus:outline-none"
                            />
                        </div>

                        {activeTab !== 'TU_QUEUE' && activeTab !== 'PRINCIPAL_QUEUE' && (
                            <select
                                aria-label="Filter Status Pengajuan"
                                value={statusFilter}
                                onChange={(e) =>
                                    setStatusFilter(e.target.value as LeaveStatus | 'ALL')
                                }
                                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground focus:border-emerald-500 focus:outline-none"
                            >
                                <option value="ALL">
                                    {t('teacherLeave.filterAllStatuses')}
                                </option>
                                {(Object.keys(LEAVE_STATUS_LABELS) as LeaveStatus[]).map(
                                    (st) => (
                                        <option key={st} value={st}>
                                            {LEAVE_STATUS_LABELS[st][locale]}
                                        </option>
                                    )
                                )}
                            </select>
                        )}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-14 text-xs text-muted-foreground">
                                <Loader2
                                    size={18}
                                    className="mr-2 animate-spin text-emerald-600"
                                />
                                {t('teacherLeave.loadingRequests')}
                            </div>
                        ) : displayedRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                                <CalendarClock size={28} className="text-muted-foreground/60" />
                                <p className="mt-2 text-sm font-semibold text-foreground">
                                    {t('teacherLeave.emptyTitle')}
                                </p>
                                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                                    {t('teacherLeave.emptyDesc')}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {displayedRequests.map((item) => {
                                    const rowCanVerifyTu =
                                        canVerifyTu && item.status === 'SUBMITTED';
                                    const rowCanApprove =
                                        canApprovePrincipal &&
                                        (item.status === 'VERIFIED_TU' ||
                                            item.status === 'SUBMITTED');

                                    return (
                                        <div
                                            key={item.id}
                                            className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-muted/20 lg:flex-row lg:items-center"
                                        >
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-bold text-foreground">
                                                        {item.teacher?.fullName ||
                                                            activeApplicantProfile?.fullName ||
                                                            'PTK'}
                                                    </span>
                                                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                                        {getLeaveTypeLabel(item.leaveType)}
                                                    </span>
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(
                                                            item.status
                                                        )}`}
                                                    >
                                                        <FileText size={11} />
                                                        {LEAVE_STATUS_LABELS[item.status]?.[locale] ??
                                                            item.status}
                                                    </span>
                                                </div>

                                                <p className="text-xs font-medium tabular-nums text-muted-foreground">
                                                    {item.startDate} s.d. {item.endDate} •{' '}
                                                    <span className="font-semibold text-foreground">
                                                        {item.totalWorkDays}{' '}
                                                        {t('teacherLeave.workDaysUnit')}
                                                    </span>
                                                    {item.substituteTeacher?.fullName && (
                                                        <span className="ml-2 font-normal">
                                                            • Pengganti: {item.substituteTeacher.fullName}
                                                        </span>
                                                    )}
                                                </p>

                                                <p className="line-clamp-1 text-xs text-foreground/85">
                                                    {item.reason}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setSelectedDetailRequest(item)}
                                                >
                                                    <Eye size={13} className="mr-1.5" />
                                                    {t('teacherLeave.btnDetail')}
                                                </Button>

                                                {rowCanVerifyTu && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="bg-sky-600 text-white hover:bg-sky-700"
                                                        onClick={() =>
                                                            handleOpenActionModal(item, 'VERIFY_TU')
                                                        }
                                                    >
                                                        <ShieldCheck size={13} className="mr-1" />
                                                        {t('teacherLeave.btnVerifyTu')}
                                                    </Button>
                                                )}

                                                {rowCanApprove && (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                                            onClick={() =>
                                                                handleOpenActionModal(item, 'APPROVE')
                                                            }
                                                        >
                                                            <CheckCircle2 size={13} className="mr-1" />
                                                            {t('teacherLeave.btnApprove')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                                            onClick={() =>
                                                                handleOpenActionModal(item, 'REJECT')
                                                            }
                                                        >
                                                            <XCircle size={13} className="mr-1" />
                                                            {t('teacherLeave.btnReject')}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal Form Pengajuan Cuti */}
            {school?.id && activeApplicantProfile && (
                <TeacherLeaveFormModal
                    isOpen={isFormOpen}
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => void loadLeaveData()}
                    schoolId={school.id}
                    teacherProfile={activeApplicantProfile}
                    quota={quota}
                    academicYearId={academicYear?.id ?? null}
                    isSuperAdminSimulation={isUsingSimulation}
                />
            )}

            {/* Drawer Detail & Pratinjau Signed URL */}
            <TeacherLeaveDetailDrawer
                request={selectedDetailRequest}
                onClose={() => setSelectedDetailRequest(null)}
                canVerifyTu={canVerifyTu}
                canApprovePrincipal={canApprovePrincipal}
                currentTeacherId={activeApplicantProfile?.id ?? null}
                onOpenAction={(req, act) => {
                    setSelectedDetailRequest(null);
                    handleOpenActionModal(req, act);
                }}
            />

            {/* Modal Verifikasi TU / Persetujuan Kepsek / Tolak / Batal */}
            <TeacherLeaveApprovalModal
                request={actionModalState.request}
                action={actionModalState.action}
                onClose={() => setActionModalState({ request: null, action: null })}
                onSuccess={() => void loadLeaveData()}
            />
        </div>
    );
}