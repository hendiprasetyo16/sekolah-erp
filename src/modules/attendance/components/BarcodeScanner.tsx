import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Scan, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  isActive?: boolean;
}

/**
 * Komponen Barcode/QR Scanner menggunakan BarcodeDetector API (native browser)
 * Fallback: input manual NISN/NIS
 */
export function BarcodeScanner({ onScan, onError, isActive = true }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsScanning(true);
      setError(null);

      // Gunakan BarcodeDetector API jika tersedia
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'],
        });

        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue as string;
              stopCamera();
              onScan(code);
            }
          } catch {
            // Abaikan error deteksi frame
          }
        }, 500);
      } else {
        setError('BarcodeDetector API tidak didukung browser ini. Gunakan input manual.');
      }
    } catch (err) {
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

  const handleManualSubmit = (e: React.FormEvent) => {
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
            <video ref={videoRef} autoPlay playsInline muted className="scanner-video" />
            {/* Overlay crosshair */}
            <div className="scanner-overlay">
              <div className="scanner-frame">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
                <div className="scanner-line" />
              </div>
              <p className="scanner-hint">Arahkan kamera ke barcode atau QR Code</p>
            </div>
            <button className="scanner-stop-btn" onClick={stopCamera}>
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
                <button className="btn-primary" onClick={startCamera}>
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
        <button type="submit" className="btn-primary" disabled={!manualInput.trim()}>
          <Scan size={16} />
          Cari
        </button>
      </form>
    </div>
  );
}
