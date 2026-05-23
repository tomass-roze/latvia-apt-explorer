'use client';

import { useState } from 'react';
import type { Apartment, Project } from '@/lib/schema';
import type { ProjectImage } from '@/lib/data.server';
import {
  DEVELOPER_LABELS,
  formatArea,
  formatAreaRange,
  formatCompletion,
  formatPrice,
  formatPriceRange,
  formatPricePerSqm,
  formatPricePerSqmRange,
  formatRoomsRange,
} from '@/lib/format';
import { AvailabilityBreakdown } from '@/components/project/AvailabilityBreakdown';
import { ScoreBreakdownDetail } from '@/components/scoring/ScoreBreakdown';
import { StatusNotes } from '@/components/project/StatusNotes';
import type { ScoreBreakdown } from '@/lib/scoring/score';

interface ProjectDetailProps {
  project: Project;
  apartments: Apartment[];
  image?: ProjectImage;
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

export function ProjectDetail({
  project,
  apartments,
  image,
  score,
  onClose,
}: ProjectDetailProps) {
  // Apartments visible inside the panel: filtered subset (used by the list +
  // summary's "matching this filter" annotation, if we ever add one).
  const sortedApts = [...apartments].sort((a, b) => {
    const aPrice = a.price.kind === 'amount' ? a.price.eur : Number.POSITIVE_INFINITY;
    const bPrice = b.price.kind === 'amount' ? b.price.eur : Number.POSITIVE_INFINITY;
    return aPrice - bPrice;
  });

  // Ranges + breakdown use the PROJECT'S full inventory, not the filter-narrowed
  // list — the summary describes the project, not a query result.
  const allApts = project.apartments;
  const areaRange = formatAreaRange(allApts);
  const priceRange = formatPriceRange(allApts);
  const pricePerSqmRange = formatPricePerSqmRange(allApts);
  const roomsRange = formatRoomsRange(allApts);

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

      {image ? <HeroImage image={image} fallbackAlt={project.name} /> : null}

      <div className="p-6 bg-[var(--paper-2)] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl leading-tight">{project.name}</h2>
        </div>
        <p className="text-sm text-[var(--ink-2)]">{project.address}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SmallChip strong>{DEVELOPER_LABELS[project.developer]}</SmallChip>
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

      {/* Summary: project-wide ranges + availability breakdown. */}
      {(areaRange || priceRange || allApts.length > 0) ? (
        <section className="px-6 py-5 border-b border-[var(--line)] space-y-4">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
            Kopsavilkums
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {roomsRange ? (
              <SummaryRow label="Istabas" value={`${roomsRange} ist`} />
            ) : null}
            {areaRange ? <SummaryRow label="Platība" value={areaRange} /> : null}
            {priceRange ? <SummaryRow label="Cena" value={priceRange} /> : null}
            {pricePerSqmRange ? (
              <SummaryRow label="Cena par m²" value={pricePerSqmRange} />
            ) : null}
          </dl>
          <AvailabilityBreakdown apartments={allApts} />
        </section>
      ) : null}

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
          Dzīvokļi pēc filtra ({apartments.length})
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

function HeroImage({ image, fallbackAlt }: { image: ProjectImage; fallbackAlt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="aspect-[16/9] w-full bg-[var(--paper-2)] flex items-center justify-center">
        <span className="text-xs text-[var(--ink-3)]">Attēls nav pieejams</span>
      </div>
    );
  }
  return (
    <div className="aspect-[16/9] w-full bg-[var(--paper-2)] overflow-hidden">
      {/* biome-ignore lint/performance/noImgElement: hotlinked from developer CDN; next/image would proxy through Vercel's image optimizer and hit free-tier limits. */}
      <img
        src={image.url}
        alt={image.alt ?? fallbackAlt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs text-[var(--ink-3)] uppercase tracking-wider self-baseline">
        {label}
      </dt>
      <dd className="text-sm text-[var(--ink)] tabular-nums">{value}</dd>
    </>
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

function SmallChip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`h-6 px-2 inline-flex items-center text-[11px] rounded-md border ${
        strong
          ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--paper)]'
          : 'bg-[var(--paper)] border-[var(--line)] text-[var(--ink-2)]'
      }`}
    >
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
