/**
 * Utilitas Media, Kamera, dan Telemetri Keamanan Presensi
 * Dioptimalkan untuk Web Browser & Android APK (Capacitor / WebView)
 */

export interface AttendanceTelemetryResult {
  isSuspectedMock: boolean;
  securityFlags: string[];
  deviceTelemetry: Record<string, unknown>;
}

/**
 * Menghentikan seluruh track kamera (video/audio) secara aman
 * agar lampu indikator kamera mati dan memori WebView Android tidak bocor.
 */
export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });
  } catch (err) {
    console.warn('[MediaCleanup] Gagal menghentikan stream kamera:', err);
  }
}

/**
 * Mengompresi gambar selfie dari elemen <video>, <canvas>, atau File/Blob
 * menjadi JPEG berkualitas baik dengan ukuran di bawah 450 KB
 * (mematuhi batas bucket 'attendance-selfies' 500 KB di Supabase).
 */
export async function compressSelfieToJpeg(
  source: HTMLVideoElement | HTMLCanvasElement | Blob,
  options?: {
    maxWidth?: number;
    maxBytes?: number;
    initialQuality?: number;
  }
): Promise<Blob> {
  const maxWidth = options?.maxWidth ?? 720;
  const maxBytes = options?.maxBytes ?? 450 * 1024; // 450 KB aman di bawah limit 500 KB
  let quality = options?.initialQuality ?? 0.82;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D tidak didukung pada perangkat ini.');
  }

  let srcWidth = 0;
  let srcHeight = 0;
  let objectUrl: string | null = null;
  let drawable: CanvasImageSource;

  try {
    if (source instanceof HTMLVideoElement) {
      srcWidth = source.videoWidth || 640;
      srcHeight = source.videoHeight || 480;
      drawable = source;
    } else if (source instanceof HTMLCanvasElement) {
      srcWidth = source.width;
      srcHeight = source.height;
      drawable = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Gagal membaca file gambar selfie.'));
        image.src = objectUrl!;
      });
      srcWidth = img.naturalWidth || 640;
      srcHeight = img.naturalHeight || 480;
      drawable = img;
    }

    const scale = srcWidth > maxWidth ? maxWidth / srcWidth : 1;
    canvas.width = Math.round(srcWidth * scale);
    canvas.height = Math.round(srcHeight * scale);

    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

    let resultBlob = await canvasToJpegBlob(canvas, quality);

    // Turunkan kualitas secara bertahap jika ukuran masih melebihi batas
    while (resultBlob.size > maxBytes && quality > 0.35) {
      quality = Math.max(0.35, quality - 0.12);
      resultBlob = await canvasToJpegBlob(canvas, quality);
    }

    return resultBlob;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    // Bersihkan buffer memori canvas di WebView Android
    canvas.width = 0;
    canvas.height = 0;
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Gagal mengonversi foto selfie ke format JPEG.'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Mendeteksi jenis perangkat (APK/Mobile vs Desktop) dan indikator anomali
 * untuk dikirimkan ke RPC 'submit_teacher_gps_attendance'.
 */
export function collectAttendanceTelemetry(gpsAccuracy?: number | null): AttendanceTelemetryResult {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isDesktop = !isCapacitorNative && !isMobileUa;

  const securityFlags: string[] = [];
  let isSuspectedMock = false;

  if (isDesktop) {
    securityFlags.push('DESKTOP_BROWSER');
  } else if (isCapacitorNative) {
    securityFlags.push('ANDROID_APK');
  }

  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    securityFlags.push('AUTOMATED_WEBDRIVER');
    isSuspectedMock = true;
  }

  if (typeof gpsAccuracy === 'number' && gpsAccuracy <= 1.0) {
    securityFlags.push('UNNATURAL_GPS_ACCURACY');
    isSuspectedMock = true;
  }

  return {
    isSuspectedMock,
    securityFlags,
    deviceTelemetry: {
      deviceType: isDesktop ? 'DESKTOP' : isCapacitorNative ? 'APK_NATIVE' : 'MOBILE_WEB',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      screenResolution:
        typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'unknown',
      capturedAtClient: new Date().toISOString(),
    },
  };
}