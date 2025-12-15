'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// 修复 Leaflet 默认图标在 Next.js 中的问题
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

interface ResultsMapProps {
  center: { lat: number; lng: number } | null;
  radiusMeters: number;
  points: Array<{
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    reservable: boolean;
  }>;
  selectedPlaceId?: string;
}

// 用于重新计算地图尺寸的组件
function MapResizeHandler({
  center,
  pointsLength,
  selectedPlaceId,
}: {
  center: { lat: number; lng: number } | null;
  pointsLength: number;
  selectedPlaceId?: string;
}) {
  const map = useMap();

  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 0);
  }, [map, center, pointsLength, selectedPlaceId]);

  return null;
}

// 用于控制地图视图和飞行的组件
function MapController({
  center,
  selectedPlaceId,
  points,
}: {
  center: { lat: number; lng: number } | null;
  selectedPlaceId?: string;
  points: Array<{ placeId: string; lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 13);
    }
  }, [center, map]);

  useEffect(() => {
    if (selectedPlaceId) {
      const selectedPoint = points.find((p) => p.placeId === selectedPlaceId);
      if (selectedPoint) {
        map.flyTo([selectedPoint.lat, selectedPoint.lng], 15, {
          duration: 1,
        });
      }
    }
  }, [selectedPlaceId, points, map]);

  return null;
}

export default function ResultsMap({
  center,
  radiusMeters,
  points,
  selectedPlaceId,
}: ResultsMapProps) {
  if (!center) {
    return (
      <div style={{ width: '100%', height: '520px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>等待搜尋結果...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '520px' }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapResizeHandler center={center} pointsLength={points.length} selectedPlaceId={selectedPlaceId} />
        <MapController center={center} selectedPlaceId={selectedPlaceId} points={points} />
        
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusMeters}
          pathOptions={{
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.1,
            weight: 2,
          }}
        />

        {points.map((point) => (
          <Marker key={point.placeId} position={[point.lat, point.lng]}>
            <Popup>
              <div>
                <strong>{point.name}</strong>
                <br />
                {point.reservable ? '✅ 可訂位' : '—'}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
