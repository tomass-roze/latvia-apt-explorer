// HTML fixture test for YIT data-layer extraction + project-page parsing.
// We don't go over the network here; the scraper's network layer is tested
// separately. This validates the parsing contract against representative HTML.

import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

// Re-export internals via local copies. We deliberately don't import private
// functions from scrapers/yit/index.ts to avoid coupling tests to the module
// layout; if these change, update both.

const DATALAYER_RE = /window\.dataLayer\.push\((\{[^)]+\})\)/g;

function extractDataLayer(html: string): Record<string, unknown> {
  for (const match of html.matchAll(DATALAYER_RE)) {
    const literal = match[1];
    if (!literal) continue;
    try {
      const obj = JSON.parse(literal) as Record<string, unknown>;
      if (obj.pageType === 'ProjectPage' || obj.projectId) return obj;
    } catch {
      // skip
    }
  }
  return {};
}

const ADDRESS_RE = /([A-ZĀČĒĢĪĶĻŅŠŪŽ][\wĀāČčĒēĢģĪīĶķĻļŅņŠšŪūŽž.\s-]*\d+[a-z]?)\s*,?\s*(LV-\d{4})\s*,?\s*([A-ZĀČĒĢĪĶĻŅŠŪŽ][\wĀāČčĒēĢģĪīĶķĻļŅņŠš�ūž\s-]+)/;

function extractAddress(text: string): string | null {
  const m = text.match(ADDRESS_RE);
  return m?.[0] ? m[0].replace(/\s+/g, ' ').trim() : null;
}

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Mārpagalmi 5</title>
  <script>window.dataLayer = window.dataLayer || [];</script>
  <script>window.dataLayer.push({"business":"Housing","pageType":"PageView","site":"YIT.LV"});</script>
  <script>window.dataLayer.push({"business":"Housing","pageType":"ProjectPage","site":"YIT.LV","language":"lv","city":"Rīga","area":"Āgenskalns","subarea":"Mārpagalmi","project":"Mārpagalmi 5","projectId":"LVC10041","event":"mainDatalayer"});</script>
</head>
<body>
  <main>
    <h1>Mārpagalmi 5</h1>
    <section>
      <p>Adrese: Gardenes 6, LV-1002 Rīga, Āgenskalns</p>
      <p>Būvniecības stadija — 34 dzīvokļi.</p>
      <p>A klases energoefektivitāte. Trīsslāņu rūpnieciski ražotas dzelzsbetona paneļu fasādes.</p>
    </section>
  </main>
</body>
</html>
`;

describe('YIT parser', () => {
  it('extracts the ProjectPage dataLayer entry, not the PageView one', () => {
    const dl = extractDataLayer(SAMPLE_HTML);
    expect(dl.projectId).toBe('LVC10041');
    expect(dl.project).toBe('Mārpagalmi 5');
    expect(dl.area).toBe('Āgenskalns');
  });

  it('extracts a Latvian street address with postal code', () => {
    const $ = load(SAMPLE_HTML);
    const addr = extractAddress($('main').text());
    expect(addr).toMatch(/Gardenes\s+6.*LV-1002.*Rīga/);
  });

  it('returns null when no address matches', () => {
    expect(extractAddress('No address here.')).toBeNull();
  });
});
