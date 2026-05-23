'use client';

import type { Apartment } from '@/lib/schema';

interface Props {
  apartments: readonly Apartment[];
}

/**
 * Stacked horizontal bar showing how many of the project's apartments are
 * available vs reserved vs sold, plus a tiny inline legend. Hidden when the
 * project has zero apartments scraped (project-level-only data) — there's
 * nothing to break down.
 *
 * Uses the PROJECT'S TOTAL inventory (project.apartments), not the
 * filter-narrowed list — this is project-level info, not a filter readout.
 */
export function AvailabilityBreakdown({ apartments }: Props) {
  if (apartments.length === 0) return null;

  const counts = { available: 0, reserved: 0, sold: 0 };
  for (const a of apartments) counts[a.availability]++;
  const total = apartments.length;

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">Pieejamība</h3>
      <div
        className="flex h-2 rounded-full overflow-hidden bg-[var(--paper-2)]"
        role="img"
        aria-label={`${counts.available} pieejami, ${counts.reserved} rezervēti, ${counts.sold} pārdoti no ${total}`}
      >
        {counts.available > 0 ? (
          <div
            style={{
              width: `${(counts.available / total) * 100}%`,
              backgroundColor: 'var(--score-100)',
            }}
            title={`${counts.available} pieejami`}
          />
        ) : null}
        {counts.reserved > 0 ? (
          <div
            style={{
              width: `${(counts.reserved / total) * 100}%`,
              backgroundColor: 'var(--score-50)',
            }}
            title={`${counts.reserved} rezervēti`}
          />
        ) : null}
        {counts.sold > 0 ? (
          <div
            style={{
              width: `${(counts.sold / total) * 100}%`,
              backgroundColor: 'var(--ink-3)',
            }}
            title={`${counts.sold} pārdoti`}
          />
        ) : null}
      </div>
      <div className="text-xs text-[var(--ink-2)] tabular-nums">
        {[
          counts.available > 0 ? `${counts.available} pieejami` : null,
          counts.reserved > 0 ? `${counts.reserved} rezervēti` : null,
          counts.sold > 0 ? `${counts.sold} pārdoti` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        <span className="text-[var(--ink-3)]"> · {total} kopā</span>
      </div>
    </section>
  );
}
