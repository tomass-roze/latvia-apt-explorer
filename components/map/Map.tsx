'use client';

import { useState } from 'react';
import type maplibregl from 'maplibre-gl';
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
import {
  OVERLAY_COLORS,
  OverlayToggle,
  type OverlayKey,
  useOverlayData,
} from './OverlayToggle';

// Inline style using Carto Voyager raster tiles. Free, no API key, low-volume
// public use is fine. OSM data + Carto styling. Attribution baked into the
// source as MapLibre requires.
//
// Swapped from OpenFreeMap because their Cloudflare edge currently 403s any
// request with an Origin header — making the service unusable from browsers.
// Revisit later if MapTiler vector tiles become preferable (better quality
// but requires an API key + domain restriction).
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: CARTO_SUBDOMAINS.map(
        (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`,
      ),
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'osm-base', type: 'raster', source: 'osm' }],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

interface MapProject {
  id: string;
  name: string;
  developer: string;
  location: { lat: number; lng: number };
  buildStage: string;
  apartmentCount: number;
  score?: number;
  percentile?: number;
  status?: 'new' | 'interested' | 'visited' | 'passed' | null;
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
        // Flag for the paint expression: ranked pins use the score gradient,
        // unranked (project-level-only data) fall back to neutral grey.
        hasScore: p.percentile !== undefined,
        percentile: p.percentile ?? 0,
        status: p.status ?? '',
      },
      geometry: { type: 'Point', coordinates: [p.location.lng, p.location.lat] },
    })),
  };
}

export default function Map({ projects, selectedId, onSelect }: MapProps) {
  const data = toFeatureCollection(projects);
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set());
  const { data: overlayData } = useOverlayData(activeOverlays);

  const handleClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      onSelect?.(null);
      return;
    }
    const props = feature.properties ?? {};
    // Cluster click → zoom in by one expansion level.
    if (props.cluster && typeof props.cluster_id === 'number') {
      const map = e.target;
      const src = map.getSource('projects') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src
        .getClusterExpansionZoom(props.cluster_id)
        .then((zoom) => {
          const geom = feature.geometry as GeoJSON.Point;
          const [lng, lat] = geom.coordinates as [number, number];
          map.easeTo({ center: [lng, lat], zoom });
        })
        .catch(() => {
          // Ignore — cluster may have been split between event + lookup.
        });
      return;
    }
    if (typeof props.id === 'string') {
      onSelect?.(props.id);
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
      <AttributionControl position="bottom-right" compact={false} />

      <OverlayToggle active={activeOverlays} setActive={setActiveOverlays} />

      {/* Overlay layers — rendered before project pins so pins stay on top. */}
      {(Object.entries(overlayData) as [OverlayKey, GeoJSON.FeatureCollection][]).map(
        ([key, fc]) => (
          <Source key={key} id={`overlay-${key}`} type="geojson" data={fc}>
            <Layer
              id={`overlay-${key}-layer`}
              type="circle"
              paint={{
                'circle-color': OVERLAY_COLORS[key],
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8,
                  1.5,
                  12,
                  3,
                  15,
                  5,
                ],
                'circle-opacity': 0.5,
                'circle-stroke-color': '#1A1A17',
                'circle-stroke-width': 0.3,
              }}
            />
          </Source>
        ),
      )}

      <Source id="projects" type="geojson" data={data} cluster clusterMaxZoom={12} clusterRadius={50}>
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            // Dark fill + light stroke — clusters are "structural" markers and
            // must visually pop against the colorful project pins.
            'circle-color': '#1A1A17',
            'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 20, 30],
            'circle-opacity': 0.95,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#F5F2EC',
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': '{point_count_abbreviated}',
            'text-size': 13,
            'text-font': ['Noto Sans Regular'],
          }}
          paint={{ 'text-color': '#F5F2EC' }}
        />
        <Layer
          id="unclustered-point"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            // Status always wins. Every project has an effective status
            // (default 'new' from getEffectiveStatus), so this case chain
            // covers all pins. Score gradient lives in the detail panel.
            'circle-color': [
              'case',
              ['==', ['get', 'status'], 'interested'],
              '#1F6FEB',
              ['==', ['get', 'status'], 'visited'],
              '#6B4FBB',
              ['==', ['get', 'status'], 'passed'],
              '#8A857B',
              '#5D8AA8',
            ],
            'circle-opacity': ['case', ['==', ['get', 'status'], 'passed'], 0.55, 0.95],
            'circle-radius': ['case', ['==', ['get', 'id'], selectedId ?? ''], 12, 8],
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
