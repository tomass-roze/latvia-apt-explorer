// Display formatting for the Latvian UI. Single home for all human-readable
// conversions — prevents every component from reinventing them.

import type { CompletionEstimate, Price } from './schema';
import { assertNever } from './schema';

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
