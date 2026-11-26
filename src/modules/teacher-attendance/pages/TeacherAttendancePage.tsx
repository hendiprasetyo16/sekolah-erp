// src/modules/teacher-attendance/pages/TeacherAttendancePage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import 'leaflet/dist/leaflet.css';
import {
    Lock,
    CheckCircle2,
    AlertTriangle,
    X,
    FlaskConical,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Settings2,
    Smartphone,
    ArrowLeft,
    LayoutDashboard,
} from 'lucide-react';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import {
    FINGERPRINT_GLOW_DURATION_MS,
    HIDE_HEADER_SCROLL_THRESHOLD,
    TEACHER_DASHBOARD_ROUTE,
    TOP_REVEAL_SWIPE_THRESHOLD,
} from '../constants/teacherAttendance.constants';
import type { SubView } from '../types/teacherAttendance.types';
import { useTeacherAttendanceData } from '../hooks/useTeacherAttendanceData';
import { useTeacherGpsAndCamera } from '../hooks/useTeacherGpsAndCamera';
import { TeacherBerandaTab } from '../components/TeacherBerandaTab';
import { TeacherMapTab } from '../components/TeacherMapTab';
import { TeacherLeaveTab } from '../components/TeacherLeaveTab';
import { TeacherReportTab } from '../components/TeacherReportTab';
import { TeacherLogTab } from '../components/TeacherLogTab';
import {
    TeacherBottomNav,
    TeacherAttendanceModals,
} from '../components/TeacherAttendanceChrome';

const TOAST_AUTO_DISMISS_MS = 5000;

const ATTENDANCE_PAGE_INLINE_STYLES = `
  body.attendance-hide-header header {
    max-height: 0px !important;
    min-height: 0px !important;
    height: 0px !important;
    padding-top: 0px !important;
    padding-bottom: 0px !important;
    margin: 0px !important;
    border-width: 0px !important;
    opacity: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    transform: translateY(-100%);
    transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  body:not(.attendance-hide-header) header {
    transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes attendance-marquee {
    0%, 15% {
      transform: translateX(0%);
    }
    100% {
      transform: translateX(-50%);
    }
  }
  .animate-attendance-marquee {
    animation: attendance-marquee linear infinite;
  }
`;

