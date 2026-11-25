// src/modules/teacher-attendance/components/TeacherBerandaTab.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Menu,
    RefreshCw,
    Lock,
    Unlock,
    ShieldCheck,
    Briefcase,
    Building2,
    TrendingUp,
    LogIn,
    LogOut,
    CheckCircle2,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type {
    AttendanceRecord,
    CheckOutTimingStatus,
    SchoolGeoAndSchedule,
    SubView,
    TeacherProfile,
} from '../types/teacherAttendance.types';
import { AutoScrollingText } from './AutoScrollingText';

interface TeacherBerandaTabProps {
    teacher: TeacherProfile | null;
    fallbackUserName?: string | null;
    resolvedTeacherPhotoUrl: string | null;
    teacherIdentityLabel: string;
    isTeacherAccountLinked: boolean;
    accountStatusHint: {
        title: string;
        description: string;
    };
    schoolGeo: SchoolGeoAndSchedule | null;
    todayRecord: AttendanceRecord | null;
    isLoadingData: boolean;
    onRefreshData: () => void;
    onToggleSidebar: () => void;
    onNavigateView: (view: SubView) => void;
    formattedDateWithPasaran: string;
    javaneseDateBadge: string;
    monthYearLabel: string;
    hoursStr: string;
    minutesStr: string;
    secondsStr: string;
    reportStats: {
        percentage: number;
        hadir: number;
        terlambat: number;
    };
    isHolidayLoading: boolean;
    isHoliday: boolean;
    isHolidayLocked: boolean;
    holidayReason: string;
    isAdminOrSuperAdmin: boolean;
    onOpenHolidayModal: () => void;
    showToast: (type: 'success' | 'error', message: string) => void;
    isCheckInLocked: boolean;
    canCheckOut: boolean;
    hasCheckedIn: boolean;
    hasCheckedOut: boolean;
    isOnLeaveToday: boolean;
    effectiveWorkStartTime: string;
    effectiveToleranceMinutes: number;
    effectiveWorkEndTime: string;
    effectiveDeadlineStr: string;
    currentLateMinutes: number;
    todayCheckOutTimingInfo: {
        status: CheckOutTimingStatus;
        isEarly: boolean;
        isOvertime: boolean;
        diffMinutes: number;
    };
    formatShortTime: (iso?: string | null) => string;
    formatDurationMinutes: (totalMinutes: number) => string;
    formatStatusLabel: (status?: string | null) => string;
}

interface DigitalClockCardProps {
    variant: 'mobile' | 'desktop';
    hoursStr: string;
    minutesStr: string;
    secondsStr: string;
    hourUnitLabel: string;
    minuteUnitLabel: string;
    secondUnitLabel: string;
}

function DigitalClockCard({
    variant,
    hoursStr,
    minutesStr,
    secondsStr,
    hourUnitLabel,
    minuteUnitLabel,
    secondUnitLabel,
}: DigitalClockCardProps) {
    const isMobile = variant === 'mobile';

    return (
        <div
            className={
                isMobile
                    ? 'col-span-5 sm:hidden rounded-2xl bg-linear-to-b from-[#F2F4F8] via-[#F7F3E6] to-[#EDE3C8] border border-amber-300/75 py-2.5 px-2 flex flex-col items-center justify-between text-center shadow-inner relative overflow-hidden'
                    : 'hidden sm:flex sm:col-span-4 rounded-2xl bg-linear-to-b from-[#F2F4F8] via-[#F7F3E6] to-[#EDE3C8] border border-amber-300/75 py-3 px-2.5 flex-col items-center justify-between text-center shadow-inner relative overflow-hidden'
            }
        >
            <div
                className={
                    isMobile
                        ? 'pointer-events-none absolute -bottom-4 -right-4 w-16 h-16 rounded-full bg-amber-300/20'
                        : 'pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-amber-300/20'
                }
            />

            <div
                className={`flex items-center justify-center ${isMobile ? 'gap-1.5' : 'gap-2'
                    } w-full`}
            >
                <span
                    className={`${isMobile ? 'text-xl' : 'text-2xl'
                        } font-extrabold text-[#1E3F73] leading-none font-mono`}
                >
                    {hoursStr}
                </span>
                <span
                    className={`${isMobile ? 'text-[9px]' : 'text-[10px]'
                        } font-bold tracking-wider text-slate-400`}
                >
                    {hourUnitLabel}
                </span>
            </div>

            <div className="w-full h-px bg-amber-300/60 my-1" />

            <div
                className={`flex items-center justify-center ${isMobile ? 'gap-1.5' : 'gap-2'
                    } w-full`}
            >
                <span
                    className={`${isMobile ? 'text-xl' : 'text-2xl'
                        } font-extrabold text-[#1E3F73] leading-none font-mono`}
                >
                    {minutesStr}
                </span>
                <span
                    className={`${isMobile ? 'text-[9px]' : 'text-[10px]'
                        } font-bold tracking-wider text-slate-400`}
                >
                    {minuteUnitLabel}
                </span>
            </div>

            <div className="w-full h-px bg-amber-300/60 my-1" />

            <div
                className={`flex items-center justify-center ${isMobile ? 'gap-1.5' : 'gap-2'
                    } w-full`}
            >
                <span
                    className={`${isMobile ? 'text-xl' : 'text-2xl'
                        } font-extrabold text-rose-500 leading-none font-mono`}
                >
                    {secondsStr}
                </span>
                <span
                    className={`${isMobile ? 'text-[9px]' : 'text-[10px]'
                        } font-bold tracking-wider text-rose-400`}
                >
                    {secondUnitLabel}
                </span>
            </div>
        </div>
    );
}

