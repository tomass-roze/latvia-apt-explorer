import MapClient from '@/components/map/MapClient';
import { loadSlimProjects } from '@/lib/data.server';

export default async function HomePage() {
  const projects = await loadSlimProjects();
  const developerCount = new Set(projects.map((p) => p.developer)).size;

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-14 px-6 flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl tracking-tight">Latvijas dzīvokļu karte</h1>
          <span className="text-[var(--ink-3)] text-xs">Jauno projektu apkopojums</span>
        </div>
        <div className="text-xs text-[var(--ink-3)]">
          {projects.length > 0
            ? `${projects.length} projekti · ${developerCount} izstrādātāji`
            : 'Dati vēl nav ielādēti'}
        </div>
      </header>

      <main className="flex-1 relative">
        <MapClient projects={projects} />
        {projects.length === 0 ? <EmptyState /> : null}
      </main>

      <footer className="px-6 py-3 border-t border-[var(--line)] text-xs text-[var(--ink-3)] flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>© OpenStreetMap kartes dati · © OpenFreeMap flīzes</span>
        <span>Personīgie dati glabājas tikai jūsu pārlūkā — nav sīkdatņu, nav izsekošanas.</span>
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="pointer-events-auto bg-[var(--paper)]/90 border border-[var(--line)] rounded-lg px-6 py-4 max-w-sm text-center backdrop-blur-sm">
        <h2 className="font-display text-lg mb-1">Vēl nav projektu</h2>
        <p className="text-sm text-[var(--ink-2)]">
          Skrāperi vēl nav ievākuši datus. Palaid <code>pnpm scrape yit</code> un{' '}
          <code>pnpm build-payload</code>, lai redzētu pirmos pinus.
        </p>
      </div>
    </div>
  );
}
