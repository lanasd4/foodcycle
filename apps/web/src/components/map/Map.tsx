import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LatLng } from '@/lib/types';
import { cn } from '@/lib/utils';

export const DAMASCUS: LatLng = { lat: 33.5138, lng: 36.2765 };

/** Brand-coloured pin (Leaflet's default image icons break with bundlers). */
export function pin(tone: 'primary' | 'accent' | 'critical' = 'primary') {
  const color = { primary: 'var(--primary)', accent: 'var(--accent)', critical: 'var(--urgency-critical)' }[tone];
  return L.divIcon({
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 1C7 1 1.5 6.4 1.5 13.2 1.5 22.5 14 35 14 35s12.5-12.5 12.5-21.8C26.5 6.4 21 1 14 1z" style="fill:${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="13" r="4.5" fill="white"/></svg>`,
  });
}

function Tiles() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }) });
  return null;
}

function FlyTo({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [to, map]);
  return null;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Resolved value of a design token (Leaflet writes colours as SVG attributes, where var() is not supported). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Tap the map (or use GPS) to choose a point. */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  className?: string;
}) {
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) return setGeoError('المتصفح لا يدعم تحديد الموقع.');
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) };
        onChange(p);
        setFlyTarget(p);
        setLocating(false);
      },
      () => {
        setGeoError('تعذّر تحديد موقعك. اختره على الخريطة.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative h-72 overflow-hidden rounded-xl border">
        <MapContainer center={[(value ?? DAMASCUS).lat, (value ?? DAMASCUS).lng]} zoom={value ? 15 : 12} className="size-full">
          <Tiles />
          <ClickToPick onPick={onChange} />
          <FlyTo to={flyTarget} />
          {value && <Marker position={[value.lat, value.lng]} icon={pin()} />}
        </MapContainer>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={locate}
          disabled={locating}
          className="absolute end-3 top-3 z-[400] shadow-pop"
        >
          <LocateFixed />
          {locating ? 'جارٍ التحديد…' : 'موقعي الحالي'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {geoError ??
          (value ? (
            <span dir="ltr" className="num">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>
          ) : (
            'اضغط على الخريطة لتحديد الموقع.'
          ))}
      </p>
    </div>
  );
}

/** Read-only map with one or more points and an optional radius. */
export function PointsMap({
  points,
  radiusKm,
  className,
}: {
  points: { position: LatLng; label?: string; tone?: 'primary' | 'accent' | 'critical' }[];
  radiusKm?: { center: LatLng; km: number };
  className?: string;
}) {
  const center = points[0]?.position ?? DAMASCUS;
  return (
    <div className={cn('h-56 overflow-hidden rounded-xl border', className)}>
      <MapContainer center={[center.lat, center.lng]} zoom={14} className="size-full" scrollWheelZoom={false}>
        <Tiles />
        {radiusKm && (
          <Circle
            center={[radiusKm.center.lat, radiusKm.center.lng]}
            radius={radiusKm.km * 1000}
            pathOptions={{ color: cssVar('--primary'), weight: 1, fillOpacity: 0.06 }}
          />
        )}
        {points.map((p, i) => (
          <Marker key={i} position={[p.position.lat, p.position.lng]} icon={pin(p.tone)}>
            {p.label && <Popup>{p.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export { Tiles };
