import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

// Memperbaiki masalah ikon marker
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface AttendanceMapProps {
    schoolLat: number;
    schoolLng: number;
    userLat: number | null;
    userLng: number | null;
    radiusMeters: number;
}

// Sub-komponen untuk memusatkan layar agar sekolah dan pengguna terlihat
function AutoZoom({ schoolPos, userPos }: any) {
    const map = useMap();
    useEffect(() => {
        if (schoolPos && userPos) {
            const bounds = L.latLngBounds([schoolPos, userPos]);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (schoolPos) {
            map.setView(schoolPos, 17);
        }
    }, [map, schoolPos, userPos]);
    return null;
}

export function AttendanceMap({ schoolLat, schoolLng, userLat, userLng, radiusMeters }: AttendanceMapProps) {
    const schoolPos = L.latLng(schoolLat, schoolLng);
    const userPos = userLat && userLng ? L.latLng(userLat, userLng) : null;

    return (
        <div className="h-62.5 w-full rounded-xl overflow-hidden border border-border z-10 relative">
            <MapContainer center={schoolPos} zoom={16} style={{ height: '100%', width: '100%', zIndex: 10 }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {/* Lingkaran area absensi sekolah */}
                <Circle
                    center={schoolPos}
                    radius={radiusMeters}
                    pathOptions={{ color: 'emerald', fillColor: 'emerald', fillOpacity: 0.2 }}
                />

                {/* Posisi Pengguna */}
                {userPos && (
                    <Marker position={userPos}>
                        {/* Kita bisa menambahkan popup jika diinginkan nantinya */}
                    </Marker>
                )}

                <AutoZoom schoolPos={schoolPos} userPos={userPos} />
            </MapContainer>
        </div>
    );
}