// Pure unit tests for the export/deserialize behavior. The React hooks
// themselves require jsdom + @testing-library — left as a Phase 4 follow-up.

import { describe, expect, it } from 'vitest';
import { PersonalStateSchema, type ProjectId } from '@/lib/schema';

const DEFAULT_PERSONAL = {
  version: 1 as const,
  status: {},
  saved: [],
  weights: {},
};

describe('PersonalState shape', () => {
  it('matches the schema for the default empty state', () => {
    expect(PersonalStateSchema.safeParse(DEFAULT_PERSONAL).success).toBe(true);
  });

  it('accepts a populated state', () => {
    const populated = {
      version: 1,
      status: { 'yit--abc123def4567890': 'interested' },
      saved: ['yit--abc123def4567890'],
      weights: { priceTotal: 0.3, distRigaCenter: 0.2 },
    };
    expect(PersonalStateSchema.safeParse(populated).success).toBe(true);
  });

  it('rejects an unknown status enum value', () => {
    const bad = {
      version: 1,
      status: { 'yit--abc123def4567890': 'maybe' },
      saved: [],
      weights: {},
    };
    expect(PersonalStateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects version other than 1', () => {
    expect(
      PersonalStateSchema.safeParse({ ...DEFAULT_PERSONAL, version: 2 }).success,
    ).toBe(false);
  });

  it('rejects weight values outside [0, 1]', () => {
    const bad = {
      version: 1,
      status: {},
      saved: [],
      weights: { priceTotal: 1.5 },
    };
    expect(PersonalStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Status enum', () => {
  it('all valid statuses round-trip through ProjectId record', () => {
    const ids = ['yit--p1', 'yit--p2', 'yit--p3', 'yit--p4'] as ProjectId[];
    const populated = {
      version: 1,
      status: {
        [ids[0] as string]: 'new',
        [ids[1] as string]: 'interested',
        [ids[2] as string]: 'visited',
        [ids[3] as string]: 'passed',
      },
      saved: [],
      weights: {},
    };
    expect(PersonalStateSchema.safeParse(populated).success).toBe(true);
  });
});
