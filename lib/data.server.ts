// Server-only data layer. Reads built JSON from `data/` via fs.readFile
// (not `import`) so Turbopack doesn't try to bundle the entire payload
// into the build manifest. Returns typed objects directly to Server Components.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  type Apartment,
  ApartmentSchema,
  type Project,
  ProjectSchema,
  type ScraperRunResult,
  ScraperRunResultSchema,
} from './schema';

const REPO_ROOT = process.cwd();
const SCRAPED_DIR = join(REPO_ROOT, 'data', 'scraped');
const RUNS_DIR = join(REPO_ROOT, 'data', 'runs');
const APARTMENTS_FLAT = join(REPO_ROOT, 'data', 'apartments.json');
const IMAGES_OVERRIDE = join(REPO_ROOT, 'data', 'overrides', 'project-images.json');

async function readJsonOr<T>(path: string, fallback: T): Promise<T | string> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Load every scraped project across all developers, full schema-validated. */
export async function loadProjects(): Promise<Project[]> {
  let files: string[];
  try {
    files = await readdir(SCRAPED_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const all: Project[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(SCRAPED_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    const result = ProjectSchema.array().safeParse(parsed);
    if (!result.success) {
      console.warn(`[data.server] ${file} failed schema:`, result.error.issues.slice(0, 3));
      continue;
    }
    all.push(...result.data);
  }
  return all;
}

/** Load every apartment (flat). Returns [] if the file doesn't exist yet. */
export async function loadApartments(): Promise<Apartment[]> {
  const raw = await readJsonOr<Apartment[]>(APARTMENTS_FLAT, []);
  if (typeof raw !== 'string') return raw;
  const parsed = JSON.parse(raw);
  const result = ApartmentSchema.array().safeParse(parsed);
  if (!result.success) {
    console.warn('[data.server] apartments.json failed schema:', result.error.issues.slice(0, 3));
    return [];
  }
  return result.data;
}

/**
 * Per-project hero image, hand-curated via `data/overrides/project-images.json`.
 * Keys are ProjectId strings (e.g., `yit--ef847be61b92b040`). Edit the file,
 * commit, push — Vercel auto-redeploy picks them up. URLs are hotlinked; CSP
 * already allows `img-src https:`. If a hotlink breaks the UI shows a neutral
 * placeholder.
 */
const ProjectImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  attribution: z.string().optional(),
});
export type ProjectImage = z.infer<typeof ProjectImageSchema>;

const ProjectImagesSchema = z.record(z.string(), ProjectImageSchema);

export async function loadProjectImages(): Promise<Record<string, ProjectImage>> {
  let raw: string;
  try {
    raw = await readFile(IMAGES_OVERRIDE, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    const parsed = ProjectImagesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(
        '[data.server] project-images.json failed schema:',
        parsed.error.issues.slice(0, 3),
      );
      return {};
    }
    return parsed.data;
  } catch (err) {
    console.warn('[data.server] project-images.json parse error:', err);
    return {};
  }
}

/** Load every per-developer scraper run report. */
export async function loadRuns(): Promise<ScraperRunResult[]> {
  let files: string[];
  try {
    files = await readdir(RUNS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const all: ScraperRunResult[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(RUNS_DIR, file), 'utf8');
    try {
      const result = ScraperRunResultSchema.safeParse(JSON.parse(raw));
      if (result.success) all.push(result.data);
    } catch {
      // ignore malformed run files
    }
  }
  return all;
}
