'use client';

import {
  AttributionControl,
  Layer,
  Map as MapLibre,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LATVIA_CENTER } from '@/lib/geo';
import type { SlimProject } from '@/lib/data.server';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface MapProps {
  projects: SlimProject[];
}

function toFeatureCollection(projects: SlimProject[]): GeoJSON.FeatureCollection {
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
      },
      geometry: { type: 'Point', coordinates: [p.location.lng, p.location.lat] },
    })),
  };
}

export default function Map({ projects }: MapProps) {
  const data = toFeatureCollection(projects);

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
            'circle-color': [
              'match',
              ['get', 'buildStage'],
              'ready',
              '#4F8A4A',
              'nearly-complete',
              '#D9A441',
              'under-construction',
              '#5D8AA8',
              'pre-sales',
              '#8A857B',
              '#1A1A17',
            ],
            'circle-radius': 8,
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
