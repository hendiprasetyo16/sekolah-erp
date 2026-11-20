// src/modules/attendance/services/gps.utils.ts
/**
 * GPS, Timezone & Image Compression Utility (Selaras Skema SQL v20.2)
 */

export interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  speed?: number | null;
  isMock: boolean;
}

/**
 * Mengambil tanggal sesuai zona waktu sekolah (default 'Asia/Jakarta') dalam format 'YYYY-MM-DD'.
 */
export function getSchoolDateString(
  date: Date = new Date(),
  timeZone: string = 'Asia/Jakarta'
): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Alias kompatibilitas untuk pengambilan tanggal lokal format 'YYYY-MM-DD'
 */
export function getLocalDateString(date: Date = new Date()): string {
  return getSchoolDateString(date, 'Asia/Jakarta');
}

/**
 * Mengecek apakah waktu saat ini sudah melewati batas jam masuk + toleransi (menit)
 * sesuai zona waktu sekolah (default 'Asia/Jakarta').
 */
export function isAfterDeadline(
  deadline: string = '07:30',
  now: Date = new Date(),
  toleranceMinutes: number = 0,
  timeZone: string = 'Asia/Jakarta'
): boolean {
  const [hourStr, minStr] = deadline.split(':');
  const parsedHour = Number(hourStr);
  const parsedMin = Number(minStr);
  const baseHour = Number.isFinite(parsedHour) ? parsedHour : 7;
  const baseMin = Number.isFinite(parsedMin) ? parsedMin : 30;

  const totalDeadlineMinutes =
    baseHour * 60 + baseMin + Math.max(0, toleranceMinutes);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const curHour = Number(
    parts.find((p) => p.type === 'hour')?.value ?? now.getHours()
  );
  const curMin = Number(
    parts.find((p) => p.type === 'minute')?.value ?? now.getMinutes()
  );
  const currentTotalMinutes = curHour * 60 + curMin;

  return currentTotalMinutes > totalDeadlineMinutes;
}

/**
 * Kompres foto selfie dari <video> dengan efek mirror horizontal,
 * batas ukuran < 450 KB (aman untuk bucket 500 KB), dan pembersihan memori WebView APK.
 */
export async function compressSelfieFromVideo(
  videoElement: HTMLVideoElement,
  maxWidth: number = 720,
  initialQuality: number = 0.78,
  maxBytes: number = 450 * 1024
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ratio =
    (videoElement.videoHeight || 480) / (videoElement.videoWidth || 640);
  const width = Math.min(videoElement.videoWidth || maxWidth, maxWidth);
  const height = Math.round(width * ratio);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gagal memproses gambar kamera.');

  try {
    // Mirror horizontal agar hasil selfie natural seperti cermin
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, width, height);

    const toBlobWithQuality = (q: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('Gagal mengompresi foto selfie.')),
          'image/jpeg',
          q
        );
      });

    let quality = initialQuality;
    let resultBlob = await toBlobWithQuality(quality);

    while (resultBlob.size > maxBytes && quality > 0.35) {
      quality = Math.max(0.35, quality - 0.12);
      resultBlob = await toBlobWithQuality(quality);
    }

    return resultBlob;
  } finally {
    // Bebaskan buffer memori canvas agar WebView Android APK tidak bocor memori
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Memvalidasi & mengompresi file lampiran izin/sakit (gambar dikompres, PDF dicek ukuran <= 2 MB)
 */
export async function prepareAttachmentFile(file: File): Promise<{
  blob: Blob;
  extension: string;
  contentType: string;
}> {
  const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) {
      throw new Error('Ukuran file PDF maksimal 2 MB.');
    }
    return {
      blob: file,
      extension: 'pdf',
      contentType: 'application/pdf',
    };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error(
      'Format lampiran tidak didukung. Gunakan foto (JPG/PNG/WEBP) atau PDF.'
    );
  }

  const imageBitmap = await createImageBitmap(file);
  const maxDimension = 1280;
  const scale = Math.min(
    1,
    maxDimension / Math.max(imageBitmap.width, imageBitmap.height)
  );
  const targetWidth = Math.round(imageBitmap.width * scale);
  const targetHeight = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    imageBitmap.close();
    throw new Error('Gagal memproses gambar lampiran.');
  }

  try {
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    imageBitmap.close();

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Gagal mengompresi gambar lampiran.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.78
      );
    });

    if (compressedBlob.size > MAX_BYTES) {
      throw new Error(
        'Ukuran gambar lampiran setelah kompresi masih melebihi 2 MB.'
      );
    }

    return {
      blob: compressedBlob,
      extension: 'jpg',
      contentType: 'image/jpeg',
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Kalkulasi jarak antara dua titik koordinat (Rumus Haversine)
 * @returns jarak dalam METER
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius bumi dalam meter (selaras dengan RPC SQL)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Deteksi heuristik Mock GPS di Browser (selaras ambang batas RPC <= 1.0m)
 */
export function detectMockGps(position: GeolocationPosition): boolean {
  const { coords } = position;

  if (coords.accuracy > 0 && coords.accuracy <= 1.0) {
    return true;
  }

  const latDecimals = coords.latitude.toString().split('.')[1]?.length ?? 0;
  const lngDecimals = coords.longitude.toString().split('.')[1]?.length ?? 0;
  if (latDecimals < 4 && lngDecimals < 4) {
    return true;
  }

  return false;
}

/**
 * Mendapatkan posisi GPS tunggal dengan validasi akurasi & deteksi mock
 */
export function getCurrentPosition(
  options?: PositionOptions
): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          'Browser tidak mendukung GPS. Gunakan browser terbaru (Chrome/Safari).'
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const isDevelopment =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';

        if (!isDevelopment && position.coords.accuracy > 80) {
          reject(
            new Error(
              `Akurasi GPS terlalu rendah (±${Math.round(position.coords.accuracy)}m). Harap bergeser ke area terbuka agar sinyal satelit lebih kuat.`
            )
          );
          return;
        }

        const isMock = detectMockGps(position);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          isMock,
        });
      },
      (error) => {
        let message = 'Gagal mendapatkan lokasi GPS.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              'Izin GPS ditolak. Aktifkan izin lokasi (Location/GPS) di pengaturan browser atau HP Anda.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Lokasi tidak tersedia. Pastikan GPS HP Anda menyala.';
            break;
          case error.TIMEOUT:
            message =
              'Waktu pencarian GPS habis. Coba lagi di tempat terbuka (luar ruangan).';
            break;
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        ...options,
      }
    );
  });
}