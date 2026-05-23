// Server-only data layer. Reads built JSON from `data/` via fs.readFile
// (not `import`) so Turbopack doesn't try to bundle the entire payload
// into the build manifest. Returns typed objects directly to Server Components.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Apartment, ApartmentSchema, type Project, ProjectSchema } from './schema';

const REPO_ROOT = process.cwd();
const SCRAPED_DIR = join(REPO_ROOT, 'data', 'scraped');
const APARTMENTS_FLAT = join(REPO_ROOT, 'data', 'apartments.json');

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
