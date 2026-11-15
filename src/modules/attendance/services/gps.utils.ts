// src/modules/attendance/services/gps.utils.ts
/**
 * GPS, Timezone & Image Compression Utility
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
 * Mengambil tanggal lokal perangkat (WIB/WITA/WIT) dalam format 'YYYY-MM-DD'
 * Menghindari bug UTC antara jam 00:00 - 06:59 WIB
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mengecek apakah waktu saat ini sudah melewati batas jam masuk (format 'HH:mm')
 */
export function isAfterDeadline(deadline: string = '07:30', now: Date = new Date()): boolean {
  const [hourStr, minStr] = deadline.split(':');
  const targetHour = Number(hourStr) || 7;
  const targetMin = Number(minStr) || 30;

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  return currentHour > targetHour || (currentHour === targetHour && currentMin > targetMin);
}

/**
 * Kalkulasi jarak antara dua titik koordinat (Haversine formula)
 * @returns jarak dalam METER
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Deteksi heuristik Mock GPS (Best Effort di Browser)
 * Tidak memblokir speed === 0 karena perangkat Android/iOS nyata saat diam sering mengembalikan speed 0.
 */
export function detectMockGps(position: GeolocationPosition): boolean {
  const { coords } = position;

  // Sinyal 1: Akurasi tidak masuk akal (<= 1 meter di perangkat mobile consumer)
  if (coords.accuracy > 0 && coords.accuracy <= 1) return true;

  // Sinyal 2: Koordinat terpotong persis <= 3 angka di belakang koma (tanda input koordinat manual)
  const latDecimals = coords.latitude.toString().split('.')[1]?.length ?? 0;
  const lngDecimals = coords.longitude.toString().split('.')[1]?.length ?? 0;
  if (latDecimals < 4 && lngDecimals < 4) {
    return true;
  }

  return false;
}

/**
 * Dapatkan posisi GPS dengan validasi akurasi & deteksi mock
 */
export function getCurrentPosition(
  options?: PositionOptions
): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Browser tidak mendukung GPS. Gunakan browser terbaru (Chrome/Safari).'));
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
            message = 'Izin GPS ditolak. Aktifkan izin lokasi (Location/GPS) di pengaturan browser atau HP Anda.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Lokasi tidak tersedia. Pastikan GPS HP Anda menyala.';
            break;
          case error.TIMEOUT:
            message = 'Waktu pencarian GPS habis. Coba lagi di tempat terbuka (luar ruangan).';
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

/**
 * Kompres foto selfie dari elemen <video> atau File menjadi JPEG ringan (~35-55 KB)
 * Hemat kuota Supabase Storage (1 GB bertahan > 2 tahun untuk 32 guru)
 */
export async function compressSelfieFromVideo(
  videoElement: HTMLVideoElement,
  maxWidth: number = 640,
  quality: number = 0.65
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ratio = videoElement.videoHeight / (videoElement.videoWidth || 1);
  const width = Math.min(videoElement.videoWidth || maxWidth, maxWidth);
  const height = Math.round(width * (ratio || 0.75));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gagal memproses gambar kamera.');

  // Mirror horizontal agar hasil selfie natural seperti cermin
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoElement, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengompresi foto selfie.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}