// src/modules/teacher-attendance/components/TeacherAttendanceModals.tsx
import { useEffect, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Lock,
    Unlock,
    X,
    AlertTriangle,
    LogOut,
    Camera,
    RefreshCw,
    Loader2,
    Send,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { MIN_EARLY_CHECKOUT_REASON_LENGTH } from '../constants/teacherAttendance.constants';

interface TeacherAttendanceModalsProps {
    isAdminOrSuperAdmin: boolean;
    isHolidayModalOpen: boolean;
    setIsHolidayModalOpen: (open: boolean) => void;
    isHolidayLocked: boolean;
    holidayReason: string;
    specialEventTitleInput: string;
    setSpecialEventTitleInput: (val: string) => void;
    isTogglingHolidayLock: boolean;
    onEnableSpecialEvent: () => void;
    onDisableSpecialEvent: () => void;

    checkoutConfirmModal: {
        open: boolean;
        isEarly: boolean;
        formattedDiff: string;
        currentTimeLabel: string;
    };
    effectiveWorkEndTime: string;
    earlyCheckoutReason: string;
    setEarlyCheckoutReason: (val: string) => void;
    earlyReasonError: string | null;
    setEarlyReasonError: (err: string | null) => void;
    isEarlyReasonValid: boolean;
    onCloseCheckoutConfirmModal: () => void;
    onConfirmProceedCheckout: () => void;

    cameraModal: {
        open: boolean;
        mode: 'CHECK_IN' | 'CHECK_OUT';
    };
    videoRef: RefObject<HTMLVideoElement | null>;
    capturedBlob: Blob | null;
    capturedPreview: string | null;
    cameraError: string | null;
    isSubmittingAttendance: boolean;
    onCloseCameraModal: () => void;
    onTakeSnapshot: () => void;
    onRetakeSelfie: () => void;
    onSubmitAttendance: (
        mode: 'CHECK_IN' | 'CHECK_OUT',
        blob: Blob | null
    ) => void;
}

export function TeacherAttendanceModals({
    isAdminOrSuperAdmin,
    isHolidayModalOpen,
    setIsHolidayModalOpen,
    isHolidayLocked,
    holidayReason,
    specialEventTitleInput,
    setSpecialEventTitleInput,
    isTogglingHolidayLock,
    onEnableSpecialEvent,
    onDisableSpecialEvent,
    checkoutConfirmModal,
    effectiveWorkEndTime,
    earlyCheckoutReason,
    setEarlyCheckoutReason,
    earlyReasonError,
    setEarlyReasonError,
    isEarlyReasonValid,
    onCloseCheckoutConfirmModal,
    onConfirmProceedCheckout,
    cameraModal,
    videoRef,
    capturedBlob,
    capturedPreview,
    cameraError,
    isSubmittingAttendance,
    onCloseCameraModal,
    onTakeSnapshot,
    onRetakeSelfie,
    onSubmitAttendance,
}: TeacherAttendanceModalsProps) {
    const { t } = useTranslation();

    const isAnyModalOpen =
        (isHolidayModalOpen && isAdminOrSuperAdmin) ||
        checkoutConfirmModal.open ||
        cameraModal.open;

    useEffect(() => {
        if (!isAnyModalOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isTogglingHolidayLock || isSubmittingAttendance) return;

            if (cameraModal.open) {
                onCloseCameraModal();
            } else if (checkoutConfirmModal.open) {
                onCloseCheckoutConfirmModal();
            } else if (isHolidayModalOpen && isAdminOrSuperAdmin) {
                setIsHolidayModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isAnyModalOpen,
        isTogglingHolidayLock,
        isSubmittingAttendance,
        cameraModal.open,
        checkoutConfirmModal.open,
        isHolidayModalOpen,
        isAdminOrSuperAdmin,
        onCloseCameraModal,
        onCloseCheckoutConfirmModal,
        setIsHolidayModalOpen,
    ]);

    return (
        <>
            {/* ====================================================================
          MODAL RINGKAS PENGATURAN HARI LIBUR / KHUSUS GURU (ADMIN / SUPER ADMIN)
      ==================================================================== */}
            <AnimatePresence>
                {isHolidayModalOpen && isAdminOrSuperAdmin && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
                        onClick={() =>
                            !isTogglingHolidayLock && setIsHolidayModalOpen(false)
                        }
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            className="data-card max-w-sm w-full p-5 space-y-4 border border-border shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div
                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isHolidayLocked
                                                ? 'bg-rose-500/15 text-rose-500'
                                                : 'bg-emerald-500/15 text-emerald-500'
                                            }`}
                                    >
                                        {isHolidayLocked ? (
                                            <Lock size={20} />
                                        ) : (
                                            <Unlock size={20} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm leading-snug">
                                            {isHolidayLocked
                                                ? t('teacherAttendance.badgeHoliday')
                                                : t('teacherAttendance.modalSpecialEventActiveTitle')}
                                        </h3>
                                        <p className="text-[11px] opacity-70">{holidayReason}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={isTogglingHolidayLock}
                                    onClick={() => setIsHolidayModalOpen(false)}
                                    className="p-1 rounded-lg hover:bg-muted shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {isHolidayLocked ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-semibold mb-1">
                                            {t('teacherAttendance.labelSpecialEventTitle')}
                                        </label>
                                        <input
                                            type="text"
                                            value={specialEventTitleInput}
                                            onChange={(e) =>
                                                setSpecialEventTitleInput(e.target.value)
                                            }
                                            placeholder={t(
                                                'teacherAttendance.placeholderSpecialEventTitle'
                                            )}
                                            className="form-input text-xs py-2 w-full"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isTogglingHolidayLock}
                                        onClick={onEnableSpecialEvent}
                                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                                    >
                                        <Unlock size={14} />
                                        <span>
                                            {isTogglingHolidayLock
                                                ? t('teacherAttendance.btnUnlocking')
                                                : t('teacherAttendance.btnUnlockSpecialEvent')}
                                        </span>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-xs opacity-75">
                                        {t('teacherAttendance.descSpecialEventOpen')}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={isTogglingHolidayLock}
                                        onClick={onDisableSpecialEvent}
                                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                                    >
                                        <Lock size={14} />
                                        <span>
                                            {isTogglingHolidayLock
                                                ? t('teacherAttendance.btnLocking')
                                                : t('teacherAttendance.btnRelockHoliday')}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ====================================================================
          MODAL PERINGATAN PULANG LEBIH AWAL (ALASAN WAJIB DIISI)
      ==================================================================== */}
            <AnimatePresence>
                {checkoutConfirmModal.open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
                        onClick={onCloseCheckoutConfirmModal}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            className="data-card max-w-sm w-full p-5 space-y-4 border border-border shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-500">
                                        <AlertTriangle size={22} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm leading-snug">
                                            {t('teacherAttendance.modalEarlyTitle')}
                                        </h3>
                                        <p className="text-[11px] opacity-70">
                                            {t('teacherAttendance.modalEarlySubtitle')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onCloseCheckoutConfirmModal}
                                    className="p-1 rounded-lg hover:bg-muted shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-3.5 rounded-2xl border text-xs space-y-2 bg-amber-500/10 border-amber-500/35">
                                <div className="flex items-center justify-between">
                                    <span className="opacity-75">
                                        {t('teacherAttendance.modalEarlyCurrentTime')}
                                    </span>
                                    <span className="font-mono font-extrabold text-sm">
                                        {checkoutConfirmModal.currentTimeLabel}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="opacity-75">
                                        {t('teacherAttendance.modalEarlySchoolEnd')}
                                    </span>
                                    <span className="font-mono font-bold">
                                        {effectiveWorkEndTime}
                                    </span>
                                </div>
                                <div className="pt-2 border-t border-amber-500/25 flex items-center justify-between text-amber-600 dark:text-amber-300 font-bold">
                                    <span>{t('teacherAttendance.modalEarlyDiffLabel')}</span>
                                    <span>
                                        {t('teacherAttendance.modalEarlyDiffValue', {
                                            duration: checkoutConfirmModal.formattedDiff,
                                        })}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                    <label className="font-bold">
                                        {t('teacherAttendance.modalEarlyReasonLabel')}{' '}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <span
                                        className={
                                            isEarlyReasonValid
                                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                                : 'text-amber-600 dark:text-amber-400'
                                        }
                                    >
                                        {t('teacherAttendance.charCounter', {
                                            current: earlyCheckoutReason.trim().length,
                                            min: MIN_EARLY_CHECKOUT_REASON_LENGTH,
                                        })}
                                    </span>
                                </div>
                                <textarea
                                    rows={2}
                                    required
                                    value={earlyCheckoutReason}
                                    onChange={(e) => {
                                        setEarlyCheckoutReason(e.target.value);
                                        if (earlyReasonError) setEarlyReasonError(null);
                                    }}
                                    placeholder={t(
                                        'teacherAttendance.modalEarlyReasonPlaceholder'
                                    )}
                                    className="form-input w-full text-xs py-2"
                                />
                                {earlyReasonError && (
                                    <p className="text-[11px] text-red-500 font-medium">
                                        {earlyReasonError}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 pt-1">
                                <button
                                    type="button"
                                    onClick={onCloseCheckoutConfirmModal}
                                    className="btn-secondary justify-center py-2.5 text-xs font-bold rounded-xl"
                                >
                                    {t('teacherAttendance.btnCancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirmProceedCheckout}
                                    disabled={!isEarlyReasonValid}
                                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md transition bg-amber-600 hover:bg-amber-700 disabled:opacity-45 disabled:cursor-not-allowed"
                                >
                                    <LogOut size={14} />
                                    {t('teacherAttendance.btnProceedCheckOut')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ====================================================================
          MODAL KAMERA SELFIE (CHECK-IN & CHECK-OUT)
      ==================================================================== */}
            <AnimatePresence>
                {cameraModal.open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    >
                        <div className="data-card max-w-sm w-full p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-sm">
                                        {cameraModal.mode === 'CHECK_OUT'
                                            ? t('teacherAttendance.modalSelfieOutTitle')
                                            : t('teacherAttendance.modalSelfieInTitle')}
                                    </h3>
                                    <p className="text-[11px] opacity-70">
                                        {cameraModal.mode === 'CHECK_OUT'
                                            ? t('teacherAttendance.cardCheckOutSub')
                                            : t('teacherAttendance.cardCheckInSub')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onCloseCameraModal}
                                    disabled={isSubmittingAttendance}
                                    className="p-1 rounded-lg hover:bg-muted disabled:opacity-40"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="rounded-2xl overflow-hidden bg-black aspect-square max-h-[52dvh] mx-auto w-full relative">
                                {capturedPreview ? (
                                    <img
                                        src={capturedPreview}
                                        alt={t('teacherAttendance.altSelfieResult')}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-cover scale-x-[-1]"
                                    />
                                )}
                            </div>

                            {cameraError && (
                                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-300 text-[11px] flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>{cameraError}</span>
                                </div>
                            )}

                            {!capturedPreview ? (
                                <button
                                    type="button"
                                    onClick={onTakeSnapshot}
                                    className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2.5 shadow-lg transition-all duration-200 active:scale-[0.98] ${cameraModal.mode === 'CHECK_OUT'
                                            ? 'bg-linear-to-r from-rose-500 via-red-600 to-rose-700 hover:from-rose-600 hover:to-red-800 shadow-red-600/25 ring-2 ring-red-400/40'
                                            : 'bg-linear-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-600/25 ring-2 ring-emerald-400/40'
                                        }`}
                                >
                                    <Camera size={18} className="shrink-0" />
                                    <span>{t('teacherAttendance.btnTakeSelfie')}</span>
                                </button>
                            ) : (
                                <div className="grid grid-cols-12 gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={onRetakeSelfie}
                                        disabled={isSubmittingAttendance}
                                        className="col-span-5 py-3 px-3 rounded-2xl font-bold text-xs border border-slate-300 dark:border-white/15 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw size={15} className="shrink-0" />
                                        <span>{t('teacherAttendance.btnRetake')}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            onSubmitAttendance(cameraModal.mode, capturedBlob)
                                        }
                                        disabled={isSubmittingAttendance}
                                        className={`col-span-7 py-3 px-4 rounded-2xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${cameraModal.mode === 'CHECK_OUT'
                                                ? 'bg-linear-to-r from-rose-500 via-red-600 to-rose-700 hover:from-rose-600 hover:to-red-800 shadow-red-600/25 ring-2 ring-red-400/40'
                                                : 'bg-linear-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-600/25 ring-2 ring-emerald-400/40'
                                            }`}
                                    >
                                        {isSubmittingAttendance ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin shrink-0" />
                                                <span>{t('teacherAttendance.btnSaving')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send size={15} className="shrink-0" />
                                                <span>{t('teacherAttendance.btnSubmitAttendance')}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}