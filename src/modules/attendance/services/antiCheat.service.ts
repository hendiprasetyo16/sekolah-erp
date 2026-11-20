// src/modules/attendance/services/antiCheat.service.ts
import { calculateDistance } from './gps.utils';
import { detectDevicePlatform } from '@/utils/devicePlatform';

// ============================================================================
// PARAMETER KEAMANAN YANG DAPAT DISESUAIKAN (SELARAS RPC SQL v20.2)
// ============================================================================
export const SECURITY_CONFIG = {
  BLOCK_EMULATOR_SIGNATURES: true, // Tolak BlueStacks, Nox, LDPlayer, AVD, dll.
  BLOCK_VIRTUAL_CAMERA: true, // Tolak OBS Virtual Camera, ManyCam, DroidCam (kecuali SUPER_ADMIN)
  MAX_GPS_ACCURACY_METERS: 80, // Batas maksimal meleset sinyal GPS (RPC server maks 85m)
  MIN_GPS_ACCURACY_METERS: 1.0, // <= 1.0m = indikasi kuat Fake GPS (sama dengan RPC server)
  GPS_SAMPLE_COUNT: 3, // Jumlah pengambilan sampel GPS beruntun
  GPS_SAMPLE_TIMEOUT_MS: 12000, // Batas waktu tunggu pengambilan sampel GPS (ms)
  MAX_HUMAN_SPEED_MPS: 35, // Kecepatan perpindahan maks antar sampel (~126 km/jam)
} as const;

export interface EnvironmentAuditResult {
  allowed: boolean;
  blockReason?: string;
  isSuspectedMock: boolean;
  flags: string[];
  telemetry: Record<string, unknown>;
}

export interface VerifiedGpsResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  isSuspectedMock: boolean;
  flags: string[];
}

/**
 * 1. Memeriksa apakah perangkat adalah Emulator Android, Browser Otomasi, atau Komputer
 */
