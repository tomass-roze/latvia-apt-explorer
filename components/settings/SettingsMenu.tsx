'use client';

import { useEffect, useRef, useState } from 'react';
import { exportPersonalData, usePersonalState } from '@/lib/personal/hooks';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { wipeAll } = usePersonalState();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click and Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
    setOpen(false);
  };

  const handleWipe = () => {
    const confirmed = window.confirm(
      'Tiks dzēsti visi tavi personīgie dati (statusi, piezīmes, saglabātie projekti, svari). Šī darbība nav atgriezeniska. Turpināt?',
    );
    if (!confirmed) return;
    wipeAll();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Iestatījumi"
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 w-8 grid place-items-center rounded-md border border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
      >
        <span aria-hidden>⚙</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 min-w-[220px] rounded-md border border-[var(--line)] bg-[var(--paper)] shadow-lg p-1"
        >
          <MenuItem onClick={handleExport}>Eksportēt JSON</MenuItem>
          <MenuItem onClick={handleWipe} destructive>
            Dzēst visus datus
          </MenuItem>
          <div className="border-t border-[var(--line)] mt-1 pt-2 px-2 text-[10px] text-[var(--ink-3)] leading-relaxed">
            Personīgie dati glabājas tikai šajā pārlūkā. Nav sīkdatņu, nav izsekošanas.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left text-sm px-3 py-2 rounded-md hover:bg-[var(--paper-2)] transition-colors ${
        destructive ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
      }`}
    >
      {children}
    </button>
  );
}
