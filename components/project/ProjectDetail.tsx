'use client';

import type { Apartment, Project } from '@/lib/schema';
import { formatArea, formatCompletion, formatPrice, formatPricePerSqm } from '@/lib/format';
import { ScoreBreakdownDetail } from '@/components/scoring/ScoreBreakdown';
import { StatusNotes } from '@/components/project/StatusNotes';
import type { ScoreBreakdown } from '@/lib/scoring/score';

interface ProjectDetailProps {
  project: Project;
  apartments: Apartment[];
  score?: { breakdown: ScoreBreakdown; rank: number; total: number };
  onClose: () => void;
}

const STAGE_LABELS: Record<Project['buildStage'], string> = {
  'pre-sales': 'Iepriekšpārdošana',
  'under-construction': 'Būvniecībā',
  'nearly-complete': 'Drīzumā gatavs',
  ready: 'Gatavs',
};

const ENERGY_LABELS: Record<Project['energyClass'], string> = {
  'A++': 'A++', 'A+': 'A+', A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F',
  unknown: '—',
};

const CONSTRUCTION_LABELS: Record<Project['constructionType'], string> = {
  'concrete-monolith': 'Monolīts',
  panel: 'Panelis',
  brick: 'Ķieģelis',
  wood: 'Koks',
  other: 'Cits',
  unknown: '—',
};

const AVAILABILITY_LABELS: Record<Apartment['availability'], string> = {
  available: 'Pieejams',
  reserved: 'Rezervēts',
  sold: 'Pārdots',
};

export function ProjectDetail({ project, apartments, score, onClose }: ProjectDetailProps) {
  const sortedApts = [...apartments].sort((a, b) => {
    const aPrice = a.price.kind === 'amount' ? a.price.eur : Number.POSITIVE_INFINITY;
    const bPrice = b.price.kind === 'amount' ? b.price.eur : Number.POSITIVE_INFINITY;
    return aPrice - bPrice;
  });

  return (
    <aside className="w-full h-full bg-[var(--paper)] overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-[var(--line)] bg-[var(--paper)]">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          ← Atpakaļ
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Aizvērt"
          className="text-[var(--ink-3)] hover:text-[var(--ink)] text-lg leading-none px-1"
        >
          ×
        </button>
      </header>

      <div className="p-6 bg-[var(--paper-2)] space-y-3">
        <h2 className="font-display text-2xl">{project.name}</h2>
        <p className="text-sm text-[var(--ink-2)]">{project.address}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SmallChip>{STAGE_LABELS[project.buildStage]}</SmallChip>
          <SmallChip>Energoklase {ENERGY_LABELS[project.energyClass]}</SmallChip>
          <SmallChip>{CONSTRUCTION_LABELS[project.constructionType]}</SmallChip>
        </div>
        {score ? (
          <div className="mt-4">
            <ScoreBreakdownDetail
              breakdown={score.breakdown}
              rank={score.rank}
              total={score.total}
            />
          </div>
        ) : null}
      </div>

      <section className="px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-[var(--line)]">
        <Fact label="Pilsēta" value={project.city} />
        {project.district ? <Fact label="Apkaime" value={project.district} /> : null}
        <Fact label="Nodošana" value={formatCompletion(project.completion)} />
        <Fact label="Cena (parking)" value={formatPrice(project.parkingPrice)} />
        <Fact label="Cena (pagrabs)" value={formatPrice(project.storagePrice)} />
        {project.parkingSpotsTotal !== undefined ? (
          <Fact label="Autostāvvietas" value={String(project.parkingSpotsTotal)} />
        ) : null}
      </section>

      <section className="px-6 py-5">
        <h3 className="text-xs uppercase tracking-wider text-[var(--ink-3)] mb-3">
          Dzīvokļi ({apartments.length})
        </h3>
        {sortedApts.length === 0 ? (
          <p className="text-sm text-[var(--ink-3)]">
            Nav dzīvokļu, kas atbilst pašreizējiem filtriem.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {sortedApts.slice(0, 12).map((apt) => (
              <ApartmentRow key={apt.id} apt={apt} />
            ))}
          </ul>
        )}
      </section>

      <StatusNotes projectId={project.id} />

      <footer className="px-6 py-4 border-t border-[var(--line)] text-xs">
        <a
          href={project.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          ↗ Skatīt izstrādātāja lapā
        </a>
      </footer>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-0.5">
        {label}
      </div>
      <div className="text-sm text-[var(--ink)] tabular-nums">{value}</div>
    </div>
  );
}

function SmallChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="h-6 px-2 inline-flex items-center text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-md text-[var(--ink-2)]">
      {children}
    </span>
  );
}

function ApartmentRow({ apt }: { apt: Apartment }) {
  return (
    <li className="py-3 flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--ink)]">
          {apt.rooms} ist · {formatArea(apt.area)}
        </div>
        <div className="text-xs text-[var(--ink-2)]">
          {apt.floor}. stāvs
          {apt.totalFloors ? ` no ${apt.totalFloors}` : ''}
          {apt.hasBalcony ? ' · balkons' : ''}
        </div>
        <div className="text-[11px] mt-1 flex items-center gap-2">
          <AvailabilityBadge availability={apt.availability} />
          <a
            href={apt.deepLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            ↗ Skatīt
          </a>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-base tabular-nums text-[var(--ink)]">
          {apt.price.kind === 'amount' ? `€${apt.price.eur.toLocaleString('lv-LV')}` : '—'}
        </div>
        <div className="text-xs text-[var(--ink-3)] tabular-nums">
          {formatPricePerSqm(apt.pricePerSqm)}
        </div>
      </div>
    </li>
  );
}

function AvailabilityBadge({ availability }: { availability: Apartment['availability'] }) {
  const color =
    availability === 'available'
      ? 'var(--score-100)'
      : availability === 'reserved'
        ? 'var(--score-50)'
        : 'var(--ink-3)';
  return (
    <span
      className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border"
      style={{ borderColor: color, color }}
    >
      {AVAILABILITY_LABELS[availability]}
    </span>
  );
}
