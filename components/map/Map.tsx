'use client';

import {
  AttributionControl,
  Layer,
  Map as MapLibre,
  type MapLayerMouseEvent,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LATVIA_CENTER } from '@/lib/geo';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface MapProject {
  id: string;
  name: string;
  developer: string;
  location: { lat: number; lng: number };
  buildStage: string;
  apartmentCount: number;
  score?: number;
  percentile?: number;
}

interface MapProps {
  projects: MapProject[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function toFeatureCollection(projects: MapProject[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: projects.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        name: p.name,
        developer: p.developer,
        apartmentCount: p.apartmentCount,
        buildStage: p.buildStage,
        score: p.score ?? 0,
        percentile: p.percentile ?? 0,
      },
      geometry: { type: 'Point', coordinates: [p.location.lng, p.location.lat] },
    })),
  };
}

export default function Map({ projects, selectedId, onSelect }: MapProps) {
  const data = toFeatureCollection(projects);

  const handleClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature?.properties && typeof feature.properties.id === 'string') {
      onSelect?.(feature.properties.id);
    } else {
      onSelect?.(null);
    }
  };

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
      interactiveLayerIds={['clusters', 'unclustered-point']}
      onClick={handleClick}
      cursor="pointer"
    >
      <NavigationControl position="bottom-left" />
      <AttributionControl
        position="bottom-right"
        compact={false}
        customAttribution="© OpenFreeMap"
      />

      <Source id="projects" type="geojson" data={data} cluster clusterMaxZoom={12} clusterRadius={50}>
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': '#C3471A',
            'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 20, 30],
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1A1A17',
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-font': ['Noto Sans Regular'],
          }}
          paint={{ 'text-color': '#F5F2EC' }}
        />
        <Layer
          id="unclustered-point"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            // Color interpolates red → amber → green on the percentile.
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'percentile'],
              0,
              '#B23A2A',
              0.5,
              '#D9A441',
              1,
              '#4F8A4A',
            ],
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedId ?? ''],
              12,
              8,
            ],
            'circle-stroke-color': '#1A1A17',
            'circle-stroke-width': [
              'match',
              ['get', 'buildStage'],
              'pre-sales',
              1,
              'under-construction',
              2,
              'nearly-complete',
              3,
              'ready',
              4,
              1,
            ],
          }}
        />
      </Source>
    </MapLibre>
  );
}
