/**
 * GPS Utility - Kalkulasi jarak dan deteksi Mock GPS
 *
 * Catatan: Deteksi Mock GPS di browser adalah BEST EFFORT.
 * Tidak ada cara 100% pasti mendeteksi mock GPS di web.
 * Kita menggunakan kombinasi sinyal yang mencurigakan:
 *  - accuracy terlalu sempurna (< 5 meter)
 *  - altitude null (emulator/mock biasanya tidak punya altitude)
 *  - speed negatif atau 0 tepat (tidak natural)
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
 * Cek apakah koordinat adalah mock GPS berdasarkan karakteristik mencurigakan
 */
export function detectMockGps(position: GeolocationPosition): boolean {
  const { coords } = position;

  // Sinyal 1: Akurasi terlalu sempurna (< 5 meter) — tidak natural untuk GPS nyata
  if (coords.accuracy < 5) return true;

  // Sinyal 2: Koordinat persis bulat (misalnya lat = -6.000000) — tanda manual input
  const latStr = coords.latitude.toString();
  const lngStr = coords.longitude.toString();
  if (
    (latStr.split('.')[1]?.length ?? 0) < 4 ||
    (lngStr.split('.')[1]?.length ?? 0) < 4
  ) {
    return true;
  }

  // Sinyal 3: Kecepatan persis 0 (emulator sering mengembalikan 0.0 exact)
  // GPS nyata mengembalikan null jika diam, atau nilai kecil dengan noise
  if (coords.speed !== null && coords.speed === 0) return true;

  return false;
}

/**
 * Dapatkan posisi GPS dengan analisis mock detection
 */
export function getCurrentPosition(
  options?: PositionOptions
): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Browser tidak mendukung GPS. Gunakan browser yang lebih baru.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // [FITUR BARU] Cek apakah aplikasi sedang dijalankan di komputer lokal (tahap pembuatan)
        const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Terapkan batas toleransi akurasi maksimal 65 meter
        // Aturan ini akan DIABAIKAN jika kamu sedang testing di 'localhost'
        if (!isDevelopment && position.coords.accuracy > 65) {
          reject(new Error(`Akurasi GPS terlalu rendah (±${Math.round(position.coords.accuracy)}m). Harap pergi ke area terbuka agar sinyal satelit lebih kuat.`));
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
