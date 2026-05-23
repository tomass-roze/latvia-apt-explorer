import Link from 'next/link';
import { CompareTable } from '@/components/compare/CompareTable';
import { loadApartments, loadProjects } from '@/lib/data.server';

export default async function ComparePage() {
  const [projects, apartments] = await Promise.all([loadProjects(), loadApartments()]);
  return (
    <div className="flex flex-col h-dvh">
      <header className="h-14 px-6 flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper)] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">
            ← Karte
          </Link>
          <h1 className="font-display text-xl tracking-tight">Salīdzināšana</h1>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <CompareTable projects={projects} apartments={apartments} />
      </main>
      <footer className="px-6 py-3 border-t border-[var(--line)] text-xs text-[var(--ink-3)] shrink-0">
        Personīgie dati glabājas tikai jūsu pārlūkā — nav sīkdatņu, nav izsekošanas.
      </footer>
    </div>
  );
}

export const metadata = {
  title: 'Salīdzināšana · Latvijas dzīvokļu karte',
};
