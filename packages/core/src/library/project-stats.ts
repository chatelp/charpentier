/** Words and scenes of a project, kept on the device for the library's cards (docs/DESIGN.md §4.9). */
export interface ProjectStats {
  readonly words: number;
  readonly scenes: number;
}

export const projectStatsPref = (projectId: string) => `projectStats:${projectId}`;

export function readProjectStats(raw: unknown): ProjectStats | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { words, scenes } = raw as Record<string, unknown>;
  return typeof words === 'number' && typeof scenes === 'number' ? { words, scenes } : null;
}
