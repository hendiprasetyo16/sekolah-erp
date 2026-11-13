import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import { Crosshair, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import {
    createPinIcon,
    ensureLeafletDefaultIcon,
    isValidCoordinate,
    roundCoord,
} from './leafletSetup';

ensureLeafletDefaultIcon();

export interface LocationPickerProps {
    latitude: number | null;
    longitude: number | null;
    radius?: number;
    disabled?: boolean;
    onChange: (lat: number, lng: number) => void;
}

const DEFAULT_INDONESIA_CENTER: [number, number] = [-2.5489, 118.0149];

interface SearchFieldProps {
    placeholder: string;
    disabled: boolean;
    onSelectLocation: (lat: number, lng: number) => void;
}

function SearchField({ placeholder, disabled, onSelectLocation }: SearchFieldProps) {
    const map = useMap();
    const callbackRef = useRef(onSelectLocation);

    useEffect(() => {
        callbackRef.current = onSelectLocation;
    }, [onSelectLocation]);


    // // @ts-expect-error - Deklarasi tipe bawaan leaflet-geosearch belum lengkap untuk opsi style
    useEffect(() => {
        if (disabled) return;

        const provider = new OpenStreetMapProvider();
        const searchControl = new GeoSearchControl({
            provider,
            style: 'bar',
            showMarker: false,
            showPopup: false,
            autoClose: true,
            retainZoomLevel: false,
            animateZoom: true,
            keepResult: true,
            searchLabel: placeholder,
        });

        map.addControl(searchControl);

        const handleShowLocation = (event: unknown) => {
            const loc = (event as { location?: { x?: number; y?: number } })?.location;
            if (typeof loc?.y === 'number' && typeof loc?.x === 'number') {
                callbackRef.current(roundCoord(loc.y), roundCoord(loc.x));
            }
        };

        map.on('geosearch/showlocation', handleShowLocation);

        return () => {
            map.off('geosearch/showlocation', handleShowLocation);
            map.removeControl(searchControl);
        };
    }, [map, placeholder, disabled]);

    return null;
}

interface InteractiveMarkerProps {
    position: [number, number] | null;
    disabled: boolean;
    schoolLabel: string;
    onSelectLocation: (lat: number, lng: number) => void;
}

function InteractiveMarker({
    position,
    disabled,
    schoolLabel,
    onSelectLocation,
}: InteractiveMarkerProps) {
    useMapEvents({
        click(e) {
            if (disabled) return;
            onSelectLocation(roundCoord(e.latlng.lat), roundCoord(e.latlng.lng));
        },
    });

    const schoolIcon = useMemo(
        () => createPinIcon('#059669', schoolLabel),
        [schoolLabel]
    );

    const eventHandlers = useMemo(
        () => ({
            dragend(e: L.DragEndEvent) {
                if (disabled) return;
                const marker = e.target as L.Marker;
                const latLng = marker.getLatLng();
                onSelectLocation(roundCoord(latLng.lat), roundCoord(latLng.lng));
            },
        }),
        [disabled, onSelectLocation]
    );

    if (!position) return null;

    return (
        <Marker
            position={position}
            icon={schoolIcon}
            draggable={!disabled}
            eventHandlers={eventHandlers}
        />
    );
}

/**
 * Menggeser viewport peta otomatis saat koordinat berubah dari input form manual
 * atau saat pertama kali data sekolah dimuat dari database.
 */
function MapViewportSync({ position }: { position: [number, number] | null }) {
    const map = useMap();
    const lastSyncedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!position) return;
        const key = `${position[0]},${position[1]}`;
        if (lastSyncedRef.current === key) return;

        lastSyncedRef.current = key;
        const targetZoom = Math.max(map.getZoom(), 17);
        map.flyTo(position, targetZoom, { duration: 0.6 });
    }, [map, position]);

    return null;
}

export function LocationPickerMap({
    latitude,
    longitude,
    radius = 0,
    disabled = false,
    onChange,
}: LocationPickerProps) {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const [isLocating, setIsLocating] = useState(false);

    const t = useMemo(
        () => ({
            searchPlaceholder: isId
                ? 'Cari nama sekolah, jalan, atau kota...'
                : 'Search school name, street, or city...',
            schoolPin: isId ? 'Titik Sekolah' : 'School Point',
            myLocation: isId ? 'Lokasi Saya' : 'My Location',
            geoUnsupported: isId
                ? 'Browser Anda tidak mendukung deteksi lokasi GPS.'
                : 'Your browser does not support GPS geolocation.',
            geoDenied: isId
                ? 'Izin lokasi ditolak. Aktifkan izin GPS pada browser Anda.'
                : 'Location permission denied. Please enable GPS permission in your browser.',
            geoSuccess: isId
                ? 'Koordinat berhasil diperbarui sesuai posisi Anda saat ini.'
                : 'Coordinates updated to your current GPS position.',
            helperHint: isId
                ? 'Klik pada peta, cari alamat, atau geser pin hijau untuk menentukan titik pusat absensi.'
                : 'Click on the map, search an address, or drag the green pin to set the attendance center.',
        }),
        [isId]
    );

    const hasValidPosition = isValidCoordinate(latitude, longitude);
    const position: [number, number] | null = hasValidPosition
        ? [latitude as number, longitude as number]
        : null;

    const handleSelectLocation = useCallback(
        (lat: number, lng: number) => {
            if (disabled) return;
            onChange(lat, lng);
        },
        [disabled, onChange]
    );

    const handleUseCurrentLocation = () => {
        if (disabled || isLocating) return;

        if (!('geolocation' in navigator)) {
            toast.error(t.geoUnsupported);
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setIsLocating(false);
                const lat = roundCoord(pos.coords.latitude);
                const lng = roundCoord(pos.coords.longitude);
                onChange(lat, lng);
                toast.success(t.geoSuccess);
            },
            () => {
                setIsLocating(false);
                toast.error(t.geoDenied);
            },
            {
                enableHighAccuracy: true,
                timeout: 10_000,
                maximumAge: 0,
            }
        );
    };

    return (
        <div className="space-y-2">
            <div className="relative h-87.5 w-full overflow-hidden rounded-xl border border-border z-10">
                <MapContainer
                    center={position ?? DEFAULT_INDONESIA_CENTER}
                    zoom={position ? 17 : 5}
                    style={{ height: '100%', width: '100%', zIndex: 10 }}
                >
                    <TileLayer
                        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <SearchField
                        placeholder={t.searchPlaceholder}
                        disabled={disabled}
                        onSelectLocation={handleSelectLocation}
                    />

                    <InteractiveMarker
                        position={position}
                        disabled={disabled}
                        schoolLabel={t.schoolPin}
                        onSelectLocation={handleSelectLocation}
                    />

                    <MapViewportSync position={position} />

                    {position && radius > 0 && (
                        <Circle
                            center={position}
                            radius={radius}
                            pathOptions={{
                                color: '#059669',
                                fillColor: '#059669',
                                fillOpacity: 0.2,
                                weight: 2,
                            }}
                        />
                    )}
                </MapContainer>

                {!disabled && (
                    <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isLocating}
                        title={t.myLocation}
                        className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur transition-colors hover:bg-muted disabled:opacity-60"
                    >
                        {isLocating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                        ) : (
                            <Crosshair className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span>{t.myLocation}</span>
                    </button>
                )}
            </div>

            {!disabled && (
                <p className="text-xs text-muted-foreground">{t.helperHint}</p>
            )}
        </div>
    );
}