import { describe, it, expect, beforeEach } from 'vitest';
import { loadAutosave } from '../autosave';

const KEY = 'tuistudio-autosave';

// Vitest's default node environment has no localStorage; a full DOM (jsdom)
// is overkill for 4 methods this module actually uses.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

const validTree = {
  id: 'root',
  type: 'Screen',
  name: 'Main Screen',
  props: {},
  layout: { type: 'absolute' },
  style: {},
  events: {},
  children: [],
  locked: false,
  hidden: false,
  collapsed: false,
};

describe('loadAutosave', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is saved', () => {
    expect(loadAutosave()).toBeNull();
  });

  it('returns the tree and theme for a valid autosave blob', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: '1', meta: { theme: 'dracula' }, tree: validTree })
    );
    const result = loadAutosave();
    expect(result).not.toBeNull();
    expect(result!.tree).toEqual(validTree);
    expect(result!.theme).toBe('dracula');
  });

  it('rejects a malformed tree instead of handing back garbage (same rule as opening a .tui file)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: '1', meta: {}, tree: { id: 'x', type: 'NotAType' } })
    );
    expect(loadAutosave()).toBeNull();
  });

  it('rejects an unrecognized version', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: '2', tree: validTree }));
    expect(loadAutosave()).toBeNull();
  });

  it('rejects unparseable JSON without throwing', () => {
    localStorage.setItem(KEY, '{not json');
    expect(() => loadAutosave()).not.toThrow();
    expect(loadAutosave()).toBeNull();
  });
});
