// src/modules/attendance/components/BarcodeScanner.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  CameraOff,
  RefreshCw,
  AlertCircle,
  Loader2,
  VideoOff,
  FlipHorizontal2,
  Keyboard,
  Send,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

// ============================================================================
// PARAMETER YANG DAPAT DISESUAIKAN
// ============================================================================
// Tinggi kamera dikalibrasi agar seluruh komponen (kamera + input bawah) utuh di layar
const CAMERA_MIN_HEIGHT = '175px';
const CAMERA_MAX_HEIGHT = '32dvh';
const DEFAULT_COOLDOWN_MS = 2500;
const CAMERA_STORAGE_KEY = 'sekolah_erp_kiosk_selected_camera_id';
const CAMERA_ENABLED_STORAGE_KEY = 'sekolah_erp_kiosk_camera_enabled';
const DEFAULT_MIRROR_PREVIEW = false;

export interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
  isPaused?: boolean;
  cooldownMs?: number;
  className?: string;
}

interface CameraDeviceOption {
  id: string;
  label: string;
}

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
];

function normalizeStudentCode(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        nisn?: string;
        nis?: string;
        code?: string;
      };
      const extracted = parsed.nisn || parsed.nis || parsed.code;
      if (extracted) return String(extracted).trim();
    } catch {
      // Lanjut jika bukan JSON valid
    }
  }

  const prefixMatch = trimmed.match(
    /^(?:SISWA|STUDENT|NISN|NIS)\s*[:\-|]\s*(.+)$/i
  );
  if (prefixMatch && prefixMatch[1]) {
    return prefixMatch[1].trim();
  }

  return trimmed;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  isPaused = false,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  className = '',
}) => {
  const { t } = useTranslation();

  const scannerRegionId = useRef(
    `qr-reader-${Math.random().toString(36).slice(2, 9)}`
  );
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; timestamp: number }>({
    code: '',
    timestamp: 0,
  });
  const isTransitioningRef = useRef(false);

  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(CAMERA_ENABLED_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [cameras, setCameras] = useState<CameraDeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    try {
      return localStorage.getItem(CAMERA_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [manualCode, setManualCode] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(DEFAULT_MIRROR_PREVIEW);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraNotFound, setIsCameraNotFound] = useState<boolean>(false);

  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const onScanErrorRef = useRef(onScanError);
  onScanErrorRef.current = onScanError;

  const emitDecodedCode = useCallback(
    (rawCode: string, bypassCooldown = false) => {
      if (isPaused) return;
      const cleanCode = normalizeStudentCode(rawCode);
      if (!cleanCode) return;

      const now = Date.now();
      const isDuplicate =
        !bypassCooldown &&
        lastScanRef.current.code === cleanCode &&
        now - lastScanRef.current.timestamp < cooldownMs;

      if (isDuplicate) return;

      lastScanRef.current = { code: cleanCode, timestamp: now };
      onScanSuccessRef.current(cleanCode);
    },
    [cooldownMs, isPaused]
  );

  const stopScannerSafely = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
      instance.clear();
    } catch {
      // Abaikan jika kamera sudah berhenti
    } finally {
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(
    async (overrideCameraId?: string) => {
      if (isTransitioningRef.current || isPaused || !isCameraEnabled) return;
      isTransitioningRef.current = true;
      setIsStarting(true);
      setCameraError(null);
      setIsCameraNotFound(false);

      try {
        await stopScannerSafely();

        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          throw new Error('NO_CAMERA_FOUND');
        }

        const mappedDevices: CameraDeviceOption[] = devices.map((d, idx) => ({
          id: d.id,
          label:
            d.label?.trim() ||
            t('attendanceScanner.cameraFallbackLabel', { index: idx + 1 }),
        }));
        setCameras(mappedDevices);

        const targetId = overrideCameraId ?? selectedCameraId;
        const isSavedValid = mappedDevices.some((d) => d.id === targetId);
        const activeDeviceId = isSavedValid ? targetId : mappedDevices[0].id;

        if (activeDeviceId !== selectedCameraId) {
          setSelectedCameraId(activeDeviceId);
          try {
            localStorage.setItem(CAMERA_STORAGE_KEY, activeDeviceId);
          } catch {
            // Abaikan
          }
        }

        const html5Qr = new Html5Qrcode(scannerRegionId.current, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
        scannerRef.current = html5Qr;

        await html5Qr.start(
          activeDeviceId,
          {
            fps: 12,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.max(120, Math.floor(minEdge * 0.74));
              return { width: size, height: size };
            },
          },
          (decodedText: string) => {
            emitDecodedCode(decodedText, false);
          },
          () => {
            // Frame kosong diabaikan
          }
        );
      } catch (err: unknown) {
        const errorObj = err as { message?: string; name?: string };
        let msg = t('attendanceScanner.errCameraGeneric');

        if (
          errorObj?.message === 'NO_CAMERA_FOUND' ||
          errorObj?.name === 'NotFoundError'
        ) {
          setIsCameraNotFound(true);
          msg = t('attendanceScanner.errCameraNotFound');
        } else if (
          errorObj?.message?.includes('Permission') ||
          errorObj?.name === 'NotAllowedError'
        ) {
          msg = t('attendanceScanner.errCameraPermission');
        }

        setCameraError(msg);
        onScanErrorRef.current?.(msg);
      } finally {
        setIsStarting(false);
        isTransitioningRef.current = false;
      }
    },
    [
      emitDecodedCode,
      isCameraEnabled,
      isPaused,
      selectedCameraId,
      stopScannerSafely,
      t,
    ]
  );

  useEffect(() => {
    if (isPaused || !isCameraEnabled) {
      stopScannerSafely();
      return;
    }

    startScanner();

    return () => {
      stopScannerSafely();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, isCameraEnabled]);

  useEffect(() => {
    if (!isPaused) {
      const timer = setTimeout(() => {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (
          activeTag !== 'input' &&
          activeTag !== 'select' &&
          activeTag !== 'textarea'
        ) {
          manualInputRef.current?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isPaused]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopScannerSafely();
      } else if (!isPaused && isCameraEnabled) {
        startScanner();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCameraEnabled, isPaused, startScanner, stopScannerSafely]);

  const handleSelectCameraChange = (newId: string) => {
    setSelectedCameraId(newId);
    try {
      localStorage.setItem(CAMERA_STORAGE_KEY, newId);
    } catch {
      // Abaikan
    }
    startScanner(newId);
  };

  const handleToggleCamera = () => {
    const nextState = !isCameraEnabled;
    setIsCameraEnabled(nextState);
    setCameraError(null);
    setIsCameraNotFound(false);
    try {
      localStorage.setItem(CAMERA_ENABLED_STORAGE_KEY, String(nextState));
    } catch {
      // Abaikan
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || isPaused) return;
    const codeToSend = manualCode.trim();
    setManualCode('');
    emitDecodedCode(codeToSend, true);
  };

  return (
    <div className={`w-full max-w-xl mx-auto flex flex-col gap-2 ${className}`}>
      {/* Bar Kontrol Pemilih Kamera, Mirror & Saklar Kamera */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        {isCameraEnabled && cameras.length > 0 && !cameraError ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Camera className="h-4 w-4 text-emerald-400 shrink-0" />
            <select
              value={selectedCameraId}
              onChange={(e) => handleSelectCameraChange(e.target.value)}
              disabled={isStarting}
              aria-label={t('attendanceScanner.ariaSelectCamera')}
              className="w-full min-w-0 truncate rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Keyboard className="h-4 w-4 text-emerald-400" />
            <span>{t('attendanceScanner.usbManualModeLabel')}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {isCameraEnabled && (
            <button
              type="button"
              onClick={() => setIsMirrored((prev) => !prev)}
              title={t('attendanceScanner.titleMirrorCamera')}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${isMirrored
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
                }`}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t('attendanceScanner.btnMirror')}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleCamera}
            title={
              isCameraEnabled
                ? t('attendanceScanner.titleDisableCamera')
                : t('attendanceScanner.titleEnableCamera')
            }
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${isCameraEnabled
              ? 'border-slate-700 bg-slate-900/90 text-slate-300 hover:bg-slate-800'
              : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
              }`}
          >
            {isCameraEnabled ? (
              <>
                <CameraOff className="h-3.5 w-3.5" />
                <span>{t('attendanceScanner.btnCloseCamera')}</span>
              </>
            ) : (
              <>
                <Camera className="h-3.5 w-3.5" />
                <span>{t('attendanceScanner.btnOpenCamera')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Kotak Viewport Kamera: Tinggi proporsional agar input bawah tetap terlihat */}
      {isCameraEnabled && (
        <div
          style={{
            height: CAMERA_MAX_HEIGHT,
            minHeight: CAMERA_MIN_HEIGHT,
          }}
          className="relative w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-inner shrink-0"
        >
          <style>{`
            #${scannerRegionId.current} {
              width: 100% !important;
              height: 100% !important;
              border: none !important;
            }
            #${scannerRegionId.current} video {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
              transform: ${isMirrored ? 'scaleX(-1)' : 'none'} !important;
            }
            #${scannerRegionId.current} canvas,
            #${scannerRegionId.current} #qr-shaded-region {
              display: none !important;
            }
            @keyframes kScanLaser {
              0%, 100% { top: 12%; opacity: 0.45; }
              50% { top: 86%; opacity: 1; }
            }
            .kiosk-scan-laser {
              animation: kScanLaser 2.2s ease-in-out infinite;
            }
          `}</style>

          <div id={scannerRegionId.current} className="w-full h-full" />

          {!isStarting && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[74%] aspect-square max-h-44 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]">
                <span className="absolute -top-0.5 -left-0.5 h-5 w-5 rounded-tl-lg border-t-3 border-l-3 border-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-tr-lg border-t-3 border-r-3 border-emerald-400" />
                <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-lg border-b-3 border-l-3 border-emerald-400" />
                <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-lg border-b-3 border-r-3 border-emerald-400" />
                <div className="kiosk-scan-laser absolute left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              </div>
            </div>
          )}

          {isStarting && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-2 p-4">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              <span className="text-xs font-medium text-slate-200">
                {t('attendanceScanner.preparingCamera')}
              </span>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-4 text-center text-white gap-2">
              {isCameraNotFound ? (
                <VideoOff className="h-7 w-7 text-amber-400" />
              ) : (
                <AlertCircle className="h-7 w-7 text-rose-400" />
              )}
              <p className="text-xs text-slate-200 max-w-xs leading-relaxed">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => startScanner()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('attendanceScanner.btnReloadCamera')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input Terpadu: Barcode Scanner USB/Bluetooth & Ketik Manual NISN/NIS */}
      <form
        onSubmit={handleManualSubmit}
        className="flex items-center gap-2 shrink-0"
      >
        <input
          ref={manualInputRef}
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          disabled={isPaused}
          placeholder={t('attendanceScanner.manualInputPlaceholder')}
          aria-label={t('attendanceScanner.ariaManualInput')}
          className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2 text-xs text-white placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!manualCode.trim() || isPaused}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-xs font-bold text-white transition cursor-pointer shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{t('attendanceScanner.btnSubmitScan')}</span>
        </button>
      </form>
    </div>
  );
};