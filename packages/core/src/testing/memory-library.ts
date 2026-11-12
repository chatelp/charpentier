import type { LibraryService, ProjectKind, ProjectSummary } from '@charpentier/platform';

/** In-memory library for core tests (the hosts provide persistent ones). */
export class MemoryLibrary implements LibraryService {
  readonly #projects = new Map<string, ProjectSummary>();
  #clock = 0;

  // Strictly increasing timestamps, so that order is deterministic in tests.
  #now() {
    return new Date(Date.UTC(2026, 10, 12) + ++this.#clock * 1000).toISOString();
  }

  #set(id: string, change: (p: ProjectSummary) => ProjectSummary) {
    const project = this.#projects.get(id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    this.#projects.set(id, change(project));
  }

  async list() {
    return [...this.#projects.values()]
      .filter((p) => !p.trashedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listTrashed() {
    return [...this.#projects.values()]
      .filter((p) => p.trashedAt)
      .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? ''));
  }

  async create(input: { title: string; kind: ProjectKind; id?: string }) {
    const id = input.id ?? `project-${this.#projects.size + 1}`;
    const existing = this.#projects.get(id);
    if (existing) return existing;
    const project: ProjectSummary = {
      id,
      title: input.title,
      kind: input.kind,
      updatedAt: this.#now(),
    };
    this.#projects.set(id, project);
    return project;
  }

  async rename(id: string, title: string) {
    this.#set(id, (p) => ({ ...p, title, updatedAt: this.#now() }));
  }

  async touch(id: string) {
    this.#set(id, (p) => ({ ...p, updatedAt: this.#now() }));
  }

  async trash(id: string) {
    this.#set(id, (p) => ({ ...p, trashedAt: this.#now() }));
  }

  async restore(id: string) {
    this.#set(id, (p) => {
      const restored = { ...p };
      delete restored.trashedAt;
      return restored;
    });
  }
}
