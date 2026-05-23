'use client';

import dynamic from 'next/dynamic';
import type { SlimProject } from '@/lib/data.server';

// MapLibre touches `window` at module-eval time; Next 16 requires `ssr: false`
// to live inside a Client Component, which this wrapper provides.
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[var(--paper-2)]">
      <p className="text-sm text-[var(--ink-3)]">Ielādē karti…</p>
    </div>
  ),
});

interface MapClientProps {
  projects: SlimProject[];
}

export default function MapClient({ projects }: MapClientProps) {
  return <Map projects={projects} />;
}
