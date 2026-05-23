'use client';

import type { ScraperRunResult } from '@/lib/schema';

interface DataFreshnessProps {
  runs: ScraperRunResult[];
}

function runLastSuccess(run: ScraperRunResult): string {
  return run.status === 'ok' ? run.finishedAt : run.lastSuccessAt;
}

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function tone(maxAgeH: number): { color: string; label: string } {
  if (maxAgeH < 36) return { color: 'var(--score-100)', label: 'svaigi' };
  if (maxAgeH < 24 * 7) return { color: 'var(--score-50)', label: 'novecojuši' };
  return { color: 'var(--score-0)', label: 'ļoti veci' };
}

function formatAge(hours: number): string {
  if (hours < 1) return 'tikko';
  if (hours < 24) return `pirms ${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return `pirms ${days} d.`;
}

export function DataFreshness({ runs }: DataFreshnessProps) {
  if (runs.length === 0) {
    return <span className="text-xs text-[var(--ink-3)]">Dati vēl nav ielādēti</span>;
  }
  // Oldest successful scrape across all developers drives the badge tone.
  const maxAgeH = Math.max(...runs.map((r) => hoursAgo(runLastSuccess(r))));
  const minAgeH = Math.min(...runs.map((r) => hoursAgo(runLastSuccess(r))));
  const { color, label } = tone(maxAgeH);

  const failing = runs.filter((r) => r.status !== 'ok').length;

  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
        title={label}
      />
      <span className="tabular-nums">{formatAge(minAgeH)}</span>
      {failing > 0 ? (
        <span className="text-[var(--accent)]">· {failing} ar kļūdām</span>
      ) : null}
    </div>
  );
}

interface StalenessBannerProps {
  runs: ScraperRunResult[];
}

const DEV_LABELS: Record<string, string> = {
  yit: 'YIT',
  hepsor: 'Hepsor',
  bonava: 'Bonava',
  merks: 'Merks',
  pillar: 'Pillar',
  vastint: 'Vastint',
  invego: 'Invego',
};

export function StalenessBanner({ runs }: StalenessBannerProps) {
  const stale = runs.filter((r) => hoursAgo(runLastSuccess(r)) > 24 * 7);
  if (stale.length === 0) return null;
  return (
    <div className="absolute top-3 right-3 z-10 max-w-sm bg-[var(--paper)]/95 border-l-2 border-[var(--accent)] backdrop-blur-sm px-3 py-2 text-xs text-[var(--ink)] rounded-sm shadow-sm">
      <strong className="font-medium">Dati novecojuši:</strong>{' '}
      {stale.map((r) => DEV_LABELS[r.developer] ?? r.developer).join(', ')}. Apmeklē
      izstrādātāja vietni, lai pārliecinātos par pašreizējiem cenu un pieejamības datiem.
    </div>
  );
}
