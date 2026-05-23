'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ScoreBreakdownTile } from '@/components/scoring/ScoreBreakdown';
import { formatArea, formatCompletion, formatPrice, formatPricePerSqm } from '@/lib/format';
import { usePersonalState } from '@/lib/personal/hooks';
import type { Apartment, Project, ProjectId } from '@/lib/schema';
import { buildScoringContext } from '@/lib/scoring/context';
import { groupByProjectId, rankProjects } from '@/lib/scoring/rank';
import { normalizeWeights } from '@/lib/scoring/registry';
import { useFilters, useWeights } from '@/lib/url-state/filters';
import { filterApartments } from '@/lib/filtering';

interface CompareTableProps {
  projects: Project[];
  apartments: Apartment[];
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

export function CompareTable({ projects, apartments }: CompareTableProps) {
  const { state, toggleSaved } = usePersonalState();
  const [filters] = useFilters();
  const [weights] = useWeights();
  const normalizedWeights = useMemo(() => normalizeWeights(weights), [weights]);

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const filteredApartments = useMemo(
    () => filterApartments(apartments, projectsById, filters),
    [apartments, projectsById, filters],
  );

  const apartmentsByProject = useMemo(
    () => groupByProjectId(filteredApartments),
    [filteredApartments],
  );

  const ctx = useMemo(
    () => buildScoringContext({ filteredApartments, projectsById }),
    [filteredApartments, projectsById],
  );

  const ranked = useMemo(
    () => rankProjects(projectsById, apartmentsByProject, ctx, normalizedWeights),
    [projectsById, apartmentsByProject, ctx, normalizedWeights],
  );

  const savedProjects = state.saved
    .map((id) => projectsById.get(id))
    .filter((p): p is Project => p !== undefined)
    .slice(0, 3); // cap at 3 for visual comparison

  if (savedProjects.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6 text-center">
        <h2 className="font-display text-2xl mb-3">Vēl nav projektu salīdzināšanai</h2>
        <p className="text-[var(--ink-2)] mb-6">
          Atver kādu projektu kartē un noklikšķini uz „★ Salīdzināt", lai pievienotu šo
          projektu salīdzinājuma sarakstam.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 px-4 items-center rounded-md bg-[var(--ink)] text-[var(--paper)] text-sm hover:bg-[var(--accent)] transition-colors"
        >
          Atpakaļ uz karti
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--paper)] w-[200px] p-3 text-left text-xs uppercase tracking-wider text-[var(--ink-3)] border-b border-[var(--line)]">
              &nbsp;
            </th>
            {savedProjects.map((p) => {
              const rank = ranked.find((r) => r.projectId === p.id);
              return (
                <th
                  key={p.id}
                  className="min-w-[280px] p-4 text-left align-top border-b border-l border-[var(--line)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-display text-lg">{p.name}</h3>
                    <button
                      type="button"
                      onClick={() => toggleSaved(p.id)}
                      aria-label="Noņemt"
                      className="text-[var(--ink-3)] hover:text-[var(--ink)] text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-[var(--ink-2)] mb-3">{p.address}</div>
                  {rank ? (
                    <ScoreBreakdownTile breakdown={rank.best} />
                  ) : (
                    <div className="text-xs text-[var(--ink-3)]">Nav vērtējuma</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="text-sm">
          <SectionRowGroup label="Vērtējums">
            <Row label="Rangs">
              {savedProjects.map((p) => {
                const r = ranked.find((x) => x.projectId === p.id);
                return (
                  <Cell key={p.id} value={r ? `#${r.rank} no ${ranked.length}` : '—'} />
                );
              })}
            </Row>
          </SectionRowGroup>

          <SectionRowGroup label="Cena">
            <Row label="Lētākais dzīvoklis">
              {savedProjects.map((p) => (
                <CheapestPrice
                  key={p.id}
                  apartments={apartmentsByProject.get(p.id) ?? []}
                />
              ))}
            </Row>
            <Row label="Cena par m² (lētākais)">
              {savedProjects.map((p) => (
                <CheapestPricePerSqm
                  key={p.id}
                  apartments={apartmentsByProject.get(p.id) ?? []}
                />
              ))}
            </Row>
          </SectionRowGroup>

          <SectionRowGroup label="Ēka">
            <Row label="Stāvoklis">
              {savedProjects.map((p) => <Cell key={p.id} value={STAGE_LABELS[p.buildStage]} />)}
            </Row>
            <Row label="Nodošana">
              {savedProjects.map((p) => <Cell key={p.id} value={formatCompletion(p.completion)} />)}
            </Row>
            <Row label="Energoklase">
              {savedProjects.map((p) => <Cell key={p.id} value={ENERGY_LABELS[p.energyClass]} />)}
            </Row>
            <Row label="Būvtips">
              {savedProjects.map((p) => <Cell key={p.id} value={CONSTRUCTION_LABELS[p.constructionType]} />)}
            </Row>
          </SectionRowGroup>

          <SectionRowGroup label="Atrašanās">
            <Row label="Pilsēta">
              {savedProjects.map((p) => <Cell key={p.id} value={p.city} />)}
            </Row>
            <Row label="Apkaime">
              {savedProjects.map((p) => <Cell key={p.id} value={p.district ?? '—'} />)}
            </Row>
          </SectionRowGroup>

          <SectionRowGroup label="Personīgie">
            <Row label="Statuss">
              {savedProjects.map((p) => (
                <Cell key={p.id} value={state.status[p.id] ?? '—'} />
              ))}
            </Row>
            <Row label="Dzīvokļi pēc filtra">
              {savedProjects.map((p) => (
                <Cell
                  key={p.id}
                  value={`${(apartmentsByProject.get(p.id) ?? []).length}`}
                />
              ))}
            </Row>
          </SectionRowGroup>
        </tbody>
      </table>
    </div>
  );
}

function SectionRowGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="sticky left-0 bg-[var(--paper-2)] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ink-3)]"
        >
          {label}
        </td>
      </tr>
      {children}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="sticky left-0 bg-[var(--paper)] px-3 py-2 text-left font-normal text-xs text-[var(--ink-3)] border-b border-[var(--line)] align-top">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Cell({ value }: { value: string }) {
  return (
    <td className="px-4 py-2 border-b border-l border-[var(--line)] tabular-nums">
      {value}
    </td>
  );
}

function CheapestPrice({ apartments }: { apartments: Apartment[] }) {
  const cheapest = apartments
    .filter((a): a is Apartment & { price: { kind: 'amount'; eur: number; vatIncluded: boolean } } => a.price.kind === 'amount')
    .sort((a, b) => a.price.eur - b.price.eur)[0];
  return <Cell value={cheapest ? formatPrice(cheapest.price) : '—'} />;
}

function CheapestPricePerSqm({ apartments }: { apartments: Apartment[] }) {
  const cheapest = apartments
    .filter((a): a is Apartment & { pricePerSqm: { kind: 'amount'; eur: number; vatIncluded: boolean } } => a.pricePerSqm.kind === 'amount')
    .sort((a, b) => a.pricePerSqm.eur - b.pricePerSqm.eur)[0];
  return <Cell value={cheapest ? formatPricePerSqm(cheapest.pricePerSqm) : '—'} />;
}
