---
date: 2026-05-20
topic: Latvia new-construction apartment explorer
status: brainstorm
---

# Latvia New-Construction Apartment Explorer

## What We're Building

A map-first web app that aggregates all active new-construction apartment projects in Latvia, lets the user filter and rank them against personal criteria, tracks status and notes per project to avoid repeated review, and helps shortlist via side-by-side comparison. Built primarily for the author's own apartment search (decision window: 1–3 months); deployed publicly on Vercel so other buyers can use it.

**Core user flow:**
1. Open the map and see every active project in Latvia as a pin. Pin color reflects status (new / interested / visited / passed) so previously-reviewed projects are instantly recognizable.
2. Toggle map overlays (schools, transit, green space, shops) to read neighborhood context.
3. Set global filters: rooms/size, budget, floor & layout features, completion date, build stage (pre-sales / under construction / nearly complete / ready).
4. Adjust scoring weight sliders. Pins re-rank live, with the top-ranked projects also listed in an ordered side panel.
5. Click a pin to see project facts, available apartments matching the filters, floor plans, parking/storage pricing, price-trend chart, and the scoring breakdown.
6. Mark project status (new → interested → visited → passed) and jot free-text notes.
7. Shortlist 2–3 favorites and open the side-by-side compare view to make the final decision.

## Why This Approach

**Static-first architecture (Approach A).** Next.js on Vercel, JSON files in the repo as the data store, GitHub Actions cron jobs running per-developer scrapers nightly and committing fresh data. Frontend uses ISR to pick up new data.

Reasons:
- **Zero infra cost and zero schema migrations** — the project is personal until it isn't.
- **Git history doubles as price history** for free. The per-apartment sparkline and project-level trend chart both read from the git-tracked JSON snapshots.
- **Apartment counts in Latvia are bounded** (low thousands of active units across all developers). Client-side filtering is fine at this scale.
- **Scoring uses only objective facts** with user-adjustable weight sliders, so the same data backs both the personal use case and any public visitor — no per-user backend needed. Personal status/notes/saved/dismissed live in `localStorage`; filter/weight state lives in the URL so it's shareable.
- **Easy to migrate later.** If the dataset or traffic outgrows static, the data layer is the only thing that needs swapping; the UI keeps reading typed objects.

## Key Decisions

### Scope & data
| Area | Decision |
|---|---|
| **Geographic scope** | All of Latvia |
| **Data source** | Per-developer site scrapers, one module per developer |
| **MVP developers** | Bonava, YIT, Merks, Hepsor, Pillar, Vastint, Invego (extensible) |
| **Scraper add workflow** | User hands over a developer site URL → a new scraper module is built to the established pattern. Mechanical, not architectural. |
| **Refresh cadence** | Nightly via GitHub Actions cron |
| **Storage** | JSON files in repo, one per developer, committed by the cron job |
| **Hosting** | Next.js on Vercel (free tier) |
| **UI language** | Latvian only |
| **Primary device** | Desktop-first; mobile responsive but not optimized |

### Filtering & data captured
| Area | Decision |
|---|---|
| **Filters (per-apartment)** | Rooms / size, price / budget, floor & layout features, completion date, build stage |
| **Build stage** | Tracked as filter dimension: pre-sales / under construction / nearly complete / ready |
| **Availability states** | Three states: available / reserved / sold — distinct styling, reserved is filterable |
| **Per-apartment granularity** | Yes — apartment records, not just project summaries |
| **Per-apartment deep link** | Every apartment links to its specific page on the developer's site |
| **Floor plans** | Hotlink floor plan images per apartment (often the deciding factor) |
| **Project photos** | Hotlink from developer sites (no local caching in v1) |
| **Sales contact info** | Not shown — the deep link is sufficient |

### Scoring
| Area | Decision |
|---|---|
| **Model** | Objective facts + user-adjustable weight sliders. No subjective ratings stored in data. |
| **Facts in v1** | Price (€/m² + total), location distances (to school, grocery, Riga center), parking & storage availability/price, energy class & construction type, layout details (bathroom count, terrace/balcony size, floor) |
| **Parking & storage** | Scraper captures what's available; user manually fills missing values per project |

### Personal use & comparison
| Area | Decision |
|---|---|
| **Project status** | Status field per project: new / interested / visited / passed. Reflected in pin color. |
| **Notes** | Free-text notes per project. Stored in localStorage. (No dedicated search UI in v1.) |
| **Comparison view** | Dedicated side-by-side view for 2–3 shortlisted projects, showing all facts and the score breakdown |
| **Public-vs-personal split** | Public-ready from day 1. Filters/weights encoded in URL (shareable); status/notes/saved in localStorage (private). |

### Map
| Area | Decision |
|---|---|
| **Map provider** | MapLibre GL (with OSM tiles); final tile source confirmed in planning |
| **Overlays** | Toggleable: schools & kindergartens, public transit, green space (parks/forests), nearby shops |

### Price history
| Area | Decision |
|---|---|
| **Per-apartment** | Sparkline next to each apartment row |
| **Per-project** | Median €/m² trend on the detail panel |
| **Source** | Read from git-tracked JSON snapshots |

### Timeline & MVP cut
| Area | Decision |
|---|---|
| **Buying decision window** | 1–3 months |
| **MVP target** | Single 2-week push, ship everything together. Includes: map + 3 dev scrapers (Bonava, YIT, Merks) + all filters + status & notes + scoring sliders + comparison view + floor plans + map overlays + price-history charts |
| **Post-MVP iteration** | Remaining developers (Hepsor, Pillar, Vastint, Invego, etc.) + refinements based on real use |

## Out of Scope (for now)

- User accounts / cross-device sync of status, notes, saved projects
- Live data (sub-daily refresh)
- Subjective "quality" or "developer reputation" ratings stored in data
- Mortgage calculator / financing tools
- Mobile native apps
- Notifications when prices drop or new units list
- Comparing against secondary-market (used) listings
- Multi-language UI (English / Russian)
- Local photo / floor plan caching
- Sales contact info display
- Visit log with structured entries (date, photos, etc.) — free-text notes only

## Open Questions (deferred to planning)

These are implementation-level and best decided when designing the architecture in `/workflows:plan`:

1. **Geocoding.** Service for converting Latvian addresses to lat/lng (Nominatim/OSM, Google, manual override file?).
2. **Project deduplication.** Same project listed by multiple developers/agencies — detection strategy.
3. **Scraper resilience.** Alerting when a developer site redesign breaks a scraper (GitHub Action failure email likely sufficient).
4. **Latvian addresses → standardized location keys.** Needed for matching "this project moved between scrape runs" or "two devs list the same building."
5. **OSM tile hosting.** MapLibre + OSM is decided; confirm the specific tile host (public OSM tile servers have usage policies; alternatives include Stadia Maps or Protomaps).

## Success Criteria

- The author can open the app, apply filters matching the family's actual requirements, and see a ranked map within 10 seconds.
- A project the author has previously reviewed shows its status (and notes) at a glance — never resurfaces as "new" by accident.
- Two or three shortlisted projects can be compared side by side with no manual data wrangling.
- Adding a new developer's scraper takes <1 day of work and follows a clear pattern.
- Public visitors can use the full app (browse, filter, score, compare) with no signup, in Latvian.
- Daily scrape job completes in <5 minutes and produces a committable diff.
- MVP ships in ~2 weeks with at least 3 developers covered.
