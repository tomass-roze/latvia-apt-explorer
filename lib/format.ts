// Display formatting for the Latvian UI. Single home for all human-readable
// conversions — prevents every component from reinventing them.

import type { Apartment, CompletionEstimate, Developer, Price } from './schema';
import { assertNever } from './schema';

export const DEVELOPER_LABELS: Record<Developer, string> = {
  bonava: 'Bonava',
  hepsor: 'Hepsor',
  invego: 'Invego',
  merks: 'Merks',
  pillar: 'Pillar',
  vastint: 'Vastint',
  yit: 'YIT',
};

const PRICE_FORMATTER = new Intl.NumberFormat('lv-LV', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const AREA_FORMATTER = new Intl.NumberFormat('lv-LV', {
  style: 'decimal',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format a Price as a Latvian display string. */
export function formatPrice(price: Price): string {
  switch (price.kind) {
    case 'amount': {
      const formatted = `€${PRICE_FORMATTER.format(price.eur)}`;
      return price.vatIncluded ? `${formatted} (ar PVN)` : `${formatted} (bez PVN)`;
    }
    case 'on-request':
      return 'Pēc pieprasījuma';
    case 'unknown':
      return '—';
    default:
      return assertNever(price);
  }
}

/** Format a Price per square meter, shorter form (no VAT suffix; just the number). */
export function formatPricePerSqm(price: Price): string {
  switch (price.kind) {
    case 'amount':
      return `€${PRICE_FORMATTER.format(price.eur)}/m²`;
    case 'on-request':
      return '—/m²';
    case 'unknown':
      return '—/m²';
    default:
      return assertNever(price);
  }
}

/** Format an area in m². */
export function formatArea(m2: number): string {
  return `${AREA_FORMATTER.format(m2)} m²`;
}

/**
 * Range helpers for project summaries: collapse to a single value when
 * min == max, render a range otherwise, return null when there's no data.
 */
export function formatAreaRange(apartments: readonly Apartment[]): string | null {
  const areas = apartments.map((a) => a.area).filter((n) => Number.isFinite(n) && n > 0);
  if (areas.length === 0) return null;
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  if (Math.abs(max - min) < 0.1) return formatArea(min);
  return `${formatArea(min)} – ${formatArea(max)}`;
}

export function formatPriceRange(apartments: readonly Apartment[]): string | null {
  const prices = apartments
    .map((a) => (a.price.kind === 'amount' ? a.price.eur : null))
    .filter((n): n is number => n !== null && n > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (n: number) => `€${PRICE_FORMATTER.format(n)}`;
  if (min === max) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

export function formatPricePerSqmRange(apartments: readonly Apartment[]): string | null {
  const prices = apartments
    .map((a) => (a.pricePerSqm.kind === 'amount' ? a.pricePerSqm.eur : null))
    .filter((n): n is number => n !== null && n > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const fmt = (n: number) => `€${PRICE_FORMATTER.format(n)}/m²`;
  if (min === max) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

export function formatRoomsRange(apartments: readonly Apartment[]): string | null {
  const rooms = apartments.map((a) => a.rooms).filter((n) => Number.isFinite(n) && n > 0);
  if (rooms.length === 0) return null;
  const min = Math.min(...rooms);
  const max = Math.max(...rooms);
  if (min === max) return `${min}`;
  return `${min} – ${max}`;
}

/** Format a CompletionEstimate as a Latvian display string. */
export function formatCompletion(c: CompletionEstimate): string {
  switch (c.kind) {
    case 'quarter':
      return `${c.quarter}. cet. ${c.year}`;
    case 'exact-date': {
      const d = new Date(c.iso);
      return d.toLocaleDateString('lv-LV', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    case 'ready':
      return 'Pieejams uzreiz';
    case 'unknown':
      return 'Nezināms';
    default:
      return assertNever(c);
  }
}

/**
 * Comparable ordinal for sorting completion estimates. Earlier = lower.
 * Unit: quarters since 2020-Q1 (so all variants live on the same scale).
 */
export function completionOrdinal(c: CompletionEstimate): number {
  switch (c.kind) {
    case 'ready':
      return -1;
    case 'exact-date': {
      const d = new Date(c.iso);
      return (d.getUTCFullYear() - 2020) * 4 + Math.floor(d.getUTCMonth() / 3);
    }
    case 'quarter':
      return (c.year - 2020) * 4 + (c.quarter - 1);
    case 'unknown':
      return Number.POSITIVE_INFINITY;
    default:
      return assertNever(c);
  }
}
