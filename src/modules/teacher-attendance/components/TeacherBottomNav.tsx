// src/modules/teacher-attendance/components/TeacherBottomNav.tsx
import { motion } from 'framer-motion';
import {
    Home,
    FileBarChart2,
    Fingerprint,
    FileCheck2,
    History,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { SubView } from '../types/teacherAttendance.types';

interface TeacherBottomNavProps {
    sidebarCollapsed: boolean;
    activeView: SubView;
    onSelectView: (view: SubView) => void;
    isFingerprintGlowing: boolean;
    onTriggerFingerprintGlow: () => void;
    onFingerprintAction: () => void;
    fingerprintButtonStyle: string;
    fingerprintAuraColor: string;
    isOnMapView: boolean;
    isHolidayLocked: boolean;
    holidayReason: string;
    isCheckOutPhase: boolean;
}

export function TeacherBottomNav({
    sidebarCollapsed,
    activeView,
    onSelectView,
    isFingerprintGlowing,
    onTriggerFingerprintGlow,
    onFingerprintAction,
    fingerprintButtonStyle,
    fingerprintAuraColor,
    isOnMapView,
    isHolidayLocked,
    holidayReason,
    isCheckOutPhase,
}: TeacherBottomNavProps) {
    const { t } = useTranslation();

    return (
        <div
            className={`fixed bottom-4 inset-x-0 z-40 px-4 pointer-events-none transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
                }`}
        >
            <div className="max-w-md mx-auto pointer-events-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 shadow-2xl px-2 py-2 grid grid-cols-5 items-center">
                <button
                    type="button"
                    onClick={() => onSelectView('beranda')}
                    className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'beranda'
                            ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Home size={17} />
                    <span>{t('teacherAttendance.navHome')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectView('laporan')}
                    className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'laporan'
                            ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <FileBarChart2 size={17} />
                    <span>{t('teacherAttendance.navReport')}</span>
                </button>

                <div className="flex flex-col items-center justify-center relative">
                    {isFingerprintGlowing && (
                        <span
                            className={`pointer-events-none absolute -top-7 w-16 h-16 rounded-full animate-ping opacity-75 ${fingerprintAuraColor}`}
                        />
                    )}

                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.88 }}
                        onPointerDown={onTriggerFingerprintGlow}
                        onClick={onFingerprintAction}
                        className={`-mt-7 w-15 h-15 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-900 transition-all duration-200 select-none ${fingerprintButtonStyle}`}
                        title={
                            !isOnMapView
                                ? t('teacherAttendance.titleOpenAttendanceMap')
                                : isHolidayLocked
                                    ? t('teacherAttendance.toastHolidayError', {
                                        reason: holidayReason,
                                    })
                                    : isCheckOutPhase
                                        ? t('teacherAttendance.titleFingerprintCheckOut')
                                        : t('teacherAttendance.titleFingerprintCheckIn')
                        }
                    >
                        <Fingerprint
                            size={28}
                            className={`transition-transform duration-150 ${isFingerprintGlowing
                                    ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]'
                                    : ''
                                }`}
                        />
                    </motion.button>
                </div>

                <button
                    type="button"
                    onClick={() => onSelectView('izin')}
                    className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'izin'
                            ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <FileCheck2 size={17} />
                    <span>{t('teacherAttendance.navLeave')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectView('log')}
                    className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'log'
                            ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <History size={17} />
                    <span>{t('teacherAttendance.navLog')}</span>
                </button>
            </div>
        </div>
    );
}