export function inspectDeviceEnvironment(
  isSuperAdmin: boolean = false,
  allowDesktopForTeacher: boolean = false,
  allowDesktopGlobal: boolean = false
): EnvironmentAuditResult {
  const flags: string[] = [];
  const platformInfo = detectDevicePlatform();
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const isWebdriver = Boolean(
    (navigator as Navigator & { webdriver?: boolean }).webdriver
  );

  // Deteksi GPU / WebGL Renderer (Emulator PC memakai SwiftShader / llvmpipe / virtual GPU)
  let webglRenderer = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && 'getExtension' in gl) {
      const webgl = gl as WebGLRenderingContext;
      const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        webglRenderer = String(
          webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        );
      }
    }
  } catch {
    webglRenderer = 'blocked';
  }

  const lowerRenderer = webglRenderer.toLowerCase();
  const lowerUa = ua.toLowerCase();
  const lowerPlatform = platform.toLowerCase();

  // Cek 1: Browser otomasi (Selenium / Puppeteer / Playwright)
  if (isWebdriver) {
    flags.push('AUTOMATED_WEBDRIVER');
  }

  // Cek 2: Ciri khas Emulator Android
  const emulatorKeywords = [
    'bluestacks',
    'nox',
    'ldplayer',
    'memu',
    'genymotion',
    'droid4x',
    'andy',
    'sdk_gphone',
    'emulator',
    'android sdk built for x86',
  ];
  const virtualGpuKeywords = [
    'swiftshader',
    'llvmpipe',
    'virtualbox',
    'vmware',
    'parallels',
    'virgl',
    'google swiftshader',
  ];

  const hasEmulatorUa = emulatorKeywords.some((kw) => lowerUa.includes(kw));
  const hasVirtualGpu = virtualGpuKeywords.some((kw) =>
    lowerRenderer.includes(kw)
  );

  // Cek 3: UA mengaku HP Android/iPhone, tetapi arsitektur prosesornya PC
  const claimsMobile = /android|iphone|ipad|ipod/i.test(lowerUa);
  const isPcArchitecture = /win32|win64|macintel|linux x86_64|linux i686/i.test(
    lowerPlatform
  );
  const hasUaPlatformMismatch =
    claimsMobile && (isPcArchitecture || maxTouchPoints === 0);

  if (hasEmulatorUa || hasVirtualGpu || hasUaPlatformMismatch) {
    flags.push('EMULATOR_OR_SPOOFED_DEVICE');
  }

  // Cek 4: Akses dari Android APK (Capacitor) atau Laptop / Komputer Desktop
  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }
      ).Capacitor?.isNativePlatform?.()
    );

  const isAndroidApk = isCapacitorNative || platformInfo.isAndroidApk;

  if (isAndroidApk) {
    flags.push('ANDROID_APK');
  }

  if (platformInfo.isDesktop) {
    flags.push('DESKTOP_BROWSER');
  }

  // Format telemetri selaras dengan pengecekan p_device_telemetry->>'deviceType' di RPC SQL v20.2
  const telemetry: Record<string, unknown> = {
    deviceType: platformInfo.isDesktop ? 'DESKTOP' : 'MOBILE',
    deviceLabel: platformInfo.deviceLabel,
    isAndroidApk,
    ua: ua.slice(0, 180),
    platform,
    maxTouchPoints,
    webglRenderer: webglRenderer.slice(0, 100),
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  if (isSuperAdmin) {
    return {
      allowed: true,
      isSuspectedMock: flags.includes('EMULATOR_OR_SPOOFED_DEVICE'),
      flags,
      telemetry,
    };
  }

  if (isWebdriver) {
    return {
      allowed: false,
      blockReason: 'Akses ditolak: Terdeteksi browser otomasi / bot.',
      isSuspectedMock: true,
      flags,
      telemetry,
    };
  }

  if (
    SECURITY_CONFIG.BLOCK_EMULATOR_SIGNATURES &&
    flags.includes('EMULATOR_OR_SPOOFED_DEVICE')
  ) {
    return {
      allowed: false,
      blockReason:
        'Akses ditolak: Terdeteksi penggunaan Emulator atau manipulasi browser. Gunakan HP asli Anda.',
      isSuspectedMock: true,
      flags,
      telemetry,
    };
  }

  const canUseDesktop = allowDesktopForTeacher || allowDesktopGlobal;
  if (platformInfo.isDesktop && !canUseDesktop) {
    return {
      allowed: false,
      blockReason:
        'Presensi via komputer terkunci untuk akun Anda. Silakan gunakan HP / Aplikasi Android, atau hubungi Admin sekolah.',
      isSuspectedMock: false,
      flags,
      telemetry,
    };
  }

  return {
    allowed: true,
    isSuspectedMock: flags.includes('EMULATOR_OR_SPOOFED_DEVICE'),
    flags,
    telemetry,
  };
}

/**
 * 2. Memeriksa apakah kamera berasal dari perangkat fisik asli (bukan OBS / ManyCam / Virtual Cam)
 */
export function validateCameraStream(
  stream: MediaStream,
  isSuperAdmin: boolean = false
): {
  valid: boolean;
  reason?: string;
  cameraLabel: string;
} {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    return {
      valid: false,
      reason: 'Perangkat kamera tidak terdeteksi.',
      cameraLabel: 'none',
    };
  }

  const label = track.label || '';

  if (isSuperAdmin) {
    return {
      valid: true,
      cameraLabel: label || 'Kamera Pengujian Super Admin',
    };
  }

  const lowerLabel = label.toLowerCase();

  const virtualCamKeywords = [
    'obs',
    'virtual',
    'manycam',
    'snap camera',
    'youcam',
    'splitcam',
    'xsplit',
    'droidcam',
    'iriun',
    'epoccam',
    'ndi',
    'cyberlink',
    'fake',
  ];

  const isVirtual = virtualCamKeywords.some((kw) => lowerLabel.includes(kw));

  if (SECURITY_CONFIG.BLOCK_VIRTUAL_CAMERA && isVirtual) {
    return {
      valid: false,
      reason: `Kamera virtual (${label}) tidak diizinkan. Gunakan kamera asli perangkat Anda.`,
      cameraLabel: label,
    };
  }

  return {
    valid: true,
    cameraLabel: label,
  };
}

