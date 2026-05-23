// Build-time payload split: data/scraped/*.json → slim projects.json + per-project apartments/*.json + manifest.
//
// This is the seam between scraper output and what the frontend ships:
//   - data/projects.json (slim) is embedded in the initial HTML for the map (~15KB compressed)
//   - data/apartments/<projectId>.json (full) is lazy-fetched on pin click
//   - data/manifest.json lists every projectId so CI can assert consistency
//
// Atomic: all writes go through a temp file + rename. A half-written state is impossible.

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stableStringify } from '@/lib/json-stable';
import { type Project, ProjectSchema } from '@/lib/schema';

const REPO_ROOT = process.cwd();
const SCRAPED_DIR = join(REPO_ROOT, 'data', 'scraped');
const APARTMENTS_DIR = join(REPO_ROOT, 'data', 'apartments');
const PROJECTS_FILE = join(REPO_ROOT, 'data', 'projects.json');
const APARTMENTS_FLAT_FILE = join(REPO_ROOT, 'data', 'apartments.json');
const MANIFEST_FILE = join(REPO_ROOT, 'data', 'manifest.json');

interface SlimProject {
  id: string;
  developer: string;
  name: string;
  city: string;
  district?: string;
  location: Project['location'];
  buildStage: Project['buildStage'];
  energyClass: Project['energyClass'];
  constructionType: Project['constructionType'];
  sourceUrl: string;
  apartmentCount: number;
  scrapedAt: string;
}

interface Manifest {
  builtAt: string;
  projectIds: string[];
  totalApartments: number;
}

async function atomicWrite(filepath: string, content: string): Promise<void> {
  await mkdir(dirname(filepath), { recursive: true });
  const tmp = `${filepath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filepath);
}

function slim(p: Project): SlimProject {
  const out: SlimProject = {
    id: p.id,
    developer: p.developer,
    name: p.name,
    city: p.city,
    location: p.location,
    buildStage: p.buildStage,
    energyClass: p.energyClass,
    constructionType: p.constructionType,
    sourceUrl: p.sourceUrl,
    apartmentCount: p.apartments.length,
    scrapedAt: p.scrapedAt,
  };
  if (p.district) out.district = p.district;
  return out;
}

async function readScrapedDir(): Promise<Project[]> {
  const all: Project[] = [];
  let files: string[];
  try {
    files = await readdir(SCRAPED_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(SCRAPED_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    // Re-validate at the build boundary — a hand-edited override could ship garbage otherwise.
    const result = ProjectSchema.array().safeParse(parsed);
    if (!result.success) {
      console.error(`[build-payload] schema mismatch in ${file}:`, result.error.issues.slice(0, 5));
      throw new Error(`Build aborted: ${file} failed schema validation.`);
    }
    all.push(...result.data);
  }
  return all;
}

async function main(): Promise<void> {
  const projects = await readScrapedDir();
  console.log(`[build-payload] loaded ${projects.length} projects from ${SCRAPED_DIR}`);

  // Slim projection (per-project)
  await atomicWrite(PROJECTS_FILE, stableStringify(projects.map(slim)));

  // Per-project apartments (always write, even if empty, for predictability)
  const apartmentCounts = new Map<string, number>();
  for (const p of projects) {
    await atomicWrite(join(APARTMENTS_DIR, `${p.id}.json`), stableStringify(p.apartments));
    apartmentCounts.set(p.id, p.apartments.length);
  }

  // Flat apartments file — small enough at MVP scale (~100KB for 5k apts) for
  // the client to fetch once and run filtering + scoring across all of them
  // without lazy-loading per pin. Revisit when the dataset grows.
  const flatApartments = projects.flatMap((p) => p.apartments);
  await atomicWrite(APARTMENTS_FLAT_FILE, stableStringify(flatApartments));

  const manifest: Manifest = {
    builtAt: new Date().toISOString(),
    projectIds: projects.map((p) => p.id).sort(),
    totalApartments: projects.reduce((sum, p) => sum + p.apartments.length, 0),
  };
  await atomicWrite(MANIFEST_FILE, stableStringify(manifest));

  // Consistency check (also enforced in CI).
  const filesAfter = await readdir(APARTMENTS_DIR);
  const jsonCount = filesAfter.filter((f) => f.endsWith('.json')).length;
  if (jsonCount !== manifest.projectIds.length) {
    console.warn(
      `[build-payload] manifest lists ${manifest.projectIds.length} projects but ${jsonCount} apartment files exist (may include stale files from earlier runs).`,
    );
  }
  console.log(
    `[build-payload] wrote projects.json (${projects.length} items), apartments/*.json (${jsonCount} files), manifest.json`,
  );
}

main().catch((err) => {
  console.error('[build-payload] fatal:', err);
  process.exit(1);
});
