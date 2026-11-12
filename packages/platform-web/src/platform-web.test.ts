import { describe, expect, it } from 'vitest';
import { createWebKeybindings, LocalStoragePreferences, MemoryDocumentService } from './index';

describe('LocalStoragePreferences', () => {
  it('round-trips values through storage', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    const prefs = new LocalStoragePreferences(storage);
    await prefs.set('lastProject', { id: 'p1' });
    expect(await new LocalStoragePreferences(storage).get('lastProject')).toEqual({ id: 'p1' });
  });

  it('keeps working when storage throws', async () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const prefs = new LocalStoragePreferences(storage);
    await prefs.set('theme', 'dark');
    expect(await prefs.get('theme')).toBe('dark');
  });

  it('works without any storage', async () => {
    const prefs = new LocalStoragePreferences(undefined);
    expect(await prefs.get('missing')).toBeUndefined();
  });
});

describe('MemoryDocumentService', () => {
  it('hands out the same document for the same guid until closed', async () => {
    const service = new MemoryDocumentService();
    const a = await service.open('project:p1');
    const b = await service.open('project:p1');
    expect(a.doc).toBe(b.doc);
    expect(a.doc.guid).toBe('project:p1');
    await a.close();
    const c = await service.open('project:p1');
    expect(c.doc).not.toBe(a.doc);
  });
});

describe('createWebKeybindings', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(
      createWebKeybindings('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)').primaryModifier,
    ).toBe('Meta');
    expect(createWebKeybindings('Mozilla/5.0 (X11; Linux x86_64)').primaryModifier).toBe('Control');
  });
});