/**
 * 3. Mengambil beberapa sampel GPS beruntun untuk mendeteksi Fake GPS
 */
export function acquireVerifiedGpsPosition(
  isDevelopment: boolean = false
): Promise<VerifiedGpsResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Perangkat/browser tidak mendukung GPS.'));
      return;
    }

    const samples: Array<{
      lat: number;
      lng: number;
      accuracy: number;
      altitude: number | null;
      speed: number | null;
      timestamp: number;
    }> = [];

    let watchId: number | null = null;
    let settled = false;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      if (samples.length > 0) {
        evaluateAndResolve();
      } else {
        reject(
          new Error(
            'Waktu pencarian sinyal GPS habis. Pastikan izin lokasi pada perangkat aktif.'
          )
        );
      }
    }, SECURITY_CONFIG.GPS_SAMPLE_TIMEOUT_MS);

    const evaluateAndResolve = () => {
      const latest = samples[samples.length - 1];
      const flags: string[] = [];

      if (
        !isDevelopment &&
        latest.accuracy > SECURITY_CONFIG.MAX_GPS_ACCURACY_METERS
      ) {
        reject(
          new Error(
            `Akurasi lokasi lemah (±${Math.round(latest.accuracy)}m). Pastikan Wi-Fi / GPS aktif.`
          )
        );
        return;
      }

      if (
        !isDevelopment &&
        latest.accuracy > 0 &&
        latest.accuracy <= SECURITY_CONFIG.MIN_GPS_ACCURACY_METERS
      ) {
        reject(
          new Error(
            'Terdeteksi sinyal GPS palsu (akurasi tidak wajar). Matikan aplikasi Fake GPS Anda.'
          )
        );
        return;
      }

      const latDecimals = latest.lat.toString().split('.')[1]?.length ?? 0;
      const lngDecimals = latest.lng.toString().split('.')[1]?.length ?? 0;
      if (!isDevelopment && latDecimals < 4 && lngDecimals < 4) {
        reject(
          new Error(
            'Koordinat GPS terdeteksi tidak alami. Gunakan GPS perangkat asli.'
          )
        );
        return;
      }

      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const curr = samples[i];
        const dist = calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        const dtSec = Math.max(0.5, (curr.timestamp - prev.timestamp) / 1000);
        const speedMps = dist / dtSec;

        if (!isDevelopment && speedMps > SECURITY_CONFIG.MAX_HUMAN_SPEED_MPS) {
          reject(
            new Error(
              'Terdeteksi loncatan lokasi GPS tidak wajar. Harap nonaktifkan pemalsu lokasi.'
            )
          );
          return;
        }
      }

      if (samples.length >= 2) {
        const allIdenticalCoords = samples.every(
          (s) => s.lat === samples[0].lat && s.lng === samples[0].lng
        );
        const allIntegerAccuracy = samples.every((s) =>
          Number.isInteger(s.accuracy)
        );
        const noAltitude = samples.every(
          (s) => s.altitude === null || s.altitude === 0
        );

        if (allIdenticalCoords && allIntegerAccuracy && noAltitude) {
          flags.push('STATIC_GPS_ZERO_DRIFT');
        }
      }

      resolve({
        latitude: latest.lat,
        longitude: latest.lng,
        accuracy: latest.accuracy,
        isSuspectedMock: flags.length > 0,
        flags,
      });
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        samples.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          timestamp: pos.timestamp || Date.now(),
        });

        if (samples.length >= SECURITY_CONFIG.GPS_SAMPLE_COUNT) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          evaluateAndResolve();
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        if (err.code === 1) {
          reject(
            new Error(
              'Izin lokasi ditolak. Aktifkan izin lokasi pada browser Anda.'
            )
          );
        } else {
          reject(
            new Error(
              'Gagal mendeteksi titik lokasi. Pastikan GPS/Wi-Fi perangkat aktif.'
            )
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: SECURITY_CONFIG.GPS_SAMPLE_TIMEOUT_MS,
        maximumAge: 0,
      }
    );
  });
}