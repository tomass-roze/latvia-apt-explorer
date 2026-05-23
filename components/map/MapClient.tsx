'use client';

import dynamic from 'next/dynamic';

// MapLibre touches `window` at module-eval time, so the Map component cannot
// run during SSR. Next 16 only allows `ssr: false` inside Client Components,
// so this thin wrapper is the seam between the server-rendered page shell and
// the client-only map canvas.
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[var(--paper-2)]">
      <p className="text-sm text-[var(--ink-3)]">Ielādē karti…</p>
    </div>
  ),
});

export default function MapClient() {
  return <Map />;
}
