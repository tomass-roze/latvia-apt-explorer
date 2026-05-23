import { describe, expect, it } from 'vitest';
import { stableStringify } from './json-stable';

describe('stableStringify', () => {
  it('sorts object keys alphabetically', () => {
    const out = stableStringify({ b: 1, a: 2, c: 3 });
    expect(out).toBe('{\n  "a": 2,\n  "b": 1,\n  "c": 3\n}\n');
  });

  it('sorts arrays of objects by id field', () => {
    const out = stableStringify([
      { id: 'z', val: 1 },
      { id: 'a', val: 2 },
      { id: 'm', val: 3 },
    ]);
    expect(JSON.parse(out)).toEqual([
      { id: 'a', val: 2 },
      { id: 'm', val: 3 },
      { id: 'z', val: 1 },
    ]);
  });

  it('sorts nested arrays of objects with id', () => {
    const out = stableStringify({
      projects: [
        { id: 'b', apartments: [{ id: '2' }, { id: '1' }] },
        { id: 'a' },
      ],
    });
    const parsed = JSON.parse(out);
    expect(parsed.projects[0].id).toBe('a');
    expect(parsed.projects[1].apartments).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('is idempotent — stringify(parse(stringify(x))) === stringify(x)', () => {
    const data = { c: [3, 1, 2], a: 1, b: { z: 1, a: 2 } };
    const once = stableStringify(data);
    const twice = stableStringify(JSON.parse(once));
    expect(once).toBe(twice);
  });

  it('always ends with newline', () => {
    expect(stableStringify({ a: 1 }).endsWith('\n')).toBe(true);
  });

  it('handles primitives, null, and empty values', () => {
    expect(stableStringify(null)).toBe('null\n');
    expect(stableStringify(42)).toBe('42\n');
    expect(stableStringify('hi')).toBe('"hi"\n');
    expect(stableStringify([])).toBe('[]\n');
    expect(stableStringify({})).toBe('{}\n');
  });
});
