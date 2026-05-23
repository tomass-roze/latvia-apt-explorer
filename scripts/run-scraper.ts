// Entrypoint for the nightly GitHub Actions matrix: `pnpm scrape <developer>`.
//
// Adds a new developer:
//   1. Register the scraper in the SCRAPERS map below.
//   2. Add the literal to DEVELOPERS in lib/schema.ts.
//   3. Add the developer to the matrix list in .github/workflows/scrape.yml.

import { bonavaScraper } from '@/scrapers/bonava';
import { pillarScraper } from '@/scrapers/pillar';
import { yitScraper } from '@/scrapers/yit';
import type { Scraper } from '@/scrapers/base/interface';
import { writeScraped } from '@/scrapers/base/io';

const SCRAPERS: Record<string, Scraper> = {
  bonava: bonavaScraper,
  pillar: pillarScraper,
  yit: yitScraper,
};

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: pnpm scrape <developer>');
    console.error(`Available: ${Object.keys(SCRAPERS).join(', ')}`);
    process.exit(1);
  }
  const scraper = SCRAPERS[arg];
  if (!scraper) {
    console.error(`Unknown developer: ${arg}`);
    console.error(`Available: ${Object.keys(SCRAPERS).join(', ')}`);
    process.exit(1);
  }

  console.log(`[scrape] starting ${scraper.developer}`);
  const { projects, result } = await scraper.fetchListings();
  await writeScraped({ developer: scraper.developer, projects, result });

  console.log(`[scrape] ${scraper.developer}: status=${result.status} projects=${projects.length}`);
  if (result.status !== 'ok') {
    console.warn(`[scrape] ${result.errors.length} errors recorded — see data/runs/${scraper.developer}.json`);
  }
  // Failed scrapes still exit 0 so the workflow can commit the run report;
  // a separate CI step can flag failures based on the JSON.
}

main().catch((err) => {
  console.error('[scrape] fatal:', err);
  process.exit(2);
});
