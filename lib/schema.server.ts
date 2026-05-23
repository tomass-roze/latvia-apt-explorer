// Server-only schema helpers — uses node:crypto. The `.server.ts` suffix is
// the convention for "do not import from a 'use client' module"; Next.js will
// also hard-fail any client bundle that pulls in `node:crypto`, which is the
// real enforcement. We don't import 'server-only' explicitly because it always
// throws (it's a Next compile-time marker, not a runtime guard) and that
// breaks scripts run via tsx.

import { createHash } from 'node:crypto';
import type { Developer, ProjectId } from './schema';
import { normalizeAddress } from './schema';

/**
 * Build a stable project ID from a developer + cadastre ID (preferred) or address.
 *
 * Format: `<developer>--<16 hex chars>` where the hex is the first 16 chars of
 * sha256(`developer|key`). 16 hex = 64 bits → collision-safe for ~5,000 items.
 *
 * Why double-dash and not colon: colons in filenames break Windows and some CDNs;
 * the ID is used both as a JSON key AND as a filename for `data/apartments/<id>.json`.
 *
 * If a developer rewords an address later, the SHA changes. Maintain
 * `data/overrides/project-id-map.json` (old → new) to preserve user localStorage status.
 */
export function buildProjectId(
  developer: Developer,
  input: { cadastreId?: string; address: string },
): ProjectId {
  const key = input.cadastreId?.trim() || normalizeAddress(input.address);
  const hash = createHash('sha256')
    .update(`${developer}|${key}`)
    .digest('hex')
    .slice(0, 16);
  return `${developer}--${hash}` as ProjectId;
}
