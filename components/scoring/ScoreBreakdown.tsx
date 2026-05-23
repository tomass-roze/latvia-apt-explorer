'use client';

import { CRITERION_DISPLAY, colorForCriterion } from '@/lib/scoring/palette';
import { CRITERIA, type CriterionKey } from '@/lib/scoring/registry';
import type { ScoreBreakdown as ScoreBreakdownType } from '@/lib/scoring/score';

interface CommonProps {
  breakdown: ScoreBreakdownType;
}

function StackedBar({ breakdown, height }: CommonProps & { height: number }) {
  return (
    <div
      className="flex w-full rounded-full overflow-hidden bg-[var(--paper-2)]"
      style={{ height }}
    >
      {CRITERIA.map((c) => {
        const entry = breakdown.contributions.find((x) => x.key === c.key);
        const contribution = entry?.contribution ?? 0;
        if (contribution <= 0) return null;
        // Render every contribution proportional to total (not to 1.0), so the
        // bar fills the available width and each segment represents the share.
        const share = breakdown.total > 0 ? contribution / breakdown.total : 0;
        return (
          <div
            key={c.key}
            title={`${c.label}: ${Math.round(contribution * 100)} pt`}
            style={{ width: `${share * 100}%`, backgroundColor: colorForCriterion(c.key as CriterionKey) }}
          />
        );
      })}
    </div>
  );
}

/** Compact variant for tiles / pin tooltips / compare cells. */
export function ScoreBreakdownTile({ breakdown }: CommonProps) {
  return (
    <div className="space-y-1">
      <StackedBar breakdown={breakdown} height={8} />
      <div className="flex items-baseline justify-between text-xs text-[var(--ink-3)]">
        <span>Vērtējums</span>
        <span>
          <span className="font-display text-base text-[var(--ink)] tabular-nums">
            {Math.round(breakdown.total * 100)}
          </span>{' '}
          / 100
        </span>
      </div>
    </div>
  );
}

/** Detail variant for project panel — bar + sorted legend. */
export function ScoreBreakdownDetail({
  breakdown,
  rank,
  total,
}: CommonProps & {
  rank?: number;
  total?: number;
}) {
  const sorted = [...breakdown.contributions].sort((a, b) => b.contribution - a.contribution);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-[var(--ink-3)]">Vērtējums</span>
        <span className="text-sm">
          <span className="font-display text-2xl text-[var(--ink)] tabular-nums">
            {Math.round(breakdown.total * 100)}
          </span>{' '}
          <span className="text-[var(--ink-3)]">/ 100</span>
          {rank !== undefined && total !== undefined ? (
            <span className="ml-3 text-[var(--ink-3)]">
              Rangs {rank} no {total}
            </span>
          ) : null}
        </span>
      </div>
      <StackedBar breakdown={breakdown} height={16} />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {sorted.map((entry) => {
          const display = CRITERION_DISPLAY.find((d) => d.key === entry.key);
          return (
            <li key={entry.key} className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: display?.color ?? 'var(--ink-3)' }}
              />
              <span className="text-[var(--ink-2)] flex-1 truncate">{display?.label ?? entry.key}</span>
              <span className="text-[var(--ink-3)] tabular-nums">
                {Math.round(entry.contribution * 100)} pt
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
