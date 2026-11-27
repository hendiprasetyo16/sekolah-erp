// src/modules/teacher-attendance/hooks/useTeacherGpsAndCamera.ts
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { supabase } from '@/services/supabase.client';
import { useTranslation } from '@/hooks/useTranslation';
import {
  inspectDeviceEnvironment,
  validateCameraStream,
  acquireVerifiedGpsPosition,
} from '@/modules/attendance/services/antiCheat.service';
import { getSchoolDateString } from '@/modules/attendance/services/gps.utils';
import {
  collectAttendanceTelemetry,
  compressSelfieToJpeg,
  stopMediaStreamTracks,
} from '@/modules/attendance/utils/apkMediaUtils';
import {
  CHECKOUT_TOLERANCE_MINUTES,
  CONFIRM_ALL_CHECKOUT,
  CONFIRM_EARLY_CHECKOUT,
  MIN_EARLY_CHECKOUT_REASON_LENGTH,
} from '../constants/teacherAttendance.constants';
import type {
  AttendanceRecord,
  SchoolGeoAndSchedule,
  SecurityAuditState,
  SubView,
  SubmitGpsRpcResult,
  TeacherProfile,
} from '../types/teacherAttendance.types';
import {
  buildTeacherFolderName,
  calculateDistanceMeters,
  calculateLateMinutes,
  evaluateCheckOutTiming,
  extractErrorMessage,
  getTimeStampTagInTimezone,
  sanitizeStorageSegment,
} from '../utils/teacherAttendance.helpers';

interface UseTeacherGpsAndCameraParams {
  activeView: SubView;
  setActiveView: (view: SubView) => void;
  activeSchoolId: string;
  teacher: TeacherProfile | null;
  schoolGeo: SchoolGeoAndSchedule | null;
  todayRecord: AttendanceRecord | null;
  schoolTimezone: string;
  todayJavaneseFullDate: string;
  isSuperAdmin: boolean;
  isDesktopBlockedForTeacher: boolean;
  isHolidayLocked: boolean;
  holidayReason: string;
  attendancePhase: 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED' | 'ON_LEAVE';
  effectiveWorkStartTime: string;
  effectiveToleranceMinutes: number;
  effectiveWorkEndTime: string;
  effectiveSelfieCheckIn: boolean;
  effectiveSelfieCheckOut: boolean;
  dateLocale: string;
  isFingerprintGlowing: boolean;
  triggerFingerprintGlow: () => void;
  showToast: (type: 'success' | 'error', message: string) => void;
  formatShortTime: (iso?: string | null) => string;
  formatDistanceLabel: (meters: number | null) => string;
  formatDurationMinutes: (totalMinutes: number) => string;
  formatStatusLabel: (status?: string | null) => string;
  loadTeacherAndAttendance: () => Promise<void>;
}

