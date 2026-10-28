import { useState, useEffect } from 'react';
// TAMBAHAN: Import Circle
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Import modul pencarian
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';

// Memperbaiki masalah ikon marker default Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
    latitude: number | null;
    longitude: number | null;
    // TAMBAHAN: Mendukung prop radius opsional dari form
    radius?: number;
    onChange: (lat: number, lng: number) => void;
}

// Sub-komponen untuk fitur pencarian
function SearchField({ onChange, setPosition }: any) {
    const map = useMap();

    useEffect(() => {
        const provider = new OpenStreetMapProvider();
        // @ts-ignore - Mengabaikan error tipe TypeScript bawaan library
        const searchControl = new GeoSearchControl({
            provider: provider,
            style: 'bar',
            showMarker: false, // Kita sembunyikan marker bawaan pencarian karena kita pakai marker sendiri
            showPopup: false,
            autoClose: true,
            retainZoomLevel: false,
            animateZoom: true,
            keepResult: true,
            searchLabel: 'Ketik nama jalan atau kota...',
        });

        map.addControl(searchControl);

        // Mendengarkan saat pengguna memilih hasil pencarian
        map.on('geosearch/showlocation', (result: any) => {
            const lat = result.location.y;
            const lng = result.location.x;
            setPosition(L.latLng(lat, lng));
            onChange(lat, lng);
        });

        return () => {
            map.removeControl(searchControl);
        };
    }, [map, onChange, setPosition]);

    return null;
}

// Sub-komponen untuk menangani event klik pada peta
function ClickableMap({ position, setPosition, onChange }: any) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
            onChange(e.latlng.lat, e.latlng.lng);
        },
    });

    return position === null ? null : <Marker position={position}></Marker>;
}

// TAMBAHAN: Menerima prop radius dengan nilai default 0
export function LocationPickerMap({ latitude, longitude, radius = 0, onChange }: LocationPickerProps) {
    const defaultCenter = { lat: -7.4923, lng: 110.0093 };
    const [position, setPosition] = useState<L.LatLng | null>(
        latitude && longitude ? L.latLng(latitude, longitude) : null
    );

    useEffect(() => {
        if (latitude && longitude) {
            setPosition(L.latLng(latitude, longitude));
        }
    }, [latitude, longitude]);

    return (
        <div className="h-87.5 w-full rounded-xl overflow-hidden border border-border z-10 relative">
            <MapContainer
                center={position || defaultCenter}
                zoom={position ? 16 : 6}
                style={{ height: '100%', width: '100%', zIndex: 10 }}
            >
                <TileLayer
                    attribution='© OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <SearchField onChange={onChange} setPosition={setPosition} />
                <ClickableMap position={position} setPosition={setPosition} onChange={onChange} />

                {/* TAMBAHAN: Menampilkan Radius Lingkaran Toleransi Absensi jika radius > 0 */}
                {position && radius > 0 && (
                    <Circle
                        center={position}
                        radius={radius}
                        pathOptions={{
                            color: '#059669',     // Warna garis luar (Emerald 600)
                            fillColor: '#059669', // Warna isi (Emerald 600)
                            fillOpacity: 0.2,     // Transparansi (20%)
                            weight: 2             // Ketebalan garis
                        }}
                    />
                )}
            </MapContainer>
        </div>
    );
}