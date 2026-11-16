import {
  entityModules,
  listEntities,
  readSingleton,
  singletonModules,
  type EntityInfo,
  type EntityModule,
  type FieldState,
} from '@charpentier/schema';
import type * as Y from 'yjs';

/**
 * The Atelier as files (docs/PLAN.md phase 6.5): for the Compagnon, the
 * author's sheets are a source like his notebook, in the same tree
 * (`/memories/atelier/…`), read the same way. Read only: he changes the
 * Atelier through proposals the author validates, never by writing here.
 * Each file gives the sheet's id and status, then its fields with theirs
 * (validated: the author's decision; proposed: waiting; rejected: refused).
 */

export const ATELIER_DIR = '/memories/atelier';

const FOLDERS: Record<EntityModule, string> = {
  characters: 'personnages',
  acts: 'actes',
  arcs: 'arcs',
  worldRules: 'regles-du-monde',
  clues: 'indices',
  style: 'style-et-voix',
};

const TITLE: Record<EntityModule, string> = {
  characters: 'name',
  acts: 'title',
  arcs: 'title',
  worldRules: 'title',
  clues: 'title',
  style: 'choice',
};

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'sans-titre';

const shown = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

function describe(field: string, state: FieldState | undefined): string | undefined {
  if (!state) return undefined;
  const lines: string[] = [];
  if (state.value !== undefined && state.value !== null)
    lines.push(
      `${field} (${state.status === 'validated' ? 'validated' : state.status}): ${shown(state.value)}`,
    );
  if (state.proposal) lines.push(`${field} (proposed): ${shown(state.proposal.value)}`);
  for (const rejected of state.rejected)
    lines.push(`${field} (rejected): ${shown(rejected.value)}`);
  return lines.length ? lines.join('\n') : undefined;
}

const titleOf = (module: EntityModule, entity: EntityInfo) => {
  const state = entity.fields[TITLE[module]];
  const value = state?.value ?? state?.proposal?.value ?? state?.rejected.at(-1)?.value;
  return typeof value === 'string' ? value : '';
};

/** Every sheet of the Atelier as a file: path → text. */
export function atelierFiles(root: Y.Doc): Map<string, string> {
  const files = new Map<string, string>();
  const project = singletonModules
    .flatMap((module) =>
      Object.entries(readSingleton(root, module)).map(([field, state]) =>
        describe(`${module}.${field}`, state),
      ),
    )
    .filter((line): line is string => line !== undefined);
  files.set(`${ATELIER_DIR}/projet.md`, project.join('\n') || '(empty)');
  for (const module of entityModules) {
    const used = new Set<string>();
    for (const entity of listEntities(root, module)) {
      let name = slug(titleOf(module, entity));
      while (used.has(name)) name = `${name}-${entity.id.slice(0, 4)}`;
      used.add(name);
      const body = Object.entries(entity.fields)
        .map(([field, state]) => describe(field, state))
        .filter((line): line is string => line !== undefined);
      files.set(
        `${ATELIER_DIR}/${FOLDERS[module]}/${name}.md`,
        [`module: ${module} · id: ${entity.id} · sheet ${entity.status}`, ...body].join('\n'),
      );
    }
  }
  return files;
}
