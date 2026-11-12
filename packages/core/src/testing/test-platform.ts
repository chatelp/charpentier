import type { Platform } from '@charpentier/platform';
import * as Y from 'yjs';
import { MemoryLibrary } from './memory-library';

/**
 * Minimal in-memory Platform for core tests. Core must not depend on a host
 * implementation, even in tests.
 */
export function createTestPlatform(overrides: Partial<Platform> = {}): Platform {
  const docs = new Map<string, Y.Doc>();
  return {
    host: 'web',
    documents: {
      open: async (guid) => {
        const doc = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, doc);
        return {
          guid,
          doc,
          whenLoaded: Promise.resolve(),
          close: async () => void docs.delete(guid),
        };
      },
    },
    library: new MemoryLibrary(),
    libraryFolder: null,
    preferences: { get: async () => undefined, set: async () => {} },
    keybindings: { primaryModifier: 'Meta', reserved: [] },
    agents: { status: () => 'disabled', onStatusChange: () => () => {} },
    llm: null,
    fileMirror: null,
    secrets: null,
    spellcheck: null,
    system: null,
    ...overrides,
  };
}
