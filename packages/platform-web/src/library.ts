import type { LibraryService, ProjectKind, ProjectSummary } from '@charpentier/platform';

/** In-memory library; replaced by a persistent one in phase 1.10. */
export class MemoryLibrary implements LibraryService {
  readonly #projects = new Map<string, ProjectSummary>();

  async list(): Promise<readonly ProjectSummary[]> {
    return [...this.#projects.values()];
  }

  async create(input: { title: string; kind: ProjectKind }): Promise<ProjectSummary> {
    const project: ProjectSummary = {
      id: crypto.randomUUID(),
      title: input.title,
      kind: input.kind,
      updatedAt: new Date().toISOString(),
    };
    this.#projects.set(project.id, project);
    return project;
  }

  async rename(projectId: string, title: string): Promise<void> {
    const project = this.#projects.get(projectId);
    if (project)
      this.#projects.set(projectId, { ...project, title, updatedAt: new Date().toISOString() });
  }

  async trash(projectId: string): Promise<void> {
    this.#projects.delete(projectId);
  }
}
