'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

export type OverlayKey = 'schools' | 'transit' | 'parks' | 'shops';

export const OVERLAY_LABELS: Record<OverlayKey, string> = {
  schools: 'Skolas',
  transit: 'Transports',
  parks: 'Parki',
  shops: 'Veikali',
};

export const OVERLAY_COLORS: Record<OverlayKey, string> = {
  schools: '#5D8AA8',
  transit: '#6B4FBB',
  parks: '#4F8A4A',
  shops: '#C3471A',
};

interface OverlayToggleProps {
  active: Set<OverlayKey>;
  setActive: Dispatch<SetStateAction<Set<OverlayKey>>>;
}

export function OverlayToggle({ active, setActive }: OverlayToggleProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-[var(--paper)]/90 backdrop-blur-sm border border-[var(--line)] rounded-md p-1.5 shadow-sm">
      {(Object.keys(OVERLAY_LABELS) as OverlayKey[]).map((key) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() =>
              setActive((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            className={`flex items-center gap-1.5 h-7 px-2 rounded-sm text-xs transition-colors ${
              isActive
                ? 'bg-[var(--paper-2)] text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${isActive ? '' : 'border'}`}
              style={{
                backgroundColor: isActive ? OVERLAY_COLORS[key] : 'transparent',
                borderColor: OVERLAY_COLORS[key],
              }}
            />
            <span>{OVERLAY_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lazy-loads overlay GeoJSON files on first activation and caches them
 * in module-scope. Returns the loaded data only for currently-active keys.
 */
const cache = new Map<OverlayKey, GeoJSON.FeatureCollection>();
const inFlight = new Map<OverlayKey, Promise<void>>();

export function useOverlayData(active: Set<OverlayKey>) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    for (const key of active) {
      if (cache.has(key) || inFlight.has(key)) continue;
      const promise = fetch(`/data/overlays/${key}.geojson`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: GeoJSON.FeatureCollection) => {
          cache.set(key, data);
          inFlight.delete(key);
          setVersion((v) => v + 1);
        })
        .catch((err) => {
          console.warn(`[overlay] failed to load ${key}:`, err);
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
    }
  }, [active]);

  // Return a snapshot that respects `version` so React re-renders when fetches land.
  const data: Partial<Record<OverlayKey, GeoJSON.FeatureCollection>> = {};
  for (const key of active) {
    const d = cache.get(key);
    if (d) data[key] = d;
  }
  return { data, version };
}
