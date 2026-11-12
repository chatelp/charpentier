/** Kinds of project (docs/SPEC.md §5.1). */
export type ProjectKind = 'novel' | 'short-story';

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: ProjectKind;
  /** ISO 8601: creation, or the last time the project was opened or renamed. */
  readonly updatedAt: string;
  /** ISO 8601, for projects in the trash. */
  readonly trashedAt?: string;
}

/**
 * The author's library of projects (phase 1.10): an index of the projects,
 * whose content lives in their own documents. The project's title is also in
 * its root document; core keeps both in step.
 */
export interface LibraryService {
  /** Live projects, most recently updated first. */
  list(): Promise<readonly ProjectSummary[]>;
  /** Projects in the trash, most recently trashed first. */
  listTrashed(): Promise<readonly ProjectSummary[]>;
  /** `id` adopts an existing project (one created before the library existed). */
  create(input: { title: string; kind: ProjectKind; id?: string }): Promise<ProjectSummary>;
  rename(projectId: string, title: string): Promise<void>;
  /** Marks the project as just used (it comes first in the list). */
  touch(projectId: string): Promise<void>;
  /** Moves the project to the trash; never a permanent deletion. */
  trash(projectId: string): Promise<void>;
  restore(projectId: string): Promise<void>;
}

/** Where the library lives on disk (desktop): shown, changed, opened in the file manager. */
export interface LibraryFolderService {
  current(): Promise<string>;
  /** Asks the author for a folder; the app restarts on it. False if cancelled. */
  choose(): Promise<boolean>;
  reveal(): Promise<void>;
}

/**
 * Small per-device preferences (last opened project, UI toggles).
 * Never used for book content, which lives in Yjs documents.
 */
export interface PreferencesService {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}