export function useTeacherGpsAndCamera({
  activeView,
  setActiveView,
  activeSchoolId,
  teacher,
  schoolGeo,
  todayRecord,
  schoolTimezone,
  todayJavaneseFullDate,
  isSuperAdmin,
  isDesktopBlockedForTeacher,
  isHolidayLocked,
  holidayReason,
  attendancePhase,
  effectiveWorkStartTime,
  effectiveToleranceMinutes,
  effectiveWorkEndTime,
  effectiveSelfieCheckIn,
  effectiveSelfieCheckOut,
  dateLocale,
  isFingerprintGlowing,
  triggerFingerprintGlow,
  showToast,
  formatShortTime,
  formatDistanceLabel,
  formatDurationMinutes,
  formatStatusLabel,
  loadTeacherAndAttendance,
}: UseTeacherGpsAndCameraParams) {
  const { t } = useTranslation();

  // State Pelacakan Keamanan & Telemetri Perangkat
  const [securityState, setSecurityState] = useState<SecurityAuditState>({
    isSuspectedMock: false,
    flags: [],
    telemetry: {},
  });

  // State GPS & Peta Leaflet
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const gpsRequestIdRef = useRef<number>(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  // State Modal Konfirmasi Pulang Lebih Awal
  const [checkoutConfirmModal, setCheckoutConfirmModal] = useState<{
    open: boolean;
    isEarly: boolean;
    formattedDiff: string;
    currentTimeLabel: string;
  }>({
    open: false,
    isEarly: false,
    formattedDiff: '',
    currentTimeLabel: '',
  });
  const [earlyCheckoutReason, setEarlyCheckoutReason] = useState<string>('');
  const [earlyReasonError, setEarlyReasonError] = useState<string | null>(null);

  // State Kamera Selfie Modal & Penjaga Anti-Duplikat Upload / Sesi
  const [cameraModal, setCameraModal] = useState<{
    open: boolean;
    mode: 'CHECK_IN' | 'CHECK_OUT';
  }>({ open: false, mode: 'CHECK_IN' });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraSessionIdRef = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState<boolean>(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [uploadedSelfiePath, setUploadedSelfiePath] = useState<string | null>(
    null
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSubmittingAttendance, setIsSubmittingAttendance] =
    useState<boolean>(false);

  // Pembersih otomatis kamera & pengikat ulang stream saat klik "Ulangi"
  useEffect(() => {
    if (
      cameraModal.open &&
      !capturedPreview &&
      videoRef.current &&
      streamRef.current
    ) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      void videoRef.current.play().catch(() => null);
    }
  }, [cameraModal.open, capturedPreview]);

  useEffect(() => {
    return () => {
      gpsRequestIdRef.current += 1;
      cameraSessionIdRef.current += 1;
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Pelacakan GPS Live dengan Anti-Emulator & Telemetri Perangkat
  const requestGpsPosition = useCallback(async () => {
    const reqId = ++gpsRequestIdRef.current;
    setIsLocating(true);
    setGpsError(null);

    try {
      const envAudit = inspectDeviceEnvironment(
        isSuperAdmin,
        Boolean(teacher?.allowDesktopAttendance)
      );

      if (!envAudit.allowed) {
        if (reqId === gpsRequestIdRef.current) {
          setIsLocating(false);
          setUserCoords(null);
          setGpsError(
            envAudit.blockReason ?? t('teacherAttendance.errDeviceNotAllowed')
          );
        }
        return;
      }

      const isDev =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      const verifiedGps = await acquireVerifiedGpsPosition(isDev);
      if (reqId !== gpsRequestIdRef.current) return;

      const apkTelemetry = collectAttendanceTelemetry(verifiedGps.accuracy);

      setUserCoords({
        lat: verifiedGps.latitude,
        lng: verifiedGps.longitude,
        accuracy: verifiedGps.accuracy,
      });

      setSecurityState({
        isSuspectedMock:
          envAudit.isSuspectedMock ||
          verifiedGps.isSuspectedMock ||
          apkTelemetry.isSuspectedMock,
        flags: Array.from(
          new Set([
            ...envAudit.flags,
            ...verifiedGps.flags,
            ...apkTelemetry.securityFlags,
          ])
        ),
        telemetry: {
          ...envAudit.telemetry,
          ...apkTelemetry.deviceTelemetry,
          gpsAccuracyMeters: Math.round(verifiedGps.accuracy),
          javaneseDate: todayJavaneseFullDate,
        },
      });
    } catch (err: unknown) {
      if (reqId === gpsRequestIdRef.current) {
        setUserCoords(null);
        setGpsError(
          extractErrorMessage(err, t('teacherAttendance.errGpsVerifyFailed'))
        );
      }
    } finally {
      if (reqId === gpsRequestIdRef.current) {
        setIsLocating(false);
      }
    }
  }, [
    isSuperAdmin,
    teacher?.allowDesktopAttendance,
    todayJavaneseFullDate,
    t,
  ]);

  useEffect(() => {
    if (activeView === 'peta' && !isDesktopBlockedForTeacher) {
      void requestGpsPosition();
    }
  }, [activeView, isDesktopBlockedForTeacher, requestGpsPosition]);

  // Inisialisasi Peta Leaflet
  useEffect(() => {
    if (activeView !== 'peta' || !mapContainerRef.current || !schoolGeo) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      userMarkerRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([schoolGeo.latitude, schoolGeo.longitude], 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.circle([schoolGeo.latitude, schoolGeo.longitude], {
      radius: schoolGeo.radius,
      color: '#10B981',
      fillColor: '#10B981',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);

    L.circleMarker([schoolGeo.latitude, schoolGeo.longitude], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#0F172A',
      fillOpacity: 1,
    })
      .bindPopup(`<b>${schoolGeo.name}</b><br/>Radius: ${schoolGeo.radius}m`)
      .addTo(map);

    mapInstanceRef.current = map;
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      window.clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      userMarkerRef.current = null;
    };
  }, [activeView, schoolGeo]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userCoords || !schoolGeo) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    const marker = L.circleMarker([userCoords.lat, userCoords.lng], {
      radius: 9,
      color: '#FFFFFF',
      weight: 3,
      fillColor: '#EF4444',
      fillOpacity: 1,
    })
      .bindPopup(t('teacherAttendance.popupUserPosition'))
      .addTo(map);

    userMarkerRef.current = marker;

    const bounds = L.latLngBounds([
      [schoolGeo.latitude, schoolGeo.longitude],
      [userCoords.lat, userCoords.lng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }, [userCoords, schoolGeo, t]);

  const distanceMeters = useMemo(() => {
    if (!userCoords || !schoolGeo) return null;
    return calculateDistanceMeters(
      userCoords.lat,
      userCoords.lng,
      schoolGeo.latitude,
      schoolGeo.longitude
    );
  }, [userCoords, schoolGeo]);

  const isWithinRadius = useMemo(() => {
    if (distanceMeters === null || !schoolGeo) return false;
    return distanceMeters <= schoolGeo.radius;
  }, [distanceMeters, schoolGeo]);

  const clearCapturedSelfie = useCallback(() => {
    setCapturedPreview((prevUrl) => {
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      return null;
    });
    setCapturedBlob(null);
    setUploadedSelfiePath(null);
    setCameraError(null);
  }, []);

  const closeCameraModal = useCallback(() => {
    cameraSessionIdRef.current += 1;
    stopMediaStreamTracks(streamRef.current);
    streamRef.current = null;
    clearCapturedSelfie();
    isCapturingRef.current = false;
    setIsCapturingSnapshot(false);
    setCameraModal((prev) => ({ ...prev, open: false }));
  }, [clearCapturedSelfie]);

  const closeCheckoutConfirmModal = useCallback(() => {
    setCheckoutConfirmModal((prev) => ({ ...prev, open: false }));
    setEarlyCheckoutReason('');
    setEarlyReasonError(null);
  }, []);

  // Simpan Check-In / Check-Out via Server RPC Anti-Curang (+ Telemetri Lengkap)
  const submitGpsAttendance = useCallback(
    async (mode: 'CHECK_IN' | 'CHECK_OUT', selfieBlob: Blob | null) => {
      if (isHolidayLocked) {
        showToast(
          'error',
          t('teacherAttendance.toastHolidayError', { reason: holidayReason })
        );
        return;
      }

      if (
        isSubmittingAttendance ||
        !teacher ||
        !activeSchoolId ||
        !userCoords ||
        distanceMeters === null
      ) {
        return;
      }

      setIsSubmittingAttendance(true);
      setCameraError(null);

      let newlyUploadedPath: string | null = null;

      try {
        let finalUploadedPath: string | null = uploadedSelfiePath;
        const nowObj = new Date();
        const currentDayStr = getSchoolDateString(nowObj, schoolTimezone);
        const timeTag = getTimeStampTagInTimezone(nowObj, schoolTimezone);

        // 1. Unggah foto selfie jika diwajibkan
        if (selfieBlob && !finalUploadedPath) {
          const schoolFolder = schoolGeo?.name
            ? sanitizeStorageSegment(schoolGeo.name)
            : activeSchoolId;
          const teacherFolder = buildTeacherFolderName(teacher);
          const fileName = `${schoolFolder}/${teacherFolder}/${currentDayStr}_${mode}_${timeTag}.jpg`;

          const { error: uploadErr } = await supabase.storage
            .from('attendance-selfies')
            .upload(fileName, selfieBlob, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (uploadErr) {
            throw new Error(
              t('teacherAttendance.errUploadSelfie', { msg: uploadErr.message })
            );
          }

          finalUploadedPath = fileName;
          newlyUploadedPath = fileName;
          setUploadedSelfiePath(fileName);
        }

        // 2. Kumpulkan telemetri perangkat terbaru + perhitungan keterlambatan otomatis
        const freshTelemetry = collectAttendanceTelemetry(userCoords.accuracy);
        const lateMinutesAtSubmit =
          mode === 'CHECK_IN'
            ? calculateLateMinutes(
                nowObj,
                effectiveWorkStartTime,
                effectiveToleranceMinutes,
                schoolTimezone
              )
            : 0;

        const combinedTelemetry: Record<string, unknown> = {
          ...securityState.telemetry,
          ...freshTelemetry.deviceTelemetry,
          gpsAccuracyMeters: Math.round(userCoords.accuracy),
          distanceMeters: Math.round(distanceMeters),
          javaneseDate: todayJavaneseFullDate,
          ...(mode === 'CHECK_IN' ? { lateMinutes: lateMinutesAtSubmit } : {}),
        };

        const combinedFlags = Array.from(
          new Set([...securityState.flags, ...freshTelemetry.securityFlags])
        );

        // 3. Panggil RPC Server
        const { data: rpcRaw, error: rpcError } = await supabase.rpc(
          'submit_teacher_gps_attendance',
          {
            p_mode: mode,
            p_lat: userCoords.lat,
            p_lng: userCoords.lng,
            p_accuracy: userCoords.accuracy,
            p_selfie_path: finalUploadedPath,
            p_early_reason:
              mode === 'CHECK_OUT' && earlyCheckoutReason.trim()
                ? earlyCheckoutReason.trim()
                : null,
            p_is_suspected_mock:
              securityState.isSuspectedMock || freshTelemetry.isSuspectedMock,
            p_security_flags: combinedFlags,
            p_device_telemetry: combinedTelemetry,
            p_sim_teacher_id: isSuperAdmin ? teacher.id : null,
            p_sim_school_id: isSuperAdmin ? activeSchoolId : null,
          }
        );

        if (rpcError) throw rpcError;

        const rpcResult = rpcRaw as SubmitGpsRpcResult | null;

        if (mode === 'CHECK_IN') {
          const serverStatus = rpcResult?.status;
          const effectiveLateMinutes =
            serverStatus === 'TERLAMBAT'
              ? Math.max(
                  1,
                  rpcResult?.serverTime
                    ? calculateLateMinutes(
                        new Date(rpcResult.serverTime),
                        effectiveWorkStartTime,
                        effectiveToleranceMinutes,
                        schoolTimezone
                      )
                    : lateMinutesAtSubmit
                )
              : 0;

          showToast(
            'success',
            serverStatus === 'TERLAMBAT'
              ? t('teacherAttendance.toastCheckInLate', {
                  duration: formatDurationMinutes(effectiveLateMinutes),
                })
              : t('teacherAttendance.toastCheckInOnTime')
          );
        } else {
          showToast('success', t('teacherAttendance.toastCheckOutSuccess'));
        }

        setEarlyCheckoutReason('');
        setEarlyReasonError(null);
        closeCameraModal();
        await loadTeacherAndAttendance();
        setActiveView('beranda');
      } catch (err: unknown) {
        if (newlyUploadedPath) {
          await supabase.storage
            .from('attendance-selfies')
            .remove([newlyUploadedPath])
            .catch(() => null);
          setUploadedSelfiePath(null);
        }

        const errMsg = extractErrorMessage(
          err,
          t('teacherAttendance.errSaveAttendance')
        );
        setCameraError(errMsg);
        showToast('error', errMsg);
      } finally {
        setIsSubmittingAttendance(false);
      }
    },
    [
      isHolidayLocked,
      showToast,
      t,
      holidayReason,
      isSubmittingAttendance,
      teacher,
      activeSchoolId,
      userCoords,
      distanceMeters,
      uploadedSelfiePath,
      schoolTimezone,
      schoolGeo?.name,
      effectiveWorkStartTime,
      effectiveToleranceMinutes,
      securityState.telemetry,
      securityState.flags,
      securityState.isSuspectedMock,
      todayJavaneseFullDate,
      earlyCheckoutReason,
      isSuperAdmin,
      formatDurationMinutes,
      closeCameraModal,
      loadTeacherAndAttendance,
      setActiveView,
    ]
  );

  const openCameraModal = useCallback(
    async (mode: 'CHECK_IN' | 'CHECK_OUT') => {
      if (isHolidayLocked) {
        showToast(
          'error',
          t('teacherAttendance.toastHolidayError', { reason: holidayReason })
        );
        return;
      }

      const needSelfie =
        mode === 'CHECK_IN' ? effectiveSelfieCheckIn : effectiveSelfieCheckOut;

      if (!needSelfie) {
        await submitGpsAttendance(mode, null);
        return;
      }

      const sessionId = ++cameraSessionIdRef.current;
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
      clearCapturedSelfie();
      isCapturingRef.current = false;
      setIsCapturingSnapshot(false);
      setCameraModal({ open: true, mode });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (sessionId !== cameraSessionIdRef.current) {
          stopMediaStreamTracks(stream);
          return;
        }

        const camCheck = validateCameraStream(stream, isSuperAdmin);
        if (!camCheck.valid) {
          stopMediaStreamTracks(stream);
          showToast(
            'error',
            camCheck.reason ?? t('teacherAttendance.errVirtualCamera')
          );
          setCameraModal({ open: false, mode });
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => null);
        }
      } catch {
        if (sessionId === cameraSessionIdRef.current) {
          showToast('error', t('teacherAttendance.errCameraAccess'));
          setCameraModal({ open: false, mode });
        }
      }
    },
    [
      isHolidayLocked,
      showToast,
      t,
      holidayReason,
      effectiveSelfieCheckIn,
      effectiveSelfieCheckOut,
      submitGpsAttendance,
      clearCapturedSelfie,
      isSuperAdmin,
    ]
  );

  const handleConfirmProceedCheckout = useCallback(() => {
    if (
      checkoutConfirmModal.isEarly &&
      earlyCheckoutReason.trim().length < MIN_EARLY_CHECKOUT_REASON_LENGTH
    ) {
      setEarlyReasonError(
        t('teacherAttendance.errEarlyReasonMin', {
          min: MIN_EARLY_CHECKOUT_REASON_LENGTH,
        })
      );
      return;
    }

    setEarlyReasonError(null);
    setCheckoutConfirmModal((prev) => ({ ...prev, open: false }));
    void openCameraModal('CHECK_OUT');
  }, [
    checkoutConfirmModal.isEarly,
    earlyCheckoutReason,
    t,
    openCameraModal,
  ]);

  const handleTakeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    if (
      isCapturingRef.current ||
      !video ||
      video.readyState < 2 ||
      video.videoWidth === 0
    ) {
      return;
    }

    const sessionId = cameraSessionIdRef.current;
    isCapturingRef.current = true;
    setIsCapturingSnapshot(true);
    try {
      const mirroredBlob = await compressSelfieToJpeg(video, {
        maxWidth: 720,
        maxBytes: 450 * 1024,
        initialQuality: 0.82,
        mirrorHorizontal: true,
      });

      if (sessionId !== cameraSessionIdRef.current) return;

      clearCapturedSelfie();
      setCapturedBlob(mirroredBlob);
      setCapturedPreview(URL.createObjectURL(mirroredBlob));
    } catch (err: unknown) {
      if (sessionId === cameraSessionIdRef.current) {
        setCameraError(
          extractErrorMessage(err, t('teacherAttendance.errSnapshotFailed'))
        );
      }
    } finally {
      if (sessionId === cameraSessionIdRef.current) {
        isCapturingRef.current = false;
        setIsCapturingSnapshot(false);
      }
    }
  }, [clearCapturedSelfie, t]);

  const handleFingerprintAction = useCallback(() => {
    triggerFingerprintGlow();

    if (activeView !== 'peta') {
      setActiveView('peta');
      void requestGpsPosition();
      return;
    }

    if (!teacher) {
      showToast('error', t('teacherAttendance.errTeacherUnlinked'));
      return;
    }

    if (attendancePhase === 'COMPLETED') {
      showToast(
        'success',
        t('teacherAttendance.toastAttendanceCompleted', {
          checkIn: formatShortTime(todayRecord?.checkInTime),
          checkOut: formatShortTime(todayRecord?.checkOutTime),
        })
      );
      return;
    }

    if (attendancePhase === 'ON_LEAVE') {
      showToast(
        'success',
        t('teacherAttendance.toastOnLeaveToday', {
          status: formatStatusLabel(todayRecord?.status),
        })
      );
      return;
    }

    if (isHolidayLocked) {
      showToast(
        'error',
        t('teacherAttendance.toastHolidayError', { reason: holidayReason })
      );
      return;
    }

    if (isLocating || !userCoords || distanceMeters === null) {
      void requestGpsPosition();
      showToast('error', t('teacherAttendance.toastGpsLocatingWait'));
      return;
    }

    if (!isWithinRadius) {
      void requestGpsPosition();
      showToast(
        'error',
        t('teacherAttendance.toastOutsideRadius', {
          distance: formatDistanceLabel(distanceMeters),
        })
      );
      return;
    }

    if (attendancePhase === 'CHECK_OUT') {
      const currentCheckDate = new Date();
      const timing = evaluateCheckOutTiming(
        currentCheckDate,
        effectiveWorkEndTime,
        CHECKOUT_TOLERANCE_MINUTES,
        schoolTimezone
      );

      if ((timing.isEarly && CONFIRM_EARLY_CHECKOUT) || CONFIRM_ALL_CHECKOUT) {
        const currentTimeLabel = currentCheckDate.toLocaleTimeString(
          dateLocale,
          {
            timeZone: schoolTimezone,
            hour: '2-digit',
            minute: '2-digit',
          }
        );
        setEarlyCheckoutReason('');
        setEarlyReasonError(null);
        setCheckoutConfirmModal({
          open: true,
          isEarly: timing.isEarly,
          formattedDiff: formatDurationMinutes(timing.diffMinutes),
          currentTimeLabel,
        });
        return;
      }
    }

    void openCameraModal(attendancePhase);
  }, [
    triggerFingerprintGlow,
    activeView,
    setActiveView,
    requestGpsPosition,
    teacher,
    showToast,
    t,
    attendancePhase,
    formatShortTime,
    todayRecord?.checkInTime,
    todayRecord?.checkOutTime,
    todayRecord?.status,
    formatStatusLabel,
    isHolidayLocked,
    holidayReason,
    isLocating,
    userCoords,
    distanceMeters,
    isWithinRadius,
    formatDistanceLabel,
    effectiveWorkEndTime,
    schoolTimezone,
    dateLocale,
    formatDurationMinutes,
    openCameraModal,
  ]);

  const isOnMapView = activeView === 'peta';
  const isCheckOutPhase = attendancePhase === 'CHECK_OUT';
  const isSelfieRequiredForCurrentPhase = isCheckOutPhase
    ? effectiveSelfieCheckOut
    : effectiveSelfieCheckIn;

  const isEarlyReasonValid =
    earlyCheckoutReason.trim().length >= MIN_EARLY_CHECKOUT_REASON_LENGTH;

  const fingerprintButtonStyle = useMemo(() => {
    if (!isOnMapView) {
      return isFingerprintGlowing
        ? 'bg-linear-to-br from-amber-300 via-orange-400 to-orange-600 text-slate-950 scale-110 ring-4 ring-orange-300/90 shadow-[0_0_30px_rgba(249,115,22,0.95)]'
        : 'bg-linear-to-br from-amber-300 via-amber-500 to-orange-500 text-slate-950 shadow-xl hover:scale-105';
    }

    if (isHolidayLocked) {
      return isFingerprintGlowing
        ? 'bg-slate-600 text-white scale-105 ring-4 ring-rose-400/70 shadow-[0_0_24px_rgba(244,63,94,0.75)]'
        : 'bg-linear-to-br from-slate-500 to-slate-700 text-white/85 shadow-lg';
    }

    if (attendancePhase === 'CHECK_OUT') {
      return isFingerprintGlowing
        ? 'bg-linear-to-br from-rose-400 via-red-500 to-red-700 text-white scale-110 ring-4 ring-red-400/90 shadow-[0_0_32px_rgba(239,68,68,0.95)]'
        : 'bg-linear-to-br from-rose-500 via-red-600 to-red-700 text-white shadow-[0_6px_22px_rgba(220,38,38,0.65)] hover:scale-105';
    }

    if (attendancePhase === 'COMPLETED' || attendancePhase === 'ON_LEAVE') {
      return isFingerprintGlowing
        ? 'bg-slate-600 text-white scale-105 ring-4 ring-slate-400/70 shadow-[0_0_24px_rgba(148,163,184,0.85)]'
        : 'bg-linear-to-br from-slate-500 to-slate-700 text-white/90 shadow-lg';
    }

    return isFingerprintGlowing
      ? 'bg-linear-to-br from-emerald-300 via-emerald-400 to-teal-500 text-white scale-110 ring-4 ring-emerald-300/90 shadow-[0_0_32px_rgba(16,185,129,0.95)]'
      : 'bg-linear-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-[0_6px_22px_rgba(16,185,129,0.65)] hover:scale-105';
  }, [isOnMapView, isHolidayLocked, attendancePhase, isFingerprintGlowing]);

  const fingerprintAuraColor = !isOnMapView
    ? 'bg-orange-400'
    : isHolidayLocked
      ? 'bg-rose-500'
      : attendancePhase === 'CHECK_OUT'
        ? 'bg-red-500'
        : 'bg-emerald-400';

  return {
    securityState,
    userCoords,
    gpsError,
    isLocating,
    distanceMeters,
    isWithinRadius,
    requestGpsPosition,
    mapContainerRef,
    checkoutConfirmModal,
    earlyCheckoutReason,
    setEarlyCheckoutReason,
    earlyReasonError,
    setEarlyReasonError,
    isEarlyReasonValid,
    closeCheckoutConfirmModal,
    handleConfirmProceedCheckout,
    cameraModal,
    videoRef,
    isCapturingSnapshot,
    capturedBlob,
    capturedPreview,
    cameraError,
    isSubmittingAttendance,
    clearCapturedSelfie,
    openCameraModal,
    closeCameraModal,
    handleTakeSnapshot,
    submitGpsAttendance,
    handleFingerprintAction,
    isOnMapView,
    isCheckOutPhase,
    isSelfieRequiredForCurrentPhase,
    fingerprintButtonStyle,
    fingerprintAuraColor,
  };
}