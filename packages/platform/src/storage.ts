/** Kinds of project (docs/SPEC.md §5.1). */
export type ProjectKind = 'novel' | 'short-story';

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: ProjectKind;
  /** ISO 8601. */
  readonly updatedAt: string;
}

/** The author's library of projects (phase 1.10). */
export interface LibraryService {
  list(): Promise<readonly ProjectSummary[]>;
  create(input: { title: string; kind: ProjectKind }): Promise<ProjectSummary>;
  rename(projectId: string, title: string): Promise<void>;
  /** Moves the project to the trash; never a permanent deletion. */
  trash(projectId: string): Promise<void>;
}

/**
 * Small per-device preferences (last opened project, UI toggles).
 * Never used for book content, which lives in Yjs documents.
 */
export interface PreferencesService {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}
