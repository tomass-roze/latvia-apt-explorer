// Playwright wrapper: shared browser instance, polite navigation, identifying UA.
//
// Only used by scrapers that genuinely need a rendered DOM. Plain HTTP fetches
// still go through scrapers/base/fetch.ts. This module spins up a single
// Chromium instance per scraper run, shares it across all page loads, and
// closes it on shutdownBrowser().

import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import robotsParser, { type Robot } from 'robots-parser';

const USER_AGENT =
  'LatviaApartmentExplorer/0.1 (+https://github.com/tomass/jp; contact: thomas@bubblebeeindustries.com)';

const REQ_DELAY_MS = 1000;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_TIMEOUT_MS = 30_000;

let browser: Browser | null = null;
let context: BrowserContext | null = null;
const lastReqAtPerHost = new Map<string, number>();
const robotsCache = new Map<string, { robots: Robot | null; fetchedAt: number }>();

async function ensureBrowser(): Promise<BrowserContext> {
  if (context) return context;
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'lv-LV',
  });
  return context;
}

export async function shutdownBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

function hostOf(url: string): string {
  return new URL(url).host;
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

async function loadRobots(url: string): Promise<Robot | null> {
  const host = hostOf(url);
  const cached = robotsCache.get(host);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.robots;
  const robotsUrl = `${originOf(url)}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      robotsCache.set(host, { robots: null, fetchedAt: Date.now() });
      return null;
    }
    const robots = robotsParser(robotsUrl, await res.text());
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

export interface RenderResult {
  ok: true;
  html: string;
  finalUrl: string;
  page: Page;
}

export interface RenderFailure {
  ok: false;
  message: string;
}

/**
 * Navigate to a URL with a fresh page, wait for DOM content + brief idle, then
 * return the rendered HTML + the live page (caller is responsible for closing
 * via the returned page.close() or accepts that all pages close at shutdownBrowser()).
 *
 * Always resolves — never throws. Inspect `.ok` before destructuring.
 */
export async function renderPage(
  url: string,
  options: { waitForSelector?: string; closeAfter?: boolean } = {},
): Promise<RenderResult | RenderFailure> {
  const robots = await loadRobots(url);
  if (robots && !robots.isAllowed(url, USER_AGENT)) {
    return { ok: false, message: `robots.txt disallows ${url}` };
  }

  await rateLimit(url);
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: PAGE_TIMEOUT_MS });
    }
    const html = await page.content();
    const finalUrl = page.url();
    if (options.closeAfter !== false) {
      await page.close();
    }
    return { ok: true, html, finalUrl, page };
  } catch (err) {
    try {
      await page.close();
    } catch {
      // ignore
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
