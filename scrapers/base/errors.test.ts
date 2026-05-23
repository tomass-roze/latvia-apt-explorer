import { describe, expect, it } from 'vitest';
import { ScrapeErrorSchema, type ProjectId } from '@/lib/schema';
import { fetchError, geocodeError, parseError, validateError } from './errors';

describe('error builders produce schema-valid ScrapeError objects', () => {
  it('fetchError', () => {
    const err = fetchError('timeout', 'https://example.com/page');
    expect(ScrapeErrorSchema.safeParse(err).success).toBe(true);
    expect(err.kind).toBe('fetch');
    expect(err.url).toBe('https://example.com/page');
  });

  it('parseError with optional opts', () => {
    const err = parseError('no h1 found');
    expect(ScrapeErrorSchema.safeParse(err).success).toBe(true);
    expect(err.url).toBeUndefined();
  });

  it('validateError carries zodIssues structurally', () => {
    const err = validateError('apt failed schema', [{ path: ['rooms'], message: 'must be int' }], {
      projectId: 'yit--abc1234567890def' as ProjectId,
    });
    expect(ScrapeErrorSchema.safeParse(err).success).toBe(true);
    expect(err.zodIssues).toHaveLength(1);
    expect(err.projectId).toBe('yit--abc1234567890def');
  });

  it('geocodeError optional fields stay omitted', () => {
    const err = geocodeError('no result');
    expect(ScrapeErrorSchema.safeParse(err).success).toBe(true);
    expect(err.url).toBeUndefined();
    expect(err.projectId).toBeUndefined();
  });
});