const PROFILE_HINT_AUTO_CLOSE_MS = 4500;

export function TeacherBerandaTab({
    teacher,
    fallbackUserName,
    resolvedTeacherPhotoUrl,
    teacherIdentityLabel,
    isTeacherAccountLinked,
    accountStatusHint,
    schoolGeo,
    todayRecord,
    isLoadingData,
    onRefreshData,
    onToggleSidebar,
    onNavigateView,
    formattedDateWithPasaran,
    javaneseDateBadge,
    monthYearLabel,
    hoursStr,
    minutesStr,
    secondsStr,
    reportStats,
    isHolidayLoading,
    isHoliday,
    isHolidayLocked,
    holidayReason,
    isAdminOrSuperAdmin,
    onOpenHolidayModal,
    showToast,
    isCheckInLocked,
    canCheckOut,
    hasCheckedIn,
    hasCheckedOut,
    isOnLeaveToday,
    effectiveWorkStartTime,
    effectiveToleranceMinutes,
    effectiveWorkEndTime,
    effectiveDeadlineStr,
    currentLateMinutes,
    todayCheckOutTimingInfo,
    formatShortTime,
    formatDurationMinutes,
    formatStatusLabel,
}: TeacherBerandaTabProps) {
    const { t } = useTranslation();

    const [photoLoadError, setPhotoLoadError] = useState<boolean>(false);
    const [isProfileHintOpen, setIsProfileHintOpen] = useState<boolean>(false);
    const profileHintRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setPhotoLoadError(false);
        setIsProfileHintOpen(false);
    }, [teacher?.id, resolvedTeacherPhotoUrl]);

    // Tutup otomatis popover informasi status akun saat mengetuk area luar atau setelah 4,5 detik
    useEffect(() => {
        if (!isProfileHintOpen) return;

        const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
            if (
                profileHintRef.current &&
                !profileHintRef.current.contains(event.target as Node)
            ) {
                setIsProfileHintOpen(false);
            }
        };

        const autoCloseTimer = setTimeout(() => {
            setIsProfileHintOpen(false);
        }, PROFILE_HINT_AUTO_CLOSE_MS);

        document.addEventListener('mousedown', handlePointerDownOutside);
        document.addEventListener('touchstart', handlePointerDownOutside, {
            passive: true,
        });

        return () => {
            clearTimeout(autoCloseTimer);
            document.removeEventListener('mousedown', handlePointerDownOutside);
            document.removeEventListener('touchstart', handlePointerDownOutside);
        };
    }, [isProfileHintOpen]);

    // Identitas tampilan guru (terisolasi dari re-render jam tiap detik)
    const { displayName, avatarAlt, avatarInitial } = useMemo(() => {
        const resolvedName =
            teacher?.fullName?.trim() || fallbackUserName?.trim() || '';
        return {
            displayName:
                resolvedName || t('teacherAttendance.profileUnlinked'),
            avatarAlt: resolvedName || 'Guru',
            avatarInitial: (resolvedName || 'G').charAt(0).toUpperCase(),
        };
    }, [teacher?.fullName, fallbackUserName, t]);

    // Jabatan utama & tugas tambahan (deduplikasi per item & anti-duplikat terhadap jabatan utama)
    const { basePositionLabel, additionalDutyText } = useMemo(() => {
        const baseLabel =
            teacher?.position?.trim() ||
            t('teacherAttendance.defaultTeacherPosition');
        const normalizedBase = baseLabel.toLowerCase();

        const seen = new Set<string>();
        const uniqueDuties: string[] = [];

        for (const rawDuty of teacher?.additionalDuties ?? []) {
            const trimmed = rawDuty.trim();
            if (!trimmed) continue;
            const normalized = trimmed.toLowerCase();
            if (normalized === normalizedBase || seen.has(normalized)) continue;
            seen.add(normalized);
            uniqueDuties.push(trimmed);
        }

        return {
            basePositionLabel: baseLabel,
            additionalDutyText:
                uniqueDuties.length > 0 ? uniqueDuties.join(', ') : null,
        };
    }, [teacher?.position, teacher?.additionalDuties, t]);

    const clampedAttendancePercentage = Math.min(
        100,
        Math.max(0, reportStats.percentage)
    );

    const handleToggleProfileHint = useCallback(() => {
        setIsProfileHintOpen((prev) => !prev);
    }, []);

    const handlePhotoError = useCallback(() => {
        setPhotoLoadError(true);
    }, []);

    const handleHolidayButtonClick = useCallback(() => {
        if (isAdminOrSuperAdmin) {
            onOpenHolidayModal();
        } else if (isHolidayLocked) {
            showToast(
                'error',
                t('teacherAttendance.toastHolidayError', {
                    reason: holidayReason,
                })
            );
        } else {
            showToast(
                'success',
                t('teacherAttendance.titleSpecialEventActive', {
                    reason: holidayReason,
                })
            );
        }
    }, [
        isAdminOrSuperAdmin,
        onOpenHolidayModal,
        isHolidayLocked,
        showToast,
        t,
        holidayReason,
    ]);

    const handleCheckInCardClick = useCallback(() => {
        if (isCheckInLocked) return;
        onNavigateView('peta');
    }, [isCheckInLocked, onNavigateView]);

    const handleCheckOutCardClick = useCallback(() => {
        if (!canCheckOut) return;
        onNavigateView('peta');
    }, [canCheckOut, onNavigateView]);

    // Status visual & teks kartu DATANG
    const checkInDisplay = useMemo(() => {
        const isHolidayBlocked =
            isHolidayLocked && !hasCheckedIn && !isOnLeaveToday;

        let primaryText: string;
        if (isHolidayBlocked) {
            primaryText = t('teacherAttendance.lockedHolidayShort', {
                reason: holidayReason,
            });
        } else if (isOnLeaveToday) {
            primaryText = t('teacherAttendance.lockedStatusShort', {
                status: formatStatusLabel(todayRecord?.status),
            });
        } else if (hasCheckedIn) {
            primaryText = t('teacherAttendance.lockedAlreadyCheckedIn');
        } else if (currentLateMinutes > 0) {
            primaryText = t('teacherAttendance.lateDurationLabel', {
                duration: formatDurationMinutes(currentLateMinutes),
            });
        } else if (effectiveToleranceMinutes > 0) {
            primaryText = t('teacherAttendance.toleranceDeadlineLabel', {
                time: effectiveDeadlineStr,
            });
        } else {
            primaryText = t('teacherAttendance.tapToCheckIn');
        }

        let dotClassName = 'bg-amber-300 animate-pulse';
        let statusText: string;

        if (isHolidayBlocked) {
            dotClassName = 'bg-rose-400';
            statusText = t('teacherAttendance.holidayShortLabel');
        } else if (hasCheckedIn) {
            const isLateRecord = todayRecord?.status === 'TERLAMBAT';
            dotClassName = isLateRecord ? 'bg-amber-400' : 'bg-emerald-400';
            statusText =
                isLateRecord && currentLateMinutes > 0
                    ? t('teacherAttendance.lateMinutesShort', {
                        minutes: currentLateMinutes,
                    })
                    : t('teacherAttendance.statusWithLabel', {
                        status: formatStatusLabel(todayRecord?.status),
                    });
        } else if (currentLateMinutes > 0) {
            dotClassName = 'bg-rose-400 animate-pulse';
            statusText = t('teacherAttendance.pastDeadlineLabel', {
                time: effectiveDeadlineStr,
            });
        } else {
            statusText = t('teacherAttendance.waitingCheckIn');
        }

        return { primaryText, dotClassName, statusText };
    }, [
        isHolidayLocked,
        hasCheckedIn,
        isOnLeaveToday,
        holidayReason,
        todayRecord?.status,
        currentLateMinutes,
        effectiveToleranceMinutes,
        effectiveDeadlineStr,
        formatStatusLabel,
        formatDurationMinutes,
        t,
    ]);

    // Status visual & teks kartu PULANG
    const checkOutDisplay = useMemo(() => {
        const isHolidayBlocked = isHolidayLocked && !hasCheckedOut;

        let primaryText: string;
        if (isHolidayBlocked) {
            primaryText = t('teacherAttendance.lockedHolidayShort', {
                reason: holidayReason,
            });
        } else if (!hasCheckedIn) {
            primaryText = t('teacherAttendance.lockedCheckInFirst');
        } else if (hasCheckedOut) {
            primaryText = t('teacherAttendance.lockedAlreadyCheckedOut');
        } else {
            primaryText = t('teacherAttendance.checkOutNotRecorded');
        }

        let dotClassName = 'bg-amber-100/60';
        let statusText: string;

        if (isHolidayBlocked) {
            dotClassName = 'bg-rose-300';
            statusText = t('teacherAttendance.holidayShortLabel');
        } else if (!hasCheckedIn) {
            statusText = t('teacherAttendance.activeAfterCheckIn');
        } else if (hasCheckedOut) {
            dotClassName =
                todayCheckOutTimingInfo.isEarly ||
                    todayCheckOutTimingInfo.isOvertime
                    ? 'bg-amber-200'
                    : 'bg-emerald-300';

            if (todayCheckOutTimingInfo.isEarly) {
                statusText = t('teacherAttendance.statusEarlyCheckOut');
            } else if (todayCheckOutTimingInfo.isOvertime) {
                statusText = t('teacherAttendance.statusOvertimeCheckOut');
            } else {
                statusText = t('teacherAttendance.statusCompletedOnTime');
            }
        } else {
            if (canCheckOut) {
                dotClassName = 'bg-red-400 animate-ping';
            }
            statusText = t('teacherAttendance.tapToCheckOut');
        }

        return { primaryText, dotClassName, statusText };
    }, [
        isHolidayLocked,
        hasCheckedOut,
        hasCheckedIn,
        canCheckOut,
        holidayReason,
        todayCheckOutTimingInfo.isEarly,
        todayCheckOutTimingInfo.isOvertime,
        t,
    ]);

    const hourUnitLabel = t('teacherAttendance.clockHourUnit');
    const minuteUnitLabel = t('teacherAttendance.clockMinuteUnit');
    const secondUnitLabel = t('teacherAttendance.clockSecondUnit');

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
        >
            <div className="relative rounded-[28px] overflow-hidden shadow-xl bg-linear-to-br from-[#1C3D6E] via-[#26508E] to-[#3468AE] p-5 text-white">
                <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/5" />
                <div className="pointer-events-none absolute right-12 top-24 w-28 h-28 rounded-full bg-amber-300/10" />

                <div className="relative flex items-start sm:items-center justify-between gap-2.5 mb-4">
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        <button
                            type="button"
                            onClick={onToggleSidebar}
                            className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                            title={t('teacherAttendance.titleToggleSidebar')}
                            aria-label="Toggle Sidebar"
                        >
                            <Menu size={18} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">
                                {t('teacherAttendance.welcomeTitle')}
                            </h1>
                            <p className="text-xs text-blue-100/95 font-medium mt-0.5 leading-snug">
                                {formattedDateWithPasaran}
                            </p>
                            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-md bg-amber-300/20 border border-amber-200/30 text-[10px] font-semibold text-amber-200">
                                {javaneseDateBadge}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={onRefreshData}
                            className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0 sm:order-2"
                            title={t('teacherAttendance.titleRefreshData')}
                        >
                            <RefreshCw
                                size={17}
                                className={isLoadingData ? 'animate-spin' : ''}
                            />
                        </button>

                        {!isHolidayLoading && isHoliday && (
                            <button
                                type="button"
                                onClick={handleHolidayButtonClick}
                                className={`inline-flex items-center justify-center gap-1.5 p-2.5 sm:px-2.5 sm:py-2 rounded-xl border text-[11px] font-semibold backdrop-blur-xs transition active:scale-95 shrink-0 sm:order-1 ${isHolidayLocked
                                        ? 'bg-rose-500/25 hover:bg-rose-500/35 border-rose-300/40 text-rose-100'
                                        : 'bg-emerald-500/30 hover:bg-emerald-500/40 border-emerald-300/50 text-emerald-100'
                                    }`}
                                title={
                                    isHolidayLocked
                                        ? t('teacherAttendance.toastHolidayError', {
                                            reason: holidayReason,
                                        })
                                        : t('teacherAttendance.titleSpecialEventActive', {
                                            reason: holidayReason,
                                        })
                                }
                                aria-label={
                                    isHolidayLocked
                                        ? t('teacherAttendance.badgeHoliday')
                                        : t('teacherAttendance.badgeSpecialTeacher')
                                }
                            >
                                {isHolidayLocked ? (
                                    <>
                                        <Lock size={16} className="text-rose-200 shrink-0" />
                                        <span className="hidden sm:inline">
                                            {t('teacherAttendance.badgeHoliday')}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Unlock size={16} className="text-emerald-200 shrink-0" />
                                        <span className="hidden sm:inline">
                                            {t('teacherAttendance.badgeSpecialTeacher')}
                                        </span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* KARTU PROFIL & JAM */}
                <div className="relative rounded-3xl bg-linear-to-br from-[#F9FAFB] via-[#F7F5F0] to-[#EFECE3] text-slate-800 p-4 shadow-lg border border-white/80">
                    <div className="grid grid-cols-12 gap-3 items-stretch">
                        <div className="col-span-12 sm:col-span-8 flex flex-col justify-between gap-3">
                            <div className="flex items-start gap-3">
                                {/* Foto Profil + Lencana Status Akun */}
                                <div ref={profileHintRef} className="relative shrink-0 mt-0.5">
                                    <button
                                        type="button"
                                        onClick={handleToggleProfileHint}
                                        aria-expanded={isProfileHintOpen}
                                        aria-label={`${accountStatusHint.title}: ${accountStatusHint.description}`}
                                        title={`${accountStatusHint.title} — ${accountStatusHint.description}`}
                                        className="group relative block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-95 transition-transform cursor-pointer"
                                    >
                                        <div className="p-0.5 rounded-2xl bg-linear-to-br from-amber-400 to-[#1E447A]">
                                            {resolvedTeacherPhotoUrl && !photoLoadError ? (
                                                <img
                                                    src={resolvedTeacherPhotoUrl}
                                                    alt={avatarAlt}
                                                    onError={handlePhotoError}
                                                    className="w-14 h-14 rounded-[14px] object-cover bg-white"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-[14px] bg-linear-to-br from-[#1C3D6E] to-[#2E62A8] text-white flex items-center justify-center text-lg font-bold">
                                                    {avatarInitial}
                                                </div>
                                            )}
                                        </div>
                                        <span
                                            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow border border-white transition-transform group-hover:scale-110 ${isTeacherAccountLinked
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-amber-400 text-slate-900'
                                                }`}
                                        >
                                            <ShieldCheck size={12} />
                                        </span>
                                    </button>

                                    <AnimatePresence>
                                        {isProfileHintOpen && (
                                            <motion.div
                                                role="status"
                                                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                                                transition={{ duration: 0.16 }}
                                                className="absolute left-0 top-full mt-2 z-30 w-60 rounded-2xl bg-slate-900/95 text-white p-3 shadow-xl border border-white/15 backdrop-blur-md text-left"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <span
                                                        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isTeacherAccountLinked
                                                                ? 'bg-emerald-500/20 text-emerald-300'
                                                                : 'bg-amber-400/20 text-amber-300'
                                                            }`}
                                                    >
                                                        <ShieldCheck size={12} />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p
                                                            className={`text-[11px] font-bold leading-tight ${isTeacherAccountLinked
                                                                    ? 'text-emerald-300'
                                                                    : 'text-amber-300'
                                                                }`}
                                                        >
                                                            {accountStatusHint.title}
                                                        </p>
                                                        <p className="text-[10px] text-slate-200/90 leading-snug mt-0.5">
                                                            {accountStatusHint.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h2 className="font-bold text-[15px] sm:text-base text-slate-900 leading-snug wrap-break-word">
                                        {displayName}
                                    </h2>
                                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                                        {teacherIdentityLabel}
                                    </p>
                                    <p className="text-[11px] text-slate-600 flex items-start gap-1.5 mt-1 leading-snug">
                                        <Briefcase
                                            size={12}
                                            className="text-[#1C3D6E] shrink-0 mt-0.5"
                                        />
                                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                            <span>{basePositionLabel}</span>
                                            {additionalDutyText && (
                                                <>
                                                    <span className="text-slate-400">•</span>
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#1C3D6E]/10 text-[#1C3D6E] font-semibold text-[10px] leading-none">
                                                        {additionalDutyText}
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                    </p>
                                    <p className="text-[11px] text-slate-600 flex items-start gap-1.5 mt-0.5 leading-snug">
                                        <Building2
                                            size={12}
                                            className="text-amber-600 shrink-0 mt-0.5"
                                        />
                                        <span>
                                            {schoolGeo?.name ??
                                                t('teacherAttendance.defaultSchoolUnit')}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Baris Tingkat Kehadiran (+ Jam khusus HP) */}
                            <div className="grid grid-cols-12 sm:grid-cols-1 gap-2.5 items-stretch">
                                <div className="col-span-7 sm:col-span-1 rounded-2xl bg-white/85 backdrop-blur-xs border border-slate-200/80 p-3 shadow-xs flex flex-col justify-between">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-6 h-6 rounded-lg bg-[#254E89] text-white flex items-center justify-center shrink-0">
                                                <TrendingUp size={13} />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-medium text-slate-500 leading-tight">
                                                    {t('teacherAttendance.attendanceRateLabel')}
                                                </p>
                                                <p className="text-[11px] font-semibold text-slate-700 leading-snug">
                                                    {monthYearLabel}
                                                </p>
                                            </div>
                                        </div>

                                        <span className="hidden sm:inline-block text-xl font-extrabold text-slate-900">
                                            {reportStats.percentage}%
                                        </span>
                                    </div>

                                    <div className="mt-2">
                                        <div className="flex sm:hidden items-baseline justify-between">
                                            <span className="text-2xl font-extrabold text-slate-900">
                                                {reportStats.percentage}%
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {t('teacherAttendance.presentDaysCount', {
                                                    count: reportStats.hadir + reportStats.terlambat,
                                                })}
                                            </span>
                                        </div>

                                        <div className="w-full h-1.5 rounded-full bg-slate-200 mt-1.5 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-linear-to-r from-amber-400 to-emerald-500 transition-all duration-500"
                                                style={{
                                                    width: `${clampedAttendancePercentage}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* JAM DIGITAL KHUSUS LAYAR HP (< 640px) */}
                                <DigitalClockCard
                                    variant="mobile"
                                    hoursStr={hoursStr}
                                    minutesStr={minutesStr}
                                    secondsStr={secondsStr}
                                    hourUnitLabel={hourUnitLabel}
                                    minuteUnitLabel={minuteUnitLabel}
                                    secondUnitLabel={secondUnitLabel}
                                />
                            </div>
                        </div>

                        {/* JAM DIGITAL KHUSUS LAYAR KOMPUTER (>= 640px) */}
                        <DigitalClockCard
                            variant="desktop"
                            hoursStr={hoursStr}
                            minutesStr={minutesStr}
                            secondsStr={secondsStr}
                            hourUnitLabel={hourUnitLabel}
                            minuteUnitLabel={minuteUnitLabel}
                            secondUnitLabel={secondUnitLabel}
                        />
                    </div>
                </div>
            </div>

            {/* Dua Kartu Utama: DATANG & PULANG */}
            <div className="grid grid-cols-2 gap-3.5">
                {/* KARTU DATANG */}
                <button
                    type="button"
                    disabled={isCheckInLocked}
                    onClick={handleCheckInCardClick}
                    className={`text-left rounded-[26px] p-4 shadow-lg transition bg-linear-to-br from-[#475E78] via-[#3A4F68] to-[#2B3D52] text-white border border-white/15 flex flex-col justify-between min-h-43.75 ${isCheckInLocked
                            ? 'opacity-65 cursor-not-allowed saturate-75'
                            : 'hover:scale-[1.01] active:scale-[0.99] ring-2 ring-emerald-400/70'
                        }`}
                >
                    <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                            <span className="p-2 rounded-xl bg-white/10">
                                <LogIn size={16} />
                            </span>
                            <div>
                                <div className="text-sm font-bold leading-tight">
                                    {t('teacherAttendance.cardCheckInTitle')}
                                </div>
                                <div className="text-[10px] font-semibold text-emerald-300">
                                    {t('teacherAttendance.cardCheckInSub')}
                                </div>
                            </div>
                        </div>
                        {isCheckInLocked && (
                            <div className="flex items-center gap-1 shrink-0">
                                {hasCheckedIn && (
                                    <CheckCircle2 size={15} className="text-emerald-300" />
                                )}
                                <span className="p-1.5 rounded-lg bg-black/25 text-slate-200">
                                    <Lock size={13} />
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="my-3 text-center">
                        <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                            {formatShortTime(todayRecord?.checkInTime)}
                        </div>
                        <div className="text-[10px] text-slate-200/80 mt-1">
                            {t('teacherAttendance.scheduleLabel', {
                                time: effectiveWorkStartTime,
                            })}
                            {effectiveToleranceMinutes > 0
                                ? ` (+${effectiveToleranceMinutes}m)`
                                : ''}
                        </div>
                    </div>

                    <div className="space-y-1 w-full min-w-0">
                        <AutoScrollingText
                            className="text-[11px] text-slate-200/85 w-full"
                            text={checkInDisplay.primaryText}
                        />
                        <div className="text-[11px] text-slate-100 flex items-center gap-1.5 font-medium min-w-0">
                            <span
                                className={`w-2 h-2 rounded-full shrink-0 ${checkInDisplay.dotClassName}`}
                            />
                            <AutoScrollingText
                                className="flex-1 min-w-0"
                                text={checkInDisplay.statusText}
                            />
                        </div>
                    </div>
                </button>

                {/* KARTU PULANG */}
                <button
                    type="button"
                    disabled={!canCheckOut}
                    onClick={handleCheckOutCardClick}
                    className={`text-left rounded-[26px] p-4 shadow-lg transition bg-linear-to-br from-[#D6B16B] via-[#C59D52] to-[#AD8438] text-white border border-white/20 flex flex-col justify-between min-h-43.75 ${!canCheckOut
                            ? 'opacity-65 cursor-not-allowed saturate-75'
                            : 'hover:scale-[1.01] active:scale-[0.99] ring-2 ring-red-400/70'
                        }`}
                >
                    <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                            <span className="p-2 rounded-xl bg-white/15">
                                <LogOut size={16} />
                            </span>
                            <div>
                                <div className="text-sm font-bold leading-tight">
                                    {t('teacherAttendance.cardCheckOutTitle')}
                                </div>
                                <div className="text-[10px] font-semibold text-red-100">
                                    {t('teacherAttendance.cardCheckOutSub')}
                                </div>
                            </div>
                        </div>
                        {!canCheckOut && (
                            <div className="flex items-center gap-1 shrink-0">
                                {hasCheckedOut && (
                                    <CheckCircle2 size={15} className="text-emerald-200" />
                                )}
                                <span className="p-1.5 rounded-lg bg-black/25 text-amber-100">
                                    <Lock size={13} />
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="my-3 text-center">
                        <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                            {formatShortTime(todayRecord?.checkOutTime)}
                        </div>
                        <div className="text-[10px] text-amber-50/90 mt-1">
                            {t('teacherAttendance.scheduleLabel', {
                                time: effectiveWorkEndTime,
                            })}
                        </div>
                    </div>

                    <div className="space-y-1 w-full min-w-0">
                        <AutoScrollingText
                            className="text-[11px] text-amber-50/90 w-full"
                            text={checkOutDisplay.primaryText}
                        />
                        <div className="text-[11px] text-white flex items-center gap-1.5 font-medium min-w-0">
                            <span
                                className={`w-2 h-2 rounded-full shrink-0 ${checkOutDisplay.dotClassName}`}
                            />
                            <AutoScrollingText
                                className="flex-1 min-w-0"
                                text={checkOutDisplay.statusText}
                            />
                        </div>
                    </div>
                </button>
            </div>
        </motion.div>
    );
}