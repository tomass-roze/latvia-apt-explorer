// Stable JSON serializer — sorted keys + sorted arrays. Isomorphic.
//
// Why: per-developer JSON files are committed nightly by GitHub Actions.
// Without stable ordering, git diffs are noisy and obscure real changes
// (a single new apartment can reshuffle hundreds of lines).
//
// Sorts:
//   - object keys alphabetically
//   - top-level arrays of objects by the `id` field if present, else by JSON repr
//
// Output is pretty-printed with 2-space indent + trailing newline.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(sortKeys);
    return sortArray(items);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

function sortArray(items: unknown[]): unknown[] {
  if (items.length === 0) return items;
  const first = items[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    return items;
  }
  const hasId = items.every(
    (item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item) && 'id' in item,
  );
  if (hasId) {
    return [...items].sort((a, b) => {
      const aId = String((a as { id: unknown }).id);
      const bId = String((b as { id: unknown }).id);
      return aId.localeCompare(bId);
    });
  }
  return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Serialize to a stable, diff-friendly JSON string with trailing newline. */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value) as Json, null, 2)}\n`;
}
