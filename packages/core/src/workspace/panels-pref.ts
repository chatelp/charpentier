import type { SheetTarget } from '../atelier/atelier-data';

/** The panels open in a project, kept on the device (docs/DESIGN.md §4.8). */
export interface StoredPanels {
  readonly navigator: boolean;
  readonly mentor: 'points' | 'conversation' | null;
  readonly sheet: SheetTarget | null;
}

export const panelsPref = (projectId: string) => `panels:${projectId}`;

const MODULES = new Set(['characters', 'acts', 'arcs', 'worldRules', 'clues']);

/** Accepts whatever was stored (older versions, hand edits) and returns valid panels. */
export function readPanels(raw: unknown): StoredPanels {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const mentor = stored['mentor'];
  const sheet = stored['sheet'] as Record<string, unknown> | null | undefined;
  return {
    navigator: stored['navigator'] === true,
    mentor: mentor === 'points' || mentor === 'conversation' ? mentor : null,
    sheet:
      sheet &&
      typeof sheet === 'object' &&
      typeof sheet['module'] === 'string' &&
      MODULES.has(sheet['module']) &&
      typeof sheet['entityId'] === 'string'
        ? (sheet as unknown as SheetTarget)
        : null,
  };
}
