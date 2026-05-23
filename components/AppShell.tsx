'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DataFreshness, StalenessBanner } from '@/components/map/DataFreshness';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { ProjectDetail } from '@/components/project/ProjectDetail';
import { WeightSliders } from '@/components/scoring/WeightSliders';
import { SettingsMenu } from '@/components/settings/SettingsMenu';
import type { ProjectImage } from '@/lib/data.server';
import { FILTER_DEFAULTS, filterApartments, filtersAreDefault } from '@/lib/filtering';
import { usePersonalState } from '@/lib/personal/hooks';
import type { Apartment, Project, ScraperRunResult, Status } from '@/lib/schema';
import { buildScoringContext } from '@/lib/scoring/context';
import { groupByProjectId, rankProjects } from '@/lib/scoring/rank';
import { normalizeWeights } from '@/lib/scoring/registry';
import { useFilters, useWeights } from '@/lib/url-state/filters';

interface MapProject {
  id: string;
  name: string;
  developer: string;
  location: { lat: number; lng: number };
  buildStage: string;
  apartmentCount: number;
  score?: number;
  percentile?: number;
  status?: Status | null;
}

interface MapProps {
  projects: MapProject[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

// MapLibre touches `window` at module-eval time — only `ssr: false` here.
// Named MapCanvas to avoid shadowing the built-in `Map` constructor.
const MapCanvas = dynamic(() => import('@/components/map/Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[var(--paper-2)]">
      <p className="text-sm text-[var(--ink-3)]">Ielādē karti…</p>
    </div>
  ),
}) as (props: MapProps) => ReactNode;

interface AppShellProps {
  projects: Project[];
  apartments: Apartment[];
  runs: ScraperRunResult[];
  images: Record<string, ProjectImage>;
}

export default function AppShell({ projects, apartments, runs, images }: AppShellProps) {
  const [filters, setFilters] = useFilters();
  const [weights] = useWeights();
  const { getEffectiveStatus } = usePersonalState();
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

  // Map pins: include EVERY project, not just the ones with matching apartments.
  // Hepsor/Pillar/Invego scrape project-level only (no apartments), so they'd
  // be invisible if we filtered to `ranked` alone. YIT/Bonava projects that
  // happen to have zero apartments (sold-out, pre-sales without listed units)
  // would similarly disappear. Unranked projects still show as pins — just
  // neutral grey instead of a score gradient.
  //
  // Rule: a project drops off the map only when the user has applied apartment-
  // level filters (rooms, area, price, etc.) and the project HAS scraped
  // apartments that all fail those filters. Empty-apartments projects always
  // ride along.
  const rankedById = useMemo(() => new Map(ranked.map((r) => [r.projectId, r])), [ranked]);
  const apartmentLevelFilterActive = useMemo(
    () =>
      filters.rooms.length > 0 ||
      filters.areaMin !== null ||
      filters.areaMax !== null ||
      filters.priceMin !== null ||
      filters.priceMax !== null ||
      filters.pricePerSqmMin !== null ||
      filters.pricePerSqmMax !== null ||
      filters.floorMin !== null ||
      filters.floorMax !== null,
    [filters],
  );

  const visibleProjects = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      developer: string;
      location: { lat: number; lng: number };
      buildStage: string;
      apartmentCount: number;
      score?: number;
      percentile?: number;
      status: Status | null;
    }> = [];
    for (const project of projectsById.values()) {
      // Project-level build-stage filter applies to ALL pins.
      if (filters.buildStage.length > 0 && !filters.buildStage.includes(project.buildStage)) {
        continue;
      }
      const r = rankedById.get(project.id);
      if (r) {
        list.push({
          id: project.id,
          name: project.name,
          developer: project.developer,
          location: project.location,
          buildStage: project.buildStage,
          apartmentCount: r.matchingApartmentCount,
          score: r.best.total,
          percentile: r.percentile,
          status: getEffectiveStatus(project.id),
        });
      } else if (project.apartments.length === 0 && !apartmentLevelFilterActive) {
        // Project-level-only data (Hepsor / Pillar / Invego, or scraped projects
        // without listed units). Show pin with neutral styling.
        list.push({
          id: project.id,
          name: project.name,
          developer: project.developer,
          location: project.location,
          buildStage: project.buildStage,
          apartmentCount: 0,
          status: getEffectiveStatus(project.id),
        });
      }
      // else: project has apartments but none match the user's apartment-level
      // filter — hide it (this is the filter doing its job).
    }
    return list;
  }, [projectsById, rankedById, getEffectiveStatus, filters.buildStage, apartmentLevelFilterActive]);

  const selectedProject = filters.p ? (projectsById.get(filters.p) ?? null) : null;
  const selectedApartments = selectedProject
    ? (apartmentsByProject.get(selectedProject.id) ?? [])
    : [];
  const selectedRanking = selectedProject
    ? ranked.find((r) => r.projectId === selectedProject.id)
    : undefined;

  const totalApartments = filteredApartments.length;
  const totalProjects = visibleProjects.length;
  const showEmptyState = totalProjects === 0;

  // Sidebar collapse state. Both default open. The widths used here MUST match
  // the design — left filter 340px, right detail/weights 420px. Closing slides
  // a panel to width 0 via CSS transition; a small reopen button overlays the
  // map's corresponding edge.
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Selecting a pin while the right panel is collapsed would otherwise hide
  // the detail the user just requested — so we auto-reopen the panel.
  useEffect(() => {
    if (selectedProject && !rightOpen) setRightOpen(true);
  }, [selectedProject, rightOpen]);

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-14 px-6 flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl tracking-tight">Latvijas dzīvokļu karte</h1>
          <span className="text-[var(--ink-3)] text-xs">Jauno projektu apkopojums</span>
        </div>
        <div className="flex items-center gap-4">
          <DataFreshness runs={runs} />
          <span className="text-xs text-[var(--ink-3)] tabular-nums">
            {totalApartments} dzīvokļi · {totalProjects} projekti
          </span>
          <Link
            href="/about"
            className="text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            Par
          </Link>
          <SettingsMenu />
        </div>
      </header>

      <main className="flex-1 flex min-h-0">
        <div
          className={`flex flex-col shrink-0 ${leftOpen ? 'border-r border-[var(--line)]' : ''} min-h-0 overflow-hidden transition-[width] duration-200`}
          style={{ width: leftOpen ? 340 : 0 }}
        >
          <FilterPanel
            matchingApartments={totalApartments}
            matchingProjects={totalProjects}
          />
        </div>

        <div className="flex-1 relative min-w-0">
          <MapCanvas
            projects={visibleProjects}
            selectedId={filters.p}
            onSelect={(id) => setFilters({ p: id })}
          />
          <StalenessBanner runs={runs} />
          {/* Sidebar collapse/expand tabs sit on the map edges so they don't
              overlap with the panels' own content. */}
          <SidebarToggle
            side="left"
            open={leftOpen}
            onToggle={() => setLeftOpen((v) => !v)}
            label={leftOpen ? 'Aizvērt filtrus' : 'Filtri'}
          />
          <SidebarToggle
            side="right"
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            label={
              rightOpen
                ? 'Aizvērt paneli'
                : selectedProject
                  ? 'Projekta dati'
                  : 'Svari'
            }
          />
          {showEmptyState ? (
            <EmptyState onReset={() => resetFilters(setFilters)} hadFilters={!filtersAreDefault(filters)} />
          ) : null}
        </div>

        <div
          className={`flex flex-col shrink-0 ${rightOpen ? 'border-l border-[var(--line)]' : ''} min-h-0 overflow-hidden transition-[width] duration-200`}
          style={{ width: rightOpen ? 420 : 0 }}
        >
          {selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              apartments={selectedApartments}
              {...(images[selectedProject.id] ? { image: images[selectedProject.id]! } : {})}
              {...(selectedRanking
                ? {
                    score: {
                      breakdown: selectedRanking.best,
                      rank: selectedRanking.rank,
                      total: ranked.length,
                    },
                  }
                : {})}
              onClose={() => setFilters({ p: null })}
            />
          ) : (
            <WeightSliders />
          )}
        </div>
      </main>

      <footer className="px-6 py-3 border-t border-[var(--line)] text-xs text-[var(--ink-3)] flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
        <span>© OpenStreetMap kartes dati · © CARTO basemaps</span>
        <span>Personīgie dati glabājas tikai jūsu pārlūkā — nav sīkdatņu, nav izsekošanas.</span>
      </footer>
    </div>
  );
}

