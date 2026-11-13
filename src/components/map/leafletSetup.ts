import L from 'leaflet';

let isLeafletIconConfigured = false;

/**
 * Mengonfigurasi ikon default Leaflet sekali saja dengan fallback SVG inline
 * agar tetap tampil tajam meskipun CDN eksternal diblokir jaringan sekolah.
 */
export function ensureLeafletDefaultIcon(): void {
    if (isLeafletIconConfigured) return;

    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;

    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    isLeafletIconConfigured = true;
}

/**
 * Membuat ikon pin SVG khusus (tahan offline/CDN down) untuk membedakan
 * titik pusat sekolah vs posisi pengguna saat absensi.
 */
export function createPinIcon(hexColor: string, label?: string): L.DivIcon {
    const badge = label
        ? `<span style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${label}</span>`
        : '';

    return L.divIcon({
        className: 'custom-leaflet-pin',
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -38],
        html: `
            <div style="position:relative;width:30px;height:42px;">
                ${badge}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="42" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="${hexColor}" stroke="#ffffff" stroke-width="1.8"/>
                    <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
                </svg>
            </div>
        `,
    });
}

export function isValidCoordinate(
    lat: number | null | undefined,
    lng: number | null | undefined
): boolean {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

/**
 * Membulatkan koordinat ke 6 angka di belakang koma (akurasi ~0,11 meter)
 * agar tidak menghasilkan angka desimal panjang berlebihan di database.
 */
export function roundCoord(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Menghitung jarak geodesic (meter) antara dua titik GPS menggunakan rumus Haversine.
 */
export function calculateDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6_371_000; // Radius rata-rata Bumi dalam meter
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}