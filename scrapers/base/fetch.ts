// Polite fetch wrapper. The ONLY sanctioned HTTP path for scrapers.
//
// Guarantees:
//   - Identifying, contactable User-Agent
//   - Per-host 1 req/sec rate limit
//   - Exponential retry on 5xx / network errors (not 4xx)
//   - robots.txt respected (with 24h per-host cache)
//   - Sensitive query params and Authorization headers scrubbed from error logs

import robotsParser, { type Robot } from 'robots-parser';
import type { ScrapeError } from '@/lib/schema';
import { fetchError } from './errors';

const USER_AGENT =
  'LatviaApartmentExplorer/0.1 (+https://github.com/tomass/jp; contact: thomas@bubblebeeindustries.com)';

const REQ_DELAY_MS = 1000;
const RETRY_BACKOFF_MS = [1000, 3000, 8000];
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;

const lastReqAtPerHost = new Map<string, number>();
const robotsCache = new Map<string, { robots: Robot | null; fetchedAt: number }>();

function hostOf(url: string): string {
  return new URL(url).host;
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/** Redact `?key=`, `?token=`, and Authorization-like values for logging. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const param of ['key', 'token', 'access_token', 'apikey', 'api_key']) {
      if (u.searchParams.has(param)) u.searchParams.set(param, '<redacted>');
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function loadRobots(url: string): Promise<Robot | null> {
  const host = hostOf(url);
  const cached = robotsCache.get(host);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
    return cached.robots;
  }
  const robotsUrl = `${originOf(url)}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      // Treat as "no robots.txt — everything allowed" per the de-facto convention.
      robotsCache.set(host, { robots: null, fetchedAt: Date.now() });
      return null;
    }
    const body = await res.text();
    const robots = robotsParser(robotsUrl, body);
    robotsCache.set(host, { robots, fetchedAt: Date.now() });
    return robots;
  } catch {
    robotsCache.set(host, { robots: null, fetchedAt: Date.now() });
    return null;
  }
}

async function rateLimit(url: string): Promise<void> {
  const host = hostOf(url);
  const last = lastReqAtPerHost.get(host) ?? 0;
  const wait = Math.max(0, REQ_DELAY_MS - (Date.now() - last));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAtPerHost.set(host, Date.now());
}

export interface PoliteFetchResult {
  ok: true;
  status: number;
  body: string;
  url: string;
}

export interface PoliteFetchFailure {
  ok: false;
  error: ScrapeError;
}

export type PoliteFetchResponse = PoliteFetchResult | PoliteFetchFailure;

/**
 * Fetch a URL politely: robots-checked, rate-limited, retried on transient failure.
 * Always resolves — never throws. Inspect `.ok` and branch accordingly.
 */
export async function politeFetch(url: string): Promise<PoliteFetchResponse> {
  const robots = await loadRobots(url);
  if (robots && !robots.isAllowed(url, USER_AGENT)) {
    return {
      ok: false,
      error: fetchError(`robots.txt disallows ${redactUrl(url)}`, url),
    };
  }

  let attempt = 0;
  let lastErr = 'unknown';

  while (attempt <= RETRY_BACKOFF_MS.length) {
    await rateLimit(url);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        redirect: 'follow',
      });
      // 4xx is a hard failure (not retried). 5xx and network errors retry.
      if (res.ok) {
        const body = await res.text();
        return { ok: true, status: res.status, body, url: res.url };
      }
      if (res.status >= 400 && res.status < 500) {
        return {
          ok: false,
          error: fetchError(`HTTP ${res.status} ${redactUrl(url)}`, url),
        };
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    const backoff = RETRY_BACKOFF_MS[attempt];
    if (backoff === undefined) break;
    await new Promise((r) => setTimeout(r, backoff));
    attempt += 1;
  }

  return { ok: false, error: fetchError(`fetch failed after retries: ${lastErr}`, url) };
}

/** Reset per-host caches. For tests only. */
export function _resetForTests(): void {
  lastReqAtPerHost.clear();
  robotsCache.clear();
}
