import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Memperbaiki masalah ikon marker default Leaflet yang sering hilang di React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
    latitude: number | null;
    longitude: number | null;
    onChange: (lat: number, lng: number) => void;
}

// Sub-komponen untuk menangani event klik pada peta
function ClickableMap({ position, setPosition, onChange }: any) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng); // Pindahkan pin marker ke titik yang diklik
            onChange(e.latlng.lat, e.latlng.lng); // Kirim koordinat ke form
        },
    });

    return position === null ? null : <Marker position={position}></Marker>;
}

export function LocationPickerMap({ latitude, longitude, onChange }: LocationPickerProps) {
    // Posisi default: Tengah pulau Jawa / Indonesia jika belum ada data
    const defaultCenter = { lat: -7.4923, lng: 110.0093 };

    const [position, setPosition] = useState<L.LatLng | null>(
        latitude && longitude ? L.latLng(latitude, longitude) : null
    );

    // Perbarui pin di peta jika user mengetik manual di input form
    useEffect(() => {
        if (latitude && longitude) {
            setPosition(L.latLng(latitude, longitude));
        }
    }, [latitude, longitude]);

    return (
        <div className="h-75 w-full rounded-xl overflow-hidden border border-border z-10 relative">
            <MapContainer
                center={position || defaultCenter}
                zoom={position ? 16 : 6}
                style={{ height: '100%', width: '100%', zIndex: 10 }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickableMap position={position} setPosition={setPosition} onChange={onChange} />
            </MapContainer>
        </div>
    );
}