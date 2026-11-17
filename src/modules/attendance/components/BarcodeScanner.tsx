// D:\APLIKASI\sekolah-erp\src\modules\attendance\components\BarcodeScanner.tsx
//src/modules/attendance/components/BarcodeScanner.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Scan, X } from 'lucide-react';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const SCAN_INTERVAL_MS = 500;
const SUPPORTED_BARCODE_FORMATS = [
  'qr_code',
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'data_matrix',
] as const;

// ============================================================================
// DEFINISI TIPE BROWSER BARCODE DETECTOR API (TANPA ANY)
// ============================================================================
interface DetectedBarcode {
  rawValue: string;
  format?: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new(options?: BarcodeDetectorOptions): BarcodeDetectorInstance;
}

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  isActive?: boolean;
}

/**
 * Komponen Barcode/QR Scanner menggunakan BarcodeDetector API (native browser)
 * Fallback: input manual NISN/NIS
 */
export function BarcodeScanner({
  onScan,
  onError,
  isActive = true,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);
      setError(null);

      // Gunakan BarcodeDetector API jika tersedia di browser
      const BarcodeDetectorCtor = (window as WindowWithBarcodeDetector)
        .BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({
          formats: [...SUPPORTED_BARCODE_FORMATS],
        });

        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const code = barcodes[0].rawValue;
              stopCamera();
              onScan(code);
            }
          } catch {
            // Abaikan error deteksi pada frame tunggal
          }
        }, SCAN_INTERVAL_MS);
      } else {
        setError(
          'BarcodeDetector API tidak didukung browser ini. Gunakan input manual.'
        );
      }
    } catch {
      setHasCamera(false);
      const msg = 'Kamera tidak dapat diakses. Gunakan input manual NISN/NIS.';
      setError(msg);
      onError?.(msg);
    }
  }, [onScan, onError, stopCamera]);

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isActive, startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = manualInput.trim();
    if (!code) return;
    setManualInput('');
    onScan(code);
  };

  return (
    <div className="barcode-scanner">
      {/* Kamera preview */}
      <div className="scanner-preview">
        {isScanning ? (
          <div className="scanner-video-wrapper">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="scanner-video"
            />
            {/* Overlay crosshair */}
            <div className="scanner-overlay">
              <div className="scanner-frame">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
                <div className="scanner-line" />
              </div>
              <p className="scanner-hint">
                Arahkan kamera ke barcode atau QR Code
              </p>
            </div>
            <button
              type="button"
              className="scanner-stop-btn"
              onClick={stopCamera}
            >
              <X size={16} />
              Hentikan
            </button>
          </div>
        ) : (
          <div className="scanner-idle">
            {hasCamera ? (
              <>
                <div className="scanner-idle-icon">
                  <Scan size={48} />
                </div>
                <p>Kamera tidak aktif</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={startCamera}
                >
                  <Camera size={16} />
                  Aktifkan Kamera
                </button>
              </>
            ) : (
              <div className="scanner-idle-icon no-camera">
                <CameraOff size={48} />
                <p>Kamera tidak tersedia</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="scanner-error">
          <span>{error}</span>
        </div>
      )}

      {/* Divider */}
      <div className="scanner-divider">
        <span>atau input manual</span>
      </div>

      {/* Input Manual */}
      <form onSubmit={handleManualSubmit} className="scanner-manual">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Ketik NISN / NIS / ID Kartu..."
          className="form-input"
          autoFocus={!isScanning}
          inputMode="numeric"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={!manualInput.trim()}
        >
          <Scan size={16} />
          Cari
        </button>
      </form>
    </div>
  );
}