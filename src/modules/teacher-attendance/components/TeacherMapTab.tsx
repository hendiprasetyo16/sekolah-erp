// src/modules/teacher-attendance/components/TeacherMapTab.tsx
import { useState, useEffect, useCallback, type RefObject } from 'react';
import { motion } from 'framer-motion';
import {
    Menu,
    LocateFixed,
    Radio,
    AlertTriangle,
    MapPin,
    Clock,
    Sparkles,
    RefreshCw,
    CheckCircle2,
    FileCheck2,
    Lock,
    XCircle,
    Fingerprint,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_RADIUS_METERS } from '../constants/teacherAttendance.constants';
import type {
    AttendanceRecord,
    CheckOutTimingStatus,
    DailyQuoteItem,
    SchoolGeoAndSchedule,
    TeacherProfile,
} from '../types/teacherAttendance.types';

function LiveMinuteBadge({ schoolTimezone }: { schoolTimezone: string }) {
    const getFormattedMinute = useCallback(() => {
        try {
            return new Intl.DateTimeFormat('en-GB', {
                timeZone: schoolTimezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).format(new Date());
        } catch {
            const now = new Date();
            return `${String(now.getHours()).padStart(2, '0')}:${String(
                now.getMinutes()
            ).padStart(2, '0')}`;
        }
    }, [schoolTimezone]);

    const [timeText, setTimeText] = useState(getFormattedMinute);

    useEffect(() => {
        setTimeText(getFormattedMinute());
        const timer = window.setInterval(() => {
            setTimeText(getFormattedMinute());
        }, 5000);
        return () => window.clearInterval(timer);
    }, [getFormattedMinute]);

    return (
        <div className="text-sm font-extrabold text-slate-900 font-mono">
            {timeText}
        </div>
    );
}

interface TeacherMapTabProps {
    teacher: TeacherProfile | null;
    schoolGeo: SchoolGeoAndSchedule | null;
    schoolTimezone: string;
    todayRecord: AttendanceRecord | null;
    attendancePhase: 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED' | 'ON_LEAVE';
    formattedDateWithPasaran: string;
    onToggleSidebar: () => void;
    userCoords: { lat: number; lng: number; accuracy: number } | null;
    gpsError: string | null;
    isLocating: boolean;
    distanceMeters: number | null;
    isWithinRadius: boolean;
    onRefreshGps: () => void;
    mapContainerRef: RefObject<HTMLDivElement | null>;
    isCheckOutPhase: boolean;
    isSelfieRequiredForCurrentPhase: boolean;
    effectiveWorkEndTime: string;
    effectiveDeadlineStr: string;
    currentLateMinutes: number;
    activeQuotes: DailyQuoteItem[];
    activeQuoteItem: DailyQuoteItem;
    onNextQuote: () => void;
    isAdminOrSuperAdmin: boolean;
    onNavigateManageQuotes: () => void;
    isHolidayLocked: boolean;
    holidayReason: string;
    isSubmittingAttendance: boolean;
    todayCheckOutTimingInfo: {
        status: CheckOutTimingStatus;
        isEarly: boolean;
        isOvertime: boolean;
        diffMinutes: number;
    };
    onFingerprintAction: () => void;
    formatShortTime: (iso?: string | null) => string;
    formatDistanceLabel: (meters: number | null) => string;
    formatStatusLabel: (status?: string | null) => string;
}

export function TeacherMapTab({
    teacher,
    schoolGeo,
    schoolTimezone,
    todayRecord,
    attendancePhase,
    formattedDateWithPasaran,
    onToggleSidebar,
    userCoords,
    gpsError,
    isLocating,
    distanceMeters,
    isWithinRadius,
    onRefreshGps,
    mapContainerRef,
    isCheckOutPhase,
    isSelfieRequiredForCurrentPhase,
    effectiveWorkEndTime,
    effectiveDeadlineStr,
    currentLateMinutes,
    activeQuotes,
    activeQuoteItem,
    onNextQuote,
    isAdminOrSuperAdmin,
    onNavigateManageQuotes,
    isHolidayLocked,
    holidayReason,
    isSubmittingAttendance,
    todayCheckOutTimingInfo,
    onFingerprintAction,
    formatShortTime,
    formatDistanceLabel,
    formatStatusLabel,
}: TeacherMapTabProps) {
    const { t } = useTranslation();

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-3"
        >
            <div className="rounded-2xl bg-linear-to-r from-[#1D3554] to-[#525B44] p-4 text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                        title={t('teacherAttendance.titleToggleSidebar')}
                    >
                        <Menu size={17} />
                    </button>
                    <div>
                        <h2 className="font-bold text-base leading-tight">
                            {attendancePhase === 'CHECK_OUT'
                                ? t('teacherAttendance.mapHeaderCheckOut')
                                : attendancePhase === 'COMPLETED'
                                    ? t('teacherAttendance.mapHeaderCompleted')
                                    : attendancePhase === 'ON_LEAVE'
                                        ? t('teacherAttendance.mapHeaderOnLeave', {
                                            status: formatStatusLabel(todayRecord?.status),
                                        })
                                        : t('teacherAttendance.mapHeaderCheckIn')}
                        </h2>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${attendancePhase === 'CHECK_OUT'
                                        ? 'bg-red-500/85 text-white'
                                        : 'bg-emerald-500/85 text-white'
                                    }`}
                            >
                                {attendancePhase === 'CHECK_OUT'
                                    ? t('teacherAttendance.cardCheckOutSub')
                                    : attendancePhase === 'COMPLETED'
                                        ? t('teacherAttendance.badgeCompleted')
                                        : attendancePhase === 'ON_LEAVE'
                                            ? t('teacherAttendance.badgeLeaveOrSick')
                                            : t('teacherAttendance.cardCheckInSub')}
                            </span>
                            <span className="text-[11px] text-white/90 font-medium">
                                • {formattedDateWithPasaran}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRefreshGps}
                    disabled={isLocating}
                    className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                    title={t('teacherAttendance.titleRefreshGps')}
                >
                    <LocateFixed size={19} className={isLocating ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* INDIKATOR RADIUS GPS REAL-TIME SEBELUM SELFIE */}
            <div
                className={`rounded-2xl p-3 border flex items-center justify-between gap-2.5 text-xs shadow-sm ${isLocating || distanceMeters === null
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-200'
                        : isWithinRadius
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                            : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
                    }`}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <Radio
                        size={18}
                        className={`shrink-0 ${isLocating || distanceMeters === null
                                ? 'animate-pulse text-blue-500'
                                : isWithinRadius
                                    ? 'text-emerald-500'
                                    : 'text-red-500'
                            }`}
                    />
                    <div className="min-w-0">
                        <p className="font-bold truncate">
                            {isLocating || distanceMeters === null
                                ? t('teacherAttendance.gpsLocking')
                                : isWithinRadius
                                    ? t('teacherAttendance.gpsInsideRadius', {
                                        distance: formatDistanceLabel(distanceMeters),
                                    })
                                    : t('teacherAttendance.gpsOutsideRadius', {
                                        distance: formatDistanceLabel(distanceMeters),
                                    })}
                        </p>
                        <p className="text-[10px] opacity-80">
                            {userCoords
                                ? t('teacherAttendance.gpsAccuracyInfo', {
                                    accuracy: Math.round(userCoords.accuracy),
                                    radius: schoolGeo?.radius ?? DEFAULT_RADIUS_METERS,
                                })
                                : t('teacherAttendance.gpsEnsureActive')}
                        </p>
                    </div>
                </div>

                {isWithinRadius &&
                    attendancePhase === 'CHECK_IN' &&
                    currentLateMinutes > 0 && (
                        <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold shrink-0">
                            {t('teacherAttendance.lateBadgeShort', {
                                minutes: currentLateMinutes,
                            })}
                        </span>
                    )}
            </div>

            <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-white/15 shadow-xl bg-slate-900">
                <div ref={mapContainerRef} className="w-full h-56 sm:h-72 z-10" />

                {gpsError && (
                    <div className="absolute inset-x-3 top-3 z-20 p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 flex items-center gap-2">
                        <AlertTriangle size={16} className="shrink-0 text-red-400" />
                        <span>{gpsError}</span>
                    </div>
                )}

                <div className="p-3.5 sm:p-4 bg-white/95 text-slate-800 backdrop-blur-md">
                    <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b border-slate-200">
                        <div>
                            <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <MapPin size={16} />
                            </div>
                            <div className="text-sm font-extrabold text-slate-900">
                                {formatDistanceLabel(distanceMeters)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                                {t('teacherAttendance.metricDistance')}
                            </div>
                        </div>

                        <div>
                            <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <LocateFixed size={16} />
                            </div>
                            <div className="text-sm font-extrabold text-slate-900">
                                {schoolGeo?.radius ?? DEFAULT_RADIUS_METERS} m
                            </div>
                            <div className="text-[11px] text-slate-500">
                                {t('teacherAttendance.metricSchoolRadius')}
                            </div>
                        </div>

                        <div>
                            <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Clock size={16} />
                            </div>
                            <LiveMinuteBadge schoolTimezone={schoolTimezone} />
                            <div className="text-[11px] text-slate-500">
                                {isCheckOutPhase
                                    ? t('teacherAttendance.metricCheckOutAt', {
                                        time: effectiveWorkEndTime,
                                    })
                                    : t('teacherAttendance.metricDeadlineAt', {
                                        time: effectiveDeadlineStr,
                                    })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-linear-to-r from-[#1D4E7A] to-[#2B8A78] p-3 text-center text-white relative">
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold">
                                <Sparkles size={11} />{' '}
                                {t('teacherAttendance.quoteOfTheDayBadge')}
                            </span>
                            {activeQuotes.length > 1 && (
                                <button
                                    type="button"
                                    onClick={onNextQuote}
                                    className="p-1 rounded-full bg-white/15 hover:bg-white/25 transition"
                                    title={t('teacherAttendance.titleNextQuote')}
                                >
                                    <RefreshCw size={10} />
                                </button>
                            )}
                            {isAdminOrSuperAdmin && (
                                <button
                                    type="button"
                                    onClick={onNavigateManageQuotes}
                                    className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold hover:bg-amber-300 transition"
                                    title={t('teacherAttendance.titleManageQuotes')}
                                >
                                    {t('teacherAttendance.btnManageQuotes')}
                                </button>
                            )}
                        </div>
                        <p className="text-xs italic leading-relaxed text-white/95">
                            “{activeQuoteItem.quote}”
                        </p>
                        {activeQuoteItem.author && (
                            <p className="text-[10px] text-amber-200 font-semibold mt-1">
                                — {activeQuoteItem.author}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {!teacher ? (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-200 text-center">
                    {t('teacherAttendance.errTeacherUnlinked')}
                </div>
            ) : attendancePhase === 'COMPLETED' ? (
                <div className="w-full py-3 px-4 rounded-2xl bg-emerald-600/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 text-center">
                    <CheckCircle2 size={17} className="shrink-0" />
                    <span>
                        {t('teacherAttendance.completedSummaryBanner', {
                            checkIn: formatShortTime(todayRecord?.checkInTime),
                            checkOut: formatShortTime(todayRecord?.checkOutTime),
                            note: todayCheckOutTimingInfo.isEarly
                                ? t('teacherAttendance.completedEarlySuffix')
                                : todayCheckOutTimingInfo.isOvertime
                                    ? t('teacherAttendance.completedOvertimeSuffix')
                                    : '',
                        })}
                    </span>
                </div>
            ) : attendancePhase === 'ON_LEAVE' ? (
                <div className="w-full py-3 px-4 rounded-2xl bg-blue-600/15 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold text-xs flex items-center justify-center gap-2">
                    <FileCheck2 size={17} className="shrink-0" />
                    <span>
                        {t('teacherAttendance.onLeaveBanner', {
                            status: formatStatusLabel(todayRecord?.status),
                        })}
                    </span>
                </div>
            ) : isHolidayLocked ? (
                <div className="w-full py-3 px-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-200 font-semibold text-xs flex items-center justify-center gap-2 text-center">
                    <Lock size={15} className="shrink-0" />
                    <span>
                        {t('teacherAttendance.toastHolidayError', {
                            reason: holidayReason,
                        })}
                    </span>
                </div>
            ) : !isWithinRadius ? (
                <button
                    type="button"
                    onClick={onRefreshGps}
                    className="w-full py-3 px-4 rounded-2xl bg-[#F06464] hover:bg-[#e25555] text-white font-bold text-xs shadow-lg flex flex-col items-center justify-center gap-0.5 transition"
                >
                    <div className="flex items-center gap-1.5">
                        <XCircle size={16} />
                        <span>
                            {t('teacherAttendance.outsideRadiusBtn', {
                                distance: formatDistanceLabel(distanceMeters),
                            })}
                        </span>
                    </div>
                    <span className="text-[10px] font-normal text-red-100">
                        {t('teacherAttendance.outsideRadiusHint')}
                    </span>
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onFingerprintAction}
                    disabled={isSubmittingAttendance}
                    className={`w-full py-3 px-4 rounded-2xl font-bold text-white shadow-lg flex flex-col items-center justify-center transition ${isCheckOutPhase
                            ? 'bg-linear-to-r from-rose-600 to-red-700 hover:opacity-95'
                            : 'bg-linear-to-r from-emerald-500 to-teal-600 hover:opacity-95'
                        }`}
                >
                    <span className="text-sm flex items-center gap-1.5">
                        <Fingerprint size={17} />
                        {isSubmittingAttendance
                            ? t('teacherAttendance.savingAttendance')
                            : isCheckOutPhase
                                ? t('teacherAttendance.mapHeaderCheckOut')
                                : t('teacherAttendance.mapHeaderCheckIn')}
                    </span>
                    <span className="text-[11px] font-medium text-white/90 mt-0.5">
                        {isCheckOutPhase
                            ? isSelfieRequiredForCurrentPhase
                                ? t('teacherAttendance.hintCheckOutGpsSelfie')
                                : t('teacherAttendance.hintCheckOutGpsOnly')
                            : isSelfieRequiredForCurrentPhase
                                ? t('teacherAttendance.hintCheckInGpsSelfie')
                                : t('teacherAttendance.hintCheckInGpsOnly')}
                    </span>
                </button>
            )}
        </motion.div>
    );
}