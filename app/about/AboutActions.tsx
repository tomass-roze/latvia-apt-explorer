'use client';

import { exportPersonalData, usePersonalState } from '@/lib/personal/hooks';

export function AboutActions() {
  const { wipeAll } = usePersonalState();

  const handleExport = () => {
    const json = exportPersonalData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apt-explorer-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleWipe = () => {
    const ok = window.confirm(
      'Tiks dzēsti visi tavi personīgie dati. Šī darbība nav atgriezeniska. Turpināt?',
    );
    if (ok) wipeAll();
  };

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handleExport}
        className="h-10 px-4 rounded-md bg-[var(--ink)] text-[var(--paper)] text-sm hover:bg-[var(--accent)] transition-colors"
      >
        Eksportēt JSON
      </button>
      <button
        type="button"
        onClick={handleWipe}
        className="h-10 px-4 rounded-md border border-[var(--accent)] text-[var(--accent)] text-sm hover:bg-[var(--accent-soft)] transition-colors"
      >
        Dzēst visus datus
      </button>
    </div>
  );
}
