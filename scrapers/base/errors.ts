// Discriminated-union builders for ScrapeError. Using these (instead of
// constructing the object literal inline) keeps the `kind` taxonomy consistent
// across every scraper.

import type { ProjectId, ScrapeError } from '@/lib/schema';

export function fetchError(message: string, url?: string): ScrapeError {
  const err: ScrapeError = { kind: 'fetch', message };
  if (url) err.url = url;
  return err;
}

export function parseError(message: string, opts?: { url?: string; projectId?: ProjectId }): ScrapeError {
  const err: ScrapeError = { kind: 'parse', message };
  if (opts?.url) err.url = opts.url;
  if (opts?.projectId) err.projectId = opts.projectId;
  return err;
}

export function validateError(
  message: string,
  zodIssues: unknown[],
  opts?: { url?: string; projectId?: ProjectId },
): ScrapeError {
  const err: ScrapeError = { kind: 'validate', message, zodIssues };
  if (opts?.url) err.url = opts.url;
  if (opts?.projectId) err.projectId = opts.projectId;
  return err;
}

export function geocodeError(message: string, opts?: { projectId?: ProjectId }): ScrapeError {
  const err: ScrapeError = { kind: 'geocode', message };
  if (opts?.projectId) err.projectId = opts.projectId;
  return err;
}