export function TeacherAttendancePage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const {
        sidebarCollapsed,
        setSidebarCollapsed,
        setSidebarOpen,
    } = useUIStore();

    const [activeView, setActiveView] = useState<SubView>('beranda');

    // State Sembunyikan / Tampilkan Header Utama Aplikasi
    const [isTopHeaderVisible, setIsTopHeaderVisible] = useState<boolean>(false);
    const touchStartYRef = useRef<number | null>(null);

    // State Efek Menyala Tombol Sidik Jari
    const [isFingerprintGlowing, setIsFingerprintGlowing] =
        useState<boolean>(false);
    const glowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Notifikasi Melayang dengan Timer Terkelola
    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dismissToast = useCallback(() => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = null;
        }
        setToast(null);
    }, []);

    const showToast = useCallback(
        (type: 'success' | 'error', message: string) => {
            setToast({ type, message });
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(() => {
                setToast(null);
                toastTimeoutRef.current = null;
            }, TOAST_AUTO_DISMISS_MS);
        },
        []
    );

    const triggerFingerprintGlow = useCallback(() => {
        setIsFingerprintGlowing(true);
        if (glowTimeoutRef.current) {
            clearTimeout(glowTimeoutRef.current);
        }
        glowTimeoutRef.current = setTimeout(() => {
            setIsFingerprintGlowing(false);
            glowTimeoutRef.current = null;
        }, FINGERPRINT_GLOW_DURATION_MS);
    }, []);

    useEffect(() => {
        return () => {
            if (glowTimeoutRef.current) {
                clearTimeout(glowTimeoutRef.current);
            }
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (window.innerWidth < 1024) {
            setSidebarOpen(false);
        }
    }, [setSidebarOpen]);

    const handleToggleSidebar = useCallback(() => {
        const {
            sidebarOpen: currentOpen,
            sidebarCollapsed: currentCollapsed,
        } = useUIStore.getState();

        if (window.innerWidth < 1024) {
            setSidebarOpen(!currentOpen);
        } else {
            setSidebarCollapsed(!currentCollapsed);
        }
    }, [setSidebarOpen, setSidebarCollapsed]);

    // Data Guru, Sekolah, Hari Libur, Quotes, Laporan, & Cuti/Izin
    const attendanceData = useTeacherAttendanceData({
        setActiveView,
        showToast,
    });

    // Pelacakan GPS, Peta Leaflet, Kamera Selfie, & Submit RPC
    const gpsAndCamera = useTeacherGpsAndCamera({
        activeView,
        setActiveView,
        activeSchoolId: attendanceData.activeSchoolId,
        teacher: attendanceData.teacher,
        schoolGeo: attendanceData.schoolGeo,
        todayRecord: attendanceData.todayRecord,
        schoolTimezone: attendanceData.schoolTimezone,
        todayJavaneseFullDate: attendanceData.todayJavaneseInfo.fullFormattedDate,
        isSuperAdmin: attendanceData.isSuperAdmin,
        isDesktopBlockedForTeacher: attendanceData.isDesktopBlockedForTeacher,
        isHolidayLocked: attendanceData.isHolidayLocked,
        holidayReason: attendanceData.holidayReason,
        attendancePhase: attendanceData.attendancePhase,
        effectiveWorkStartTime: attendanceData.effectiveWorkStartTime,
        effectiveToleranceMinutes: attendanceData.effectiveToleranceMinutes,
        effectiveWorkEndTime: attendanceData.effectiveWorkEndTime,
        effectiveSelfieCheckIn: attendanceData.effectiveSelfieCheckIn,
        effectiveSelfieCheckOut: attendanceData.effectiveSelfieCheckOut,
        dateLocale: attendanceData.dateLocale,
        isFingerprintGlowing,
        triggerFingerprintGlow,
        showToast,
        formatShortTime: attendanceData.formatShortTime,
        formatDistanceLabel: attendanceData.formatDistanceLabel,
        formatDurationMinutes: attendanceData.formatDurationMinutes,
        formatStatusLabel: attendanceData.formatStatusLabel,
        loadTeacherAndAttendance: attendanceData.loadTeacherAndAttendance,
    });

    const {
        loadTeacherAndAttendance,
        setQuoteOffset,
        handleSubmitStrictLeave,
        handleEnableSpecialEvent,
        handleDisableSpecialEvent,
    } = attendanceData;

    const {
        requestGpsPosition,
        handleTakeSnapshot,
        submitGpsAttendance,
    } = gpsAndCamera;

    // Callback Stabil untuk Komponen Anak
    const handleRefreshData = useCallback(() => {
        void loadTeacherAndAttendance();
    }, [loadTeacherAndAttendance]);

    const handleRefreshGps = useCallback(() => {
        void requestGpsPosition();
    }, [requestGpsPosition]);

    const handleNextQuote = useCallback(() => {
        setQuoteOffset((prev) => prev + 1);
    }, [setQuoteOffset]);

    const handleNavigateManageQuotes = useCallback(() => {
        navigate('/attendance/quotes');
    }, [navigate]);

    const handleNavigateMasterAttendance = useCallback(() => {
        navigate('/academic/master-data', {
            state: { tab: 'presensi' },
        });
    }, [navigate]);

    const handleNavigateDashboard = useCallback(() => {
        navigate(TEACHER_DASHBOARD_ROUTE);
    }, [navigate]);

    const handleSubmitLeaveForm = useCallback(
        (...args: Parameters<typeof handleSubmitStrictLeave>) => {
            void handleSubmitStrictLeave(...args);
        },
        [handleSubmitStrictLeave]
    );

    const handleConfirmEnableSpecialEvent = useCallback(() => {
        void handleEnableSpecialEvent();
    }, [handleEnableSpecialEvent]);

    const handleConfirmDisableSpecialEvent = useCallback(() => {
        void handleDisableSpecialEvent();
    }, [handleDisableSpecialEvent]);

    const handleTakeSelfieSnapshot = useCallback(() => {
        void handleTakeSnapshot();
    }, [handleTakeSnapshot]);

    const handleSubmitGpsAttendance = useCallback(
        (...args: Parameters<typeof submitGpsAttendance>) => {
            void submitGpsAttendance(...args);
        },
        [submitGpsAttendance]
    );

    // Logika Sembunyikan / Munculkan Header Atas Aplikasi
    useEffect(() => {
        if (!isTopHeaderVisible) {
            document.body.classList.add('attendance-hide-header');
        } else {
            document.body.classList.remove('attendance-hide-header');
        }

        return () => {
            document.body.classList.remove('attendance-hide-header');
        };
    }, [isTopHeaderVisible]);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (window.scrollY <= 2 && e.deltaY < -15) {
                setIsTopHeaderVisible(true);
            } else if (e.deltaY > 15 && window.scrollY > HIDE_HEADER_SCROLL_THRESHOLD) {
                setIsTopHeaderVisible(false);
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (window.scrollY <= 2 && e.touches.length === 1) {
                touchStartYRef.current = e.touches[0].clientY;
            } else {
                touchStartYRef.current = null;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (touchStartYRef.current === null || e.touches.length !== 1) return;
            const currentY = e.touches[0].clientY;
            const deltaY = currentY - touchStartYRef.current;

            if (window.scrollY <= 2 && deltaY > TOP_REVEAL_SWIPE_THRESHOLD) {
                setIsTopHeaderVisible(true);
                touchStartYRef.current = null;
            }
        };

        const handleTouchEnd = () => {
            touchStartYRef.current = null;
        };

        const handleScroll = () => {
            if (window.scrollY > HIDE_HEADER_SCROLL_THRESHOLD) {
                setIsTopHeaderVisible(false);
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // Layar Terkunci Jika Dibuka dari Komputer Tanpa Izin Admin
    if (!attendanceData.isLoadingData && attendanceData.isDesktopBlockedForTeacher) {
        return (
            <div className="min-h-[75vh] flex items-center justify-center p-4">
                <div className="max-w-md w-full rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-7 text-center space-y-5 border border-slate-200/80 dark:border-white/10 shadow-2xl">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-linear-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/30 text-amber-500 flex items-center justify-center shadow-inner">
                        <Lock size={28} />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-lg font-extrabold tracking-tight">
                            {t('teacherAttendance.desktopBlockedTitle')}
                        </h2>
                        <p className="text-xs opacity-75 leading-relaxed">
                            {t('teacherAttendance.desktopBlockedDescPrefix')}
                            <strong>{attendanceData.teacher?.fullName}</strong>
                            {t('teacherAttendance.desktopBlockedDescMid')}
                            <strong>{t('teacherAttendance.desktopBlockedDescDevice')}</strong>
                            {t('teacherAttendance.desktopBlockedDescSuffix')}
                        </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[11px] opacity-85 flex items-center justify-center gap-2.5">
                        <Smartphone size={16} className="text-emerald-500 shrink-0" />
                        <span className="text-left">
                            {t('teacherAttendance.desktopBlockedHint')}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleNavigateDashboard}
                        className="group relative w-full overflow-hidden rounded-2xl bg-linear-to-r from-[#1C3D6E] via-[#26508E] to-[#1E447A] hover:from-[#163159] hover:to-[#1C3D6E] text-white font-semibold text-xs sm:text-sm py-3.5 px-5 shadow-lg shadow-[#1C3D6E]/25 hover:shadow-xl hover:shadow-[#1C3D6E]/35 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2.5 border border-white/15 cursor-pointer"
                    >
                        <span className="p-1.5 rounded-xl bg-white/15 group-hover:-translate-x-0.5 transition-transform duration-200">
                            <LayoutDashboard size={15} />
                        </span>
                        <span>{t('teacherAttendance.btnBackToDashboard')}</span>
                        <ArrowLeft
                            size={15}
                            className="opacity-75 group-hover:-translate-x-1 transition-transform duration-200"
                        />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`min-h-[calc(100vh-1rem)] pb-28 max-w-xl md:max-w-2xl mx-auto px-1 transition-all duration-300 ${!isTopHeaderVisible ? '-mt-2 sm:-mt-3' : 'mt-0'
                }`}
        >
            <style>{ATTENDANCE_PAGE_INLINE_STYLES}</style>

            {/* Notifikasi Melayang */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -24 }}
                        className="fixed top-4 inset-x-0 z-60 px-4 pointer-events-none"
                    >
                        <div
                            className={`max-w-lg mx-auto pointer-events-auto p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2.5 shadow-2xl ${toast.type === 'success'
                                ? 'bg-emerald-600 text-white border-emerald-400'
                                : 'bg-red-600 text-white border-red-400'
                                }`}
                        >
                            <div className="flex items-center gap-2.5">
                                {toast.type === 'success' ? (
                                    <CheckCircle2 size={18} className="shrink-0" />
                                ) : (
                                    <AlertTriangle size={18} className="shrink-0" />
                                )}
                                <span>{toast.message}</span>
                            </div>
                            <button
                                type="button"
                                onClick={dismissToast}
                                className="p-1 rounded-lg hover:bg-white/20 shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pegangan Kecil (Pull Handle) di Bagian Paling Atas */}
            <div className="flex justify-center mb-1.5">
                <button
                    type="button"
                    onClick={() => setIsTopHeaderVisible((prev) => !prev)}
                    className="group inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-200/75 dark:bg-white/10 hover:bg-slate-300/90 dark:hover:bg-white/20 text-[10px] font-medium text-slate-600 dark:text-slate-300 transition shadow-2xs"
                    title={
                        isTopHeaderVisible
                            ? t('teacherAttendance.titleHideTopHeader')
                            : t('teacherAttendance.titleShowTopHeader')
                    }
                >
                    <span className="w-5 h-1 rounded-full bg-slate-400/80 dark:bg-slate-400/60 group-hover:bg-amber-500 transition" />
                    {isTopHeaderVisible ? (
                        <>
                            <ChevronUp size={11} />
                            <span>{t('teacherAttendance.btnHideHeader')}</span>
                        </>
                    ) : (
                        <>
                            <ChevronDown size={11} />
                            <span>{t('teacherAttendance.btnTopMenu')}</span>
                        </>
                    )}
                </button>
            </div>

            {/* Banner Simulasi Khusus SUPER_ADMIN */}
            {attendanceData.isSuperAdmin && (
                <div className="mb-3 p-3 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-300">
                            <FlaskConical size={16} />
                            <span>{t('teacherAttendance.simSuperAdminLabel')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={handleNavigateMasterAttendance}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                            >
                                <Settings2 size={12} />
                                {t('teacherAttendance.btnHoursAndHolidays')}
                            </button>
                            <button
                                type="button"
                                onClick={handleNavigateManageQuotes}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
                            >
                                <Sparkles size={12} />
                                {t('teacherAttendance.btnQuotes')}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full">
                        <select
                            className="form-input text-xs py-1.5 flex-1 min-w-40"
                            value={attendanceData.simSchoolId}
                            onChange={(e) => attendanceData.setSimSchoolId(e.target.value)}
                        >
                            {attendanceData.simSchools.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="form-input text-xs py-1.5 flex-1 min-w-44"
                            value={attendanceData.simTeacherId}
                            onChange={(e) => attendanceData.setSimTeacherId(e.target.value)}
                        >
                            {attendanceData.simTeachers.length === 0 ? (
                                <option value="">{t('teacherAttendance.simNoTeachers')}</option>
                            ) : (
                                attendanceData.simTeachers.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.fullName}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </div>
            )}

            {/* TAMPILAN 1: BERANDA */}
            {activeView === 'beranda' && (
                <TeacherBerandaTab
                    teacher={attendanceData.teacher}
                    fallbackUserName={user?.fullName}
                    resolvedTeacherPhotoUrl={attendanceData.resolvedTeacherPhotoUrl}
                    teacherIdentityLabel={attendanceData.teacherIdentityLabel}
                    isTeacherAccountLinked={attendanceData.isTeacherAccountLinked}
                    accountStatusHint={attendanceData.accountStatusHint}
                    schoolGeo={attendanceData.schoolGeo}
                    schoolTimezone={attendanceData.schoolTimezone}
                    todayRecord={attendanceData.todayRecord}
                    isLoadingData={attendanceData.isLoadingData}
                    onRefreshData={handleRefreshData}
                    onToggleSidebar={handleToggleSidebar}
                    onNavigateView={setActiveView}
                    formattedDateWithPasaran={attendanceData.formattedDateWithPasaran}
                    javaneseDateBadge={attendanceData.javaneseDateBadge}
                    monthYearLabel={attendanceData.monthYearLabel}
                    reportStats={attendanceData.reportStats}
                    isHolidayLoading={attendanceData.isHolidayLoading}
                    isHoliday={attendanceData.isHoliday}
                    isHolidayLocked={attendanceData.isHolidayLocked}
                    holidayReason={attendanceData.holidayReason}
                    isAdminOrSuperAdmin={attendanceData.isAdminOrSuperAdmin}
                    onOpenHolidayModal={attendanceData.handleOpenHolidayModal}
                    showToast={showToast}
                    isCheckInLocked={attendanceData.isCheckInLocked}
                    canCheckOut={attendanceData.canCheckOut}
                    hasCheckedIn={attendanceData.hasCheckedIn}
                    hasCheckedOut={attendanceData.hasCheckedOut}
                    isOnLeaveToday={attendanceData.isOnLeaveToday}
                    effectiveWorkStartTime={attendanceData.effectiveWorkStartTime}
                    effectiveToleranceMinutes={attendanceData.effectiveToleranceMinutes}
                    effectiveWorkEndTime={attendanceData.effectiveWorkEndTime}
                    effectiveDeadlineStr={attendanceData.effectiveDeadlineStr}
                    currentLateMinutes={attendanceData.currentLateMinutes}
                    todayCheckOutTimingInfo={attendanceData.todayCheckOutTimingInfo}
                    formatShortTime={attendanceData.formatShortTime}
                    formatDurationMinutes={attendanceData.formatDurationMinutes}
                    formatStatusLabel={attendanceData.formatStatusLabel}
                />
            )}

            {/* TAMPILAN 2: PRESENSI PETA GPS */}
            {activeView === 'peta' && (
                <TeacherMapTab
                    teacher={attendanceData.teacher}
                    schoolGeo={attendanceData.schoolGeo}
                    schoolTimezone={attendanceData.schoolTimezone}
                    todayRecord={attendanceData.todayRecord}
                    attendancePhase={attendanceData.attendancePhase}
                    formattedDateWithPasaran={attendanceData.formattedDateWithPasaran}
                    onToggleSidebar={handleToggleSidebar}
                    userCoords={gpsAndCamera.userCoords}
                    gpsError={gpsAndCamera.gpsError}
                    isLocating={gpsAndCamera.isLocating}
                    distanceMeters={gpsAndCamera.distanceMeters}
                    isWithinRadius={gpsAndCamera.isWithinRadius}
                    onRefreshGps={handleRefreshGps}
                    mapContainerRef={gpsAndCamera.mapContainerRef}
                    isCheckOutPhase={gpsAndCamera.isCheckOutPhase}
                    isSelfieRequiredForCurrentPhase={
                        gpsAndCamera.isSelfieRequiredForCurrentPhase
                    }
                    effectiveWorkEndTime={attendanceData.effectiveWorkEndTime}
                    effectiveDeadlineStr={attendanceData.effectiveDeadlineStr}
                    currentLateMinutes={attendanceData.currentLateMinutes}
                    activeQuotes={attendanceData.activeQuotes}
                    activeQuoteItem={attendanceData.activeQuoteItem}
                    onNextQuote={handleNextQuote}
                    isAdminOrSuperAdmin={attendanceData.isAdminOrSuperAdmin}
                    onNavigateManageQuotes={handleNavigateManageQuotes}
                    isHolidayLocked={attendanceData.isHolidayLocked}
                    holidayReason={attendanceData.holidayReason}
                    isSubmittingAttendance={gpsAndCamera.isSubmittingAttendance}
                    todayCheckOutTimingInfo={attendanceData.todayCheckOutTimingInfo}
                    onFingerprintAction={gpsAndCamera.handleFingerprintAction}
                    formatShortTime={attendanceData.formatShortTime}
                    formatDistanceLabel={attendanceData.formatDistanceLabel}
                    formatStatusLabel={attendanceData.formatStatusLabel}
                />
            )}

            {/* TAMPILAN 3: FORMULIR KETAT IZIN / DINAS LUAR / SAKIT */}
            {activeView === 'izin' && (
                <TeacherLeaveTab
                    teacher={attendanceData.teacher}
                    onToggleSidebar={handleToggleSidebar}
                    isLeaveFormLocked={attendanceData.isLeaveFormLocked}
                    holidayReason={attendanceData.holidayReason}
                    leaveCategory={attendanceData.leaveCategory}
                    setLeaveCategory={attendanceData.setLeaveCategory}
                    leaveStartDate={attendanceData.leaveStartDate}
                    setLeaveStartDate={attendanceData.setLeaveStartDate}
                    leaveEndDate={attendanceData.leaveEndDate}
                    setLeaveEndDate={attendanceData.setLeaveEndDate}
                    leaveRefNumber={attendanceData.leaveRefNumber}
                    setLeaveRefNumber={attendanceData.setLeaveRefNumber}
                    leaveReason={attendanceData.leaveReason}
                    setLeaveReason={attendanceData.setLeaveReason}
                    leaveFile={attendanceData.leaveFile}
                    setLeaveFile={attendanceData.setLeaveFile}
                    isSubmittingLeave={attendanceData.isSubmittingLeave}
                    isLeaveFormReady={attendanceData.isLeaveFormReady}
                    onSubmit={handleSubmitLeaveForm}
                    showToast={showToast}
                />
            )}

            {/* TAMPILAN 4: LAPORAN & KALENDER TANGGAL MERAH + PASARAN JAWA */}
            {activeView === 'laporan' && (
                <TeacherReportTab
                    onToggleSidebar={handleToggleSidebar}
                    reportScope={attendanceData.reportScope}
                    setReportScope={attendanceData.setReportScope}
                    selectedMonthLabel={attendanceData.selectedMonthLabel}
                    selectedJavaneseMonthRange={attendanceData.selectedJavaneseMonthRange}
                    calendarYear={attendanceData.calendarYear}
                    setCalendarYear={attendanceData.setCalendarYear}
                    calendarMonth={attendanceData.calendarMonth}
                    setCalendarMonth={attendanceData.setCalendarMonth}
                    selectedCalendarDate={attendanceData.selectedCalendarDate}
                    setSelectedCalendarDate={attendanceData.setSelectedCalendarDate}
                    todayStr={attendanceData.todayStr}
                    schoolTimezone={attendanceData.schoolTimezone}
                    effectiveWorkDaysMode={attendanceData.effectiveWorkDaysMode}
                    shortDayNames={attendanceData.shortDayNames}
                    calendarDaysGrid={attendanceData.calendarDaysGrid}
                    selectedDateInfo={attendanceData.selectedDateInfo}
                    onPrevMonth={attendanceData.handlePrevMonth}
                    onNextMonth={attendanceData.handleNextMonth}
                    reportStats={attendanceData.reportStats}
                    formatShortTime={attendanceData.formatShortTime}
                    formatStatusLabel={attendanceData.formatStatusLabel}
                />
            )}

            {/* TAMPILAN 5: DATA LOG PRESENSI HARIAN */}
            {activeView === 'log' && (
                <TeacherLogTab
                    historyRecords={attendanceData.historyRecords}
                    currentLang={attendanceData.currentLang}
                    effectiveWorkStartTime={attendanceData.effectiveWorkStartTime}
                    effectiveToleranceMinutes={attendanceData.effectiveToleranceMinutes}
                    schoolTimezone={attendanceData.schoolTimezone}
                    onToggleSidebar={handleToggleSidebar}
                    formatShortTime={attendanceData.formatShortTime}
                    formatStatusLabel={attendanceData.formatStatusLabel}
                />
            )}

            {/* FLOATING BOTTOM NAVIGATION BAR */}
            <TeacherBottomNav
                sidebarCollapsed={sidebarCollapsed}
                activeView={activeView}
                onSelectView={setActiveView}
                isFingerprintGlowing={isFingerprintGlowing}
                onTriggerFingerprintGlow={triggerFingerprintGlow}
                onFingerprintAction={gpsAndCamera.handleFingerprintAction}
                fingerprintButtonStyle={gpsAndCamera.fingerprintButtonStyle}
                fingerprintAuraColor={gpsAndCamera.fingerprintAuraColor}
                isOnMapView={gpsAndCamera.isOnMapView}
                isHolidayLocked={attendanceData.isHolidayLocked}
                holidayReason={attendanceData.holidayReason}
                isCheckOutPhase={gpsAndCamera.isCheckOutPhase}
            />

            {/* SELURUH MODAL (LIBUR KHUSUS GURU, PULANG LEBIH AWAL, & KAMERA SELFIE) */}
            <TeacherAttendanceModals
                isAdminOrSuperAdmin={attendanceData.isAdminOrSuperAdmin}
                isHolidayModalOpen={attendanceData.isHolidayModalOpen}
                setIsHolidayModalOpen={attendanceData.setIsHolidayModalOpen}
                isHolidayLocked={attendanceData.isHolidayLocked}
                holidayReason={attendanceData.holidayReason}
                specialEventTitleInput={attendanceData.specialEventTitleInput}
                setSpecialEventTitleInput={attendanceData.setSpecialEventTitleInput}
                isTogglingHolidayLock={attendanceData.isTogglingHolidayLock}
                onEnableSpecialEvent={handleConfirmEnableSpecialEvent}
                onDisableSpecialEvent={handleConfirmDisableSpecialEvent}
                checkoutConfirmModal={gpsAndCamera.checkoutConfirmModal}
                effectiveWorkEndTime={attendanceData.effectiveWorkEndTime}
                earlyCheckoutReason={gpsAndCamera.earlyCheckoutReason}
                setEarlyCheckoutReason={gpsAndCamera.setEarlyCheckoutReason}
                earlyReasonError={gpsAndCamera.earlyReasonError}
                setEarlyReasonError={gpsAndCamera.setEarlyReasonError}
                isEarlyReasonValid={gpsAndCamera.isEarlyReasonValid}
                onCloseCheckoutConfirmModal={gpsAndCamera.closeCheckoutConfirmModal}
                onConfirmProceedCheckout={gpsAndCamera.handleConfirmProceedCheckout}
                cameraModal={gpsAndCamera.cameraModal}
                videoRef={gpsAndCamera.videoRef}
                capturedBlob={gpsAndCamera.capturedBlob}
                capturedPreview={gpsAndCamera.capturedPreview}
                cameraError={gpsAndCamera.cameraError}
                isSubmittingAttendance={gpsAndCamera.isSubmittingAttendance}
                onCloseCameraModal={gpsAndCamera.closeCameraModal}
                onTakeSnapshot={handleTakeSelfieSnapshot}
                onRetakeSelfie={gpsAndCamera.clearCapturedSelfie}
                onSubmitAttendance={handleSubmitGpsAttendance}
            />
        </div>
    );
}