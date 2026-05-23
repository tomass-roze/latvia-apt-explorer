// Per-criterion color palette — derived from CRITERIA so order/color/key co-vary.
// Used by ScoreBreakdown (tile + detail) and /compare to render stacked bars
// with consistent meaning across the app.

import { CRITERIA, type CriterionKey } from './registry';

// Group hues — warm grey for price, blue-grey for location, olive for building, accent for apartment.
const GROUP_HUES: Record<string, readonly string[]> = {
  // Price (3): warm greys → toward accent
  price: ['#A89884', '#8C7A66', '#705F4D'],
  // Location (3): blue-grey scale
  location: ['#7A9CB8', '#5D8AA8', '#456B85'],
  // Building (3): olive scale
  building: ['#92A382', '#778A64', '#5C7048'],
  // Apartment (3): warm accent-soft → accent
  apartment: ['#E0B4A0', '#C3471A', '#8E2F0F'],
};

interface PaletteEntry {
  readonly key: CriterionKey;
  readonly label: string;
  readonly color: string;
  readonly order: number;
}

function buildPalette(): readonly PaletteEntry[] {
  const groupCounters = new Map<string, number>();
  return CRITERIA.map((c, idx) => {
    const cursor = groupCounters.get(c.group) ?? 0;
    groupCounters.set(c.group, cursor + 1);
    const hues = GROUP_HUES[c.group] ?? ['#1A1A17'];
    const color = hues[cursor % hues.length] ?? '#1A1A17';
    return {
      key: c.key as CriterionKey,
      label: c.label,
      color,
      order: idx,
    };
  });
}

export const CRITERION_DISPLAY: readonly PaletteEntry[] = buildPalette();

const COLOR_BY_KEY = new Map<CriterionKey, string>(
  CRITERION_DISPLAY.map((e) => [e.key, e.color]),
);

export function colorForCriterion(key: CriterionKey): string {
  return COLOR_BY_KEY.get(key) ?? '#1A1A17';
}
