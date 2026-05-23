'use client';

import { AttributionControl, Map as MapLibre, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LATVIA_CENTER } from '@/lib/geo';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Top-level map component for the apartment explorer.
 * Must be loaded via `next/dynamic({ ssr: false })` — MapLibre touches `window`
 * at module-eval time and would break SSR.
 */
export default function Map() {
  return (
    <MapLibre
      initialViewState={{
        longitude: LATVIA_CENTER.lng,
        latitude: LATVIA_CENTER.lat,
        zoom: 7,
      }}
      mapStyle={MAP_STYLE}
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <NavigationControl position="bottom-left" />
      <AttributionControl
        position="bottom-right"
        compact={false}
        customAttribution="© OpenFreeMap"
      />
    </MapLibre>
  );
}
