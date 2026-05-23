'use client';

import { BUILD_STAGES, type BuildStage } from '@/lib/schema';
import { FILTER_DEFAULTS } from '@/lib/filtering';
import { useFilters } from '@/lib/url-state/filters';

const ROOM_OPTIONS: { label: string; value: number }[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
];

const STAGE_LABELS: Record<BuildStage, string> = {
  'pre-sales': 'Iepriekšpārdošana',
  'under-construction': 'Būvniecībā',
  'nearly-complete': 'Drīzumā gatavs',
  ready: 'Gatavs',
};

interface FilterPanelProps {
  matchingApartments: number;
  matchingProjects: number;
}

export function FilterPanel({ matchingApartments, matchingProjects }: FilterPanelProps) {
  const [filters, setFilters] = useFilters();

  const toggleRoom = (n: number) => {
    const next = filters.rooms.includes(n)
      ? filters.rooms.filter((r) => r !== n)
      : [...filters.rooms, n].sort((a, b) => a - b);
    setFilters({ rooms: next });
  };

  const toggleStage = (s: BuildStage) => {
    const next = filters.buildStage.includes(s)
      ? filters.buildStage.filter((x) => x !== s)
      : [...filters.buildStage, s];
    setFilters({ buildStage: next });
  };

  const reset = () => {
    setFilters({
      rooms: FILTER_DEFAULTS.rooms,
      areaMin: null,
      areaMax: null,
      priceMin: null,
      priceMax: null,
      pricePerSqmMin: null,
      pricePerSqmMax: null,
      floorMin: null,
      floorMax: null,
      buildStage: FILTER_DEFAULTS.buildStage,
      includeReserved: FILTER_DEFAULTS.includeReserved,
    });
  };

  return (
    <aside className="w-full h-full bg-[var(--paper)] overflow-y-auto">
      <div className="p-5 space-y-5">
        <SectionLabel>Istabu skaits</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {ROOM_OPTIONS.map(({ label, value }) => (
            <Chip
              key={value}
              active={filters.rooms.includes(value)}
              onClick={() => toggleRoom(value)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <Divider />

        <SectionLabel>Platība (m²)</SectionLabel>
        <RangeInputs
          minValue={filters.areaMin}
          maxValue={filters.areaMax}
          onMin={(v) => setFilters({ areaMin: v })}
          onMax={(v) => setFilters({ areaMax: v })}
          minPlaceholder="no"
          maxPlaceholder="līdz"
        />

        <Divider />

        <SectionLabel>Kopējā cena (€)</SectionLabel>
        <RangeInputs
          minValue={filters.priceMin}
          maxValue={filters.priceMax}
          onMin={(v) => setFilters({ priceMin: v })}
          onMax={(v) => setFilters({ priceMax: v })}
          minPlaceholder="no"
          maxPlaceholder="līdz"
          step={1000}
        />

        <Divider />

        <SectionLabel>Cena par m² (€)</SectionLabel>
        <RangeInputs
          minValue={filters.pricePerSqmMin}
          maxValue={filters.pricePerSqmMax}
          onMin={(v) => setFilters({ pricePerSqmMin: v })}
          onMax={(v) => setFilters({ pricePerSqmMax: v })}
          minPlaceholder="no"
          maxPlaceholder="līdz"
        />

        <Divider />

        <SectionLabel>Stāvs</SectionLabel>
        <RangeInputs
          minValue={filters.floorMin}
          maxValue={filters.floorMax}
          onMin={(v) => setFilters({ floorMin: v === null ? null : Math.round(v) })}
          onMax={(v) => setFilters({ floorMax: v === null ? null : Math.round(v) })}
          minPlaceholder="no"
          maxPlaceholder="līdz"
        />

        <Divider />

        <SectionLabel>Būvniecības stadija</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {BUILD_STAGES.map((s) => (
            <Chip key={s} active={filters.buildStage.includes(s)} onClick={() => toggleStage(s)}>
              {STAGE_LABELS[s]}
            </Chip>
          ))}
        </div>

        <Divider />

        <label className="flex items-center justify-between text-sm text-[var(--ink-2)] cursor-pointer">
          <span>Rādīt rezervētos</span>
          <input
            type="checkbox"
            checked={filters.includeReserved}
            onChange={(e) => setFilters({ includeReserved: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--paper)] px-5 py-3 flex items-center justify-between text-xs">
        <span className="tabular-nums text-[var(--ink-2)]">
          {matchingApartments} dzīvokļi · {matchingProjects} projekti
        </span>
        <button
          type="button"
          onClick={reset}
          className="text-[var(--accent)] hover:underline"
        >
          Notīrīt
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2">{children}</h3>
  );
}

function Divider() {
  return <hr className="border-[var(--line)]" />;
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-3 rounded-md text-sm transition-colors border ${
        active
          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--ink)]'
          : 'bg-transparent border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
      }`}
    >
      {children}
    </button>
  );
}

function RangeInputs({
  minValue,
  maxValue,
  onMin,
  onMax,
  minPlaceholder,
  maxPlaceholder,
  step = 1,
}: {
  minValue: number | null;
  maxValue: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
  minPlaceholder: string;
  maxPlaceholder: string;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={minValue ?? ''}
        onChange={(e) => onMin(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={minPlaceholder}
        step={step}
        className="w-1/2 h-9 px-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent)]"
      />
      <span className="text-[var(--ink-3)] text-xs">–</span>
      <input
        type="number"
        inputMode="numeric"
        value={maxValue ?? ''}
        onChange={(e) => onMax(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={maxPlaceholder}
        step={step}
        className="w-1/2 h-9 px-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}
