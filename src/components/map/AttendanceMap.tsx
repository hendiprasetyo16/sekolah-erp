import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useTranslation } from '@/hooks/useTranslation';
import {
    calculateDistanceMeters,
    createPinIcon,
    ensureLeafletDefaultIcon,
    isValidCoordinate,
} from './leafletSetup';

ensureLeafletDefaultIcon();

export interface AttendanceMapProps {
    schoolLat: number;
    schoolLng: number;
    userLat: number | null;
    userLng: number | null;
    radiusMeters: number;
    /** Opsional: tingkat akurasi GPS perangkat pengguna dalam meter (dari GeolocationCoordinates.accuracy) */
    accuracyMeters?: number | null;
}

interface AutoZoomProps {
    schoolLat: number;
    schoolLng: number;
    userLat: number | null;
    userLng: number | null;
}

function AutoZoom({ schoolLat, schoolLng, userLat, userLng }: AutoZoomProps) {
    const map = useMap();

    useEffect(() => {
        if (!isValidCoordinate(schoolLat, schoolLng)) return;

        const schoolPos = L.latLng(schoolLat, schoolLng);

        if (isValidCoordinate(userLat, userLng)) {
            const userPos = L.latLng(userLat as number, userLng as number);
            const bounds = L.latLngBounds([schoolPos, userPos]);
            map.fitBounds(bounds, { padding: [55, 55], maxZoom: 18 });
        } else {
            map.setView(schoolPos, 17);
        }
    }, [map, schoolLat, schoolLng, userLat, userLng]);

    return null;
}

export function AttendanceMap({
    schoolLat,
    schoolLng,
    userLat,
    userLng,
    radiusMeters,
    accuracyMeters = null,
}: AttendanceMapProps) {
    const { locale } = useTranslation();
    const isId = locale === 'id';

    const hasValidSchool = isValidCoordinate(schoolLat, schoolLng);
    const hasValidUser = isValidCoordinate(userLat, userLng);

    const distanceMeters = useMemo(() => {
        if (!hasValidSchool || !hasValidUser) return null;
        return Math.round(
            calculateDistanceMeters(
                schoolLat,
                schoolLng,
                userLat as number,
                userLng as number
            )
        );
    }, [hasValidSchool, hasValidUser, schoolLat, schoolLng, userLat, userLng]);

    const isWithinRadius =
        distanceMeters !== null ? distanceMeters <= radiusMeters : true;

    const schoolIcon = useMemo(
        () => createPinIcon('#059669', isId ? 'Sekolah' : 'School'),
        [isId]
    );

    const userIcon = useMemo(
        () =>
            createPinIcon(
                isWithinRadius ? '#2563eb' : '#dc2626',
                isId ? 'Posisi Anda' : 'Your Location'
            ),
        [isWithinRadius, isId]
    );

    if (!hasValidSchool) {
        return (
            <div className="flex h-62.5 w-full items-center justify-center rounded-xl border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                {isId
                    ? 'Koordinat GPS sekolah belum diatur oleh Admin.'
                    : 'School GPS coordinates have not been configured by the Admin.'}
            </div>
        );
    }

    const schoolPos: [number, number] = [schoolLat, schoolLng];
    const userPos: [number, number] | null = hasValidUser
        ? [userLat as number, userLng as number]
        : null;

    const zoneColor = isWithinRadius ? '#059669' : '#dc2626';

    return (
        <div className="relative h-62.5 w-full overflow-hidden rounded-xl border border-border z-10">
            <MapContainer
                center={schoolPos}
                zoom={17}
                style={{ height: '100%', width: '100%', zIndex: 10 }}
            >
                <TileLayer
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Lingkaran geofencing area absensi sekolah */}
                {radiusMeters > 0 && (
                    <Circle
                        center={schoolPos}
                        radius={radiusMeters}
                        pathOptions={{
                            color: zoneColor,
                            fillColor: zoneColor,
                            fillOpacity: 0.18,
                            weight: 2,
                        }}
                    />
                )}

                {/* Marker titik pusat sekolah */}
                <Marker position={schoolPos} icon={schoolIcon} />

                {/* Lingkaran estimasi akurasi sinyal GPS pengguna (jika tersedia & > 5m) */}
                {userPos &&
                    typeof accuracyMeters === 'number' &&
                    Number.isFinite(accuracyMeters) &&
                    accuracyMeters > 5 && (
                        <Circle
                            center={userPos}
                            radius={Math.min(accuracyMeters, 500)}
                            pathOptions={{
                                color: '#3b82f6',
                                fillColor: '#3b82f6',
                                fillOpacity: 0.1,
                                weight: 1,
                                dashArray: '4 4',
                            }}
                        />
                    )}

                {/* Marker posisi pengguna */}
                {userPos && <Marker position={userPos} icon={userIcon} />}

                <AutoZoom
                    schoolLat={schoolLat}
                    schoolLng={schoolLng}
                    userLat={userLat}
                    userLng={userLng}
                />
            </MapContainer>

            {/* Badge jarak & status radius di pojok kanan atas peta */}
            {distanceMeters !== null && (
                <div
                    className={`pointer-events-none absolute right-3 top-3 z-20 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${isWithinRadius
                            ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/90 dark:text-emerald-300'
                            : 'border-red-200 bg-red-50/95 text-red-700 dark:border-red-500/30 dark:bg-red-950/90 dark:text-red-300'
                        }`}
                >
                    {isId
                        ? `Jarak: ${distanceMeters}m (Maks ${radiusMeters}m)`
                        : `Distance: ${distanceMeters}m (Max ${radiusMeters}m)`}
                </div>
            )}
        </div>
    );
}