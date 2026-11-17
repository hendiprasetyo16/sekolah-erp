// src/utils/devicePlatform.ts

export interface DevicePlatformInfo {
  isAndroidApk: boolean;   // True jika dibuka dari aplikasi APK Android (Capacitor / TWA)
  isMobilePhone: boolean;  // True jika dibuka dari HP (baik APK maupun browser HP)
  isDesktop: boolean;      // True jika dibuka dari Komputer / Laptop (Windows, Mac, Linux)
  deviceLabel: 'APK_ANDROID' | 'MOBILE_WEB' | 'DESKTOP';
}

export function detectDevicePlatform(): DevicePlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isAndroidApk: false,
      isMobilePhone: false,
      isDesktop: true,
      deviceLabel: 'DESKTOP',
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;

  // 1. Deteksi apakah dibungkus Capacitor APK
  const winCapacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  const isCapacitorNative = Boolean(winCapacitor?.isNativePlatform?.());

  // 2. Deteksi apakah dibungkus TWA (Trusted Web Activity / Android App)
  const isTwaReferrer =
    typeof document !== 'undefined' &&
    document.referrer.startsWith('android-app://');
  const isAndroidWebView = /\bwv\b/.test(ua) && /Android/i.test(ua);

  const isAndroidApk = isCapacitorNative || isTwaReferrer || isAndroidWebView;

  // 3. Deteksi HP secara umum (Android / iPhone) yang memiliki layar sentuh asli
  const hasMobileUa = /Android|iPhone|iPod/i.test(ua);
  const isDesktopOs = /Win32|Win64|MacIntel|Linux x86_64|Linux i686/i.test(platform);
  const isMobilePhone =
    isAndroidApk || (hasMobileUa && maxTouchPoints > 0 && !isDesktopOs);

  const isDesktop = !isMobilePhone;

  return {
    isAndroidApk,
    isMobilePhone,
    isDesktop,
    deviceLabel: isAndroidApk
      ? 'APK_ANDROID'
      : isMobilePhone
        ? 'MOBILE_WEB'
        : 'DESKTOP',
  };
}