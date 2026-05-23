'use client';

import * as Slider from '@radix-ui/react-slider';
import { useMemo } from 'react';
import { CRITERIA, type CriterionKey, normalizeWeights } from '@/lib/scoring/registry';
import { colorForCriterion } from '@/lib/scoring/palette';
import { useWeights } from '@/lib/url-state/filters';

const GROUP_LABELS: Record<string, string> = {
  price: 'Cena & vērtība',
  location: 'Atrašanās vieta',
  building: 'Ēka & energoefektivitāte',
  apartment: 'Dzīvokļa īpašības',
};

export function WeightSliders() {
  const [weights, setWeights] = useWeights();

  // Normalize for display; the URL holds raw values that may not sum to 1.
  const normalized = useMemo(() => normalizeWeights(weights), [weights]);

  const correlatedWarning = useMemo(() => {
    const price = normalized.priceTotal + normalized.pricePerSqm;
    const center = normalized.distRigaCenter;
    return price > 0.5 && center > 0.25;
  }, [normalized]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof CRITERIA[number][]>();
    for (const c of CRITERIA) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, []);

  const reset = () => {
    const defaults: Partial<Record<CriterionKey, number>> = {};
    for (const c of CRITERIA) defaults[c.key as CriterionKey] = c.defaultWeight;
    setWeights(defaults);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {groups.map(([group, criteria]) => (
          <details key={group} open className="group">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2 list-none flex items-center justify-between">
              <span>{GROUP_LABELS[group] ?? group}</span>
              <span className="text-[var(--ink-3)] group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="space-y-3 pl-1">
              {criteria.map((c) => (
                <WeightRow
                  key={c.key}
                  criterion={c}
                  value={weights[c.key as CriterionKey] ?? c.defaultWeight}
                  onChange={(v) => setWeights({ [c.key as CriterionKey]: v })}
                />
              ))}
            </div>
          </details>
        ))}
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--paper)] px-5 py-3 space-y-2">
        {correlatedWarning ? (
          <div className="border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--ink)]">
            Cena un centra atrašanās stipri korelē — varbūt dubultojat svaru
            uz atrašanās vietu.
          </div>
        ) : null}
        <NormalizationBar normalized={normalized} />
        <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
          <span>Sasummēts uz 100%</span>
          <button type="button" onClick={reset} className="text-[var(--accent)] hover:underline">
            Atiestatīt
          </button>
        </div>
      </div>
    </div>
  );
}

function WeightRow({
  criterion,
  value,
  onChange,
}: {
  criterion: (typeof CRITERIA)[number];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[var(--ink)]">{criterion.label}</span>
        <span className="text-xs tabular-nums text-[var(--ink-2)]">
          {Math.round(value * 100)}
        </span>
      </div>
      <Slider.Root
        className="relative flex items-center h-4 select-none touch-none"
        value={[value]}
        max={1}
        step={0.01}
        onValueChange={([v]) => v !== undefined && onChange(v)}
      >
        <Slider.Track className="bg-[var(--paper-2)] relative grow h-1 rounded-full">
          <Slider.Range className="absolute bg-[var(--ink)] h-full rounded-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-3.5 h-3.5 bg-[var(--accent)] rounded-full border border-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--paper)]"
          aria-label={criterion.label}
        />
      </Slider.Root>
    </div>
  );
}

function NormalizationBar({ normalized }: { normalized: Record<string, number> }) {
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-[var(--paper-2)]">
      {CRITERIA.map((c) => {
        const w = normalized[c.key] ?? 0;
        if (w === 0) return null;
        return (
          <div
            key={c.key}
            title={`${c.label}: ${Math.round(w * 100)}%`}
            style={{ width: `${w * 100}%`, backgroundColor: colorForCriterion(c.key as CriterionKey) }}
          />
        );
      })}
    </div>
  );
}
