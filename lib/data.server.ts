// Server-only data layer. Reads built JSON from `data/` via fs.readFile
// (not `import`) so Turbopack doesn't try to bundle the entire payload
// into the build manifest. Returns typed objects directly to Server Components.

import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  BUILD_STAGES,
  CITIES,
  CONSTRUCTION_TYPES,
  DEVELOPERS,
  ENERGY_CLASSES,
  ProjectIdSchema,
} from './schema';

const REPO_ROOT = process.cwd();
const PROJECTS_FILE = join(REPO_ROOT, 'data', 'projects.json');

// Local mirror of the slim shape emitted by scripts/build-payload.ts.
// Kept in sync with that file — both derive from the canonical Project schema.
export const SlimProjectSchema = z.object({
  id: ProjectIdSchema,
  developer: z.enum(DEVELOPERS),
  name: z.string(),
  city: z.enum(CITIES),
  district: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    source: z.enum(['vzd', 'janas-seta', 'nominatim', 'manual']),
  }),
  buildStage: z.enum(BUILD_STAGES),
  energyClass: z.enum(ENERGY_CLASSES),
  constructionType: z.enum(CONSTRUCTION_TYPES),
  sourceUrl: z.string().url(),
  apartmentCount: z.number().int().nonnegative(),
  scrapedAt: z.string().datetime(),
});
export type SlimProject = z.infer<typeof SlimProjectSchema>;

export async function loadSlimProjects(): Promise<SlimProject[]> {
  try {
    const raw = await readFile(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const result = SlimProjectSchema.array().safeParse(parsed);
    if (!result.success) {
      console.warn('[data.server] projects.json failed schema:', result.error.issues.slice(0, 3));
      return [];
    }
    return result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