/**
 * Vertical tab pinned to the map's left or right edge. Doubles as the
 * collapse trigger (when sidebar is open) and the reopen trigger (when
 * sidebar is closed) — the chevron direction conveys which.
 */
function SidebarToggle({
  side,
  open,
  onToggle,
  label,
}: {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  const Icon = side === 'left' ? (open ? ChevronLeft : ChevronRight) : open ? ChevronRight : ChevronLeft;
  const position = side === 'left' ? 'left-0 rounded-r-md border-l-0' : 'right-0 rounded-l-md border-r-0';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`absolute top-1/2 -translate-y-1/2 z-10 h-12 w-6 grid place-items-center bg-[var(--paper)]/95 border border-[var(--line)] hover:border-[var(--ink-3)] text-[var(--ink-2)] shadow-sm ${position}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function resetFilters(setFilters: ReturnType<typeof useFilters>[1]) {
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
}

function EmptyState({ onReset, hadFilters }: { onReset: () => void; hadFilters: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="pointer-events-auto bg-[var(--paper)]/95 border border-[var(--line)] rounded-lg px-6 py-5 max-w-sm text-center backdrop-blur-sm">
        <h2 className="font-display text-lg mb-2">Nekas neatbilst</h2>
        <p className="text-sm text-[var(--ink-2)] mb-4">
          {hadFilters
            ? 'Pašreizējie filtri izslēdz visus projektus. Visbiežāk to izraisa cena vai stāvs.'
            : 'Vēl nav projektu. Palaid pnpm scrape yit, lai sāktu.'}
        </p>
        {hadFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="h-10 px-4 rounded-md bg-[var(--ink)] text-[var(--paper)] text-sm hover:bg-[var(--accent)] transition-colors"
          >
            Notīrīt visus filtrus
          </button>
        ) : null}
      </div>
    </div>
  );
}
