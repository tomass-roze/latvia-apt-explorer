// Sanctioned write path for scraper output.
//
// Every scraper MUST go through writeScraped(). This guarantees:
//   - Stable JSON ordering (sorted keys + sorted arrays)
//   - Atomic temp-file-then-rename pattern
//   - Correct file location under data/scraped/ and data/runs/

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stableStringify } from '@/lib/json-stable';
import type { Project, ScraperRunResult } from '@/lib/schema';

const REPO_ROOT = process.cwd();
const SCRAPED_DIR = join(REPO_ROOT, 'data', 'scraped');
const RUNS_DIR = join(REPO_ROOT, 'data', 'runs');

async function atomicWrite(filepath: string, content: string): Promise<void> {
  await mkdir(dirname(filepath), { recursive: true });
  const tmp = `${filepath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filepath);
}

export interface WriteOptions {
  developer: string;
  projects: Project[];
  result: ScraperRunResult;
}

export async function writeScraped({ developer, projects, result }: WriteOptions): Promise<void> {
  await atomicWrite(join(SCRAPED_DIR, `${developer}.json`), stableStringify(projects));
  await atomicWrite(join(RUNS_DIR, `${developer}.json`), stableStringify(result));
}
