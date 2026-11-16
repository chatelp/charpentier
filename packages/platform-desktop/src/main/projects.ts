import fs from 'node:fs';
import path from 'node:path';
import type { LibraryService, ProjectKind, ProjectSummary } from '@charpentier/platform';

/** Hidden folder of a project holding the CRDT state (docs/SPEC.md §16). */
export const STATE_DIR = '.charpentier';
const PROJECT_FILE = 'project.json';

interface ProjectFile {
  id: string;
  title: string;
  kind: ProjectKind;
  createdAt: string;
  updatedAt: string;
  /**
   * When the title last changed (its creation, a rename): a title travels by
   * this date, not by `updatedAt`, which an opening also moves (a device
   * that opens an old copy offline must not bring back the old title).
   */
  titleAt?: string;
  trashedAt?: string;
}

/** A project as the library keeps it: identity, title, kind, dates. */
export type ProjectRecord = Readonly<ProjectFile>;

/** A file name a human can read in the Finder, safe on every system. */
export function folderName(title: string): string {
  const cleaned = title
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return cleaned || 'Projet';
}

/** Atomic JSON write: temporary file, fsync, rename. */
export function writeJsonAtomic(file: string, value: unknown, mode?: number): void {
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', mode);
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // The mode of a new file goes through the umask: set it for sure.
  if (mode !== undefined) fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, file);
}

/**
 * The library on disk: one folder per project in the library folder, its
 * identity in `.charpentier/project.json` (docs/SPEC.md §16). The folder keeps
 * the name it was created with; the title can change.
 */
export class FolderLibrary implements LibraryService {
  constructor(readonly root: string) {}

  #scan(): { folder: string; project: ProjectFile }[] {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .flatMap((d) => {
        const folder = path.join(this.root, d.name);
        try {
          const project = JSON.parse(
            fs.readFileSync(path.join(folder, STATE_DIR, PROJECT_FILE), 'utf8'),
          ) as ProjectFile;
          return typeof project.id === 'string' ? [{ folder, project }] : [];
        } catch {
          return []; // Not a project folder.
        }
      });
  }

  /** Folder of a project, if it exists. */
  folderOf(projectId: string): string | undefined {
    return this.#scan().find((p) => p.project.id === projectId)?.folder;
  }

  #update(projectId: string, change: (p: ProjectFile) => ProjectFile) {
    const found = this.#scan().find((p) => p.project.id === projectId);
    if (!found) throw new Error(`Unknown project: ${projectId}`);
    writeJsonAtomic(path.join(found.folder, STATE_DIR, PROJECT_FILE), change(found.project));
  }

  async list(): Promise<readonly ProjectSummary[]> {
    return this.#scan()
      .map(({ project }) => toSummary(project))
      .filter((p) => !p.trashedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listTrashed(): Promise<readonly ProjectSummary[]> {
    return this.#scan()
      .map(({ project }) => toSummary(project))
      .filter((p) => p.trashedAt)
      .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? ''));
  }

  async create(input: { title: string; kind: ProjectKind; id?: string }): Promise<ProjectSummary> {
    const id = input.id ?? crypto.randomUUID();
    const existing = this.#scan().find((p) => p.project.id === id);
    if (existing) return toSummary(existing.project);
    fs.mkdirSync(this.root, { recursive: true });
    const base = folderName(input.title);
    let name = base;
    for (let n = 2; fs.existsSync(path.join(this.root, name)); n++) name = `${base} (${n})`;
    const folder = path.join(this.root, name);
    fs.mkdirSync(path.join(folder, STATE_DIR), { recursive: true });
    const now = new Date().toISOString();
    const project: ProjectFile = {
      id,
      title: input.title,
      kind: input.kind,
      createdAt: now,
      updatedAt: now,
    };
    writeJsonAtomic(path.join(folder, STATE_DIR, PROJECT_FILE), project);
    return toSummary(project);
  }

  async rename(projectId: string, title: string): Promise<void> {
    const now = new Date().toISOString();
    this.#update(projectId, (p) => ({ ...p, title, updatedAt: now, titleAt: now }));
  }

  async touch(projectId: string): Promise<void> {
    this.#update(projectId, (p) => ({ ...p, updatedAt: new Date().toISOString() }));
  }

  async trash(projectId: string): Promise<void> {
    this.#update(projectId, (p) => ({ ...p, trashedAt: new Date().toISOString() }));
  }

  /** Every project, live and trashed, with its dates (for the account's library, D-21). */
  async all(): Promise<readonly ProjectRecord[]> {
    return this.#scan().map(({ project }) => ({ ...project }));
  }

  /**
   * Takes a project as another device knows it (sync, step 4): created with
   * the same id if it is not here yet, else updated with exactly its title,
   * kind, dates and trash state, so that the change is not seen as new here.
   */
  async adopt(record: ProjectRecord): Promise<void> {
    if (!this.#scan().some((p) => p.project.id === record.id))
      await this.create({ id: record.id, title: record.title, kind: record.kind });
    this.#update(record.id, (p) => {
      const next: ProjectFile = {
        ...p,
        title: record.title,
        kind: record.kind,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.titleAt && { titleAt: record.titleAt }),
      };
      if (record.trashedAt) next.trashedAt = record.trashedAt;
      else delete next.trashedAt;
      return next;
    });
  }

  async restore(projectId: string): Promise<void> {
    this.#update(projectId, (p) => {
      const restored = { ...p };
      delete restored.trashedAt;
      return restored;
    });
  }
}

function toSummary(p: ProjectFile): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind === 'short-story' ? 'short-story' : 'novel',
    updatedAt: p.updatedAt,
    ...(p.trashedAt && { trashedAt: p.trashedAt }),
  };
}

/**
 * Where a document lives: `project:<pid>` and its scenes, histories and
 * mentor under the project's `.charpentier` folder.
 */
export function documentLocator(library: FolderLibrary): (guid: string) => string | undefined {
  return (guid) => {
    const match = /^project:([^/]+)(?:\/(.+))?$/.exec(guid);
    if (!match?.[1]) return undefined;
    const folder = library.folderOf(match[1]);
    if (!folder) return undefined;
    const state = path.join(folder, STATE_DIR);
    const rest = match[2];
    if (rest === undefined) return path.join(state, 'root');
    if (rest === 'mentor') return path.join(state, 'mentor');
    const scene = /^scene:([A-Za-z0-9_-]+)(\/history)?$/.exec(rest);
    if (scene?.[1]) return path.join(state, 'scenes', scene[2] ? `${scene[1]}.history` : scene[1]);
    return undefined;
  };
}
