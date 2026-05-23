// The contract every per-developer scraper module must satisfy.
//
// Adding a new developer = create scrapers/<dev>/index.ts with a default
// export matching this shape, then add the literal to DEVELOPERS in
// lib/schema.ts. The matrix workflow and run-scraper script discover
// scrapers by name.

import type { Project, ScraperRunResult } from '@/lib/schema';

export interface ScrapeOutput {
  /** Validated Project records. May be empty if the scrape failed entirely. */
  projects: Project[];
  /** Run status & error detail for data/runs/<dev>.json. */
  result: ScraperRunResult;
}

export interface Scraper {
  /** Stable developer ID — must be present in DEVELOPERS literal. */
  readonly developer: string;
  /** Fetch + parse all currently-active projects for this developer. */
  fetchListings(): Promise<ScrapeOutput>;
}
