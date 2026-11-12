import {
  entityModules,
  listEntities,
  listSignals,
  readProjectMeta,
  readSingleton,
  singletonModules,
  type EntityInfo,
  type EntityModule,
  type FieldRef,
  type FieldState,
  type ModuleName,
  type OutlineChapter,
  type ProjectMeta,
  type Signal,
  type SingletonModule,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { toRoman } from '../workspace/roman';
import type { AtelierModule } from './module-defs';

/** What the Atelier shows: a singleton module, or one entity. */
export interface SheetTarget {
  readonly module: ModuleName;
  readonly entityId?: string;
}

export interface AtelierData {
  readonly project: ProjectMeta | undefined;
  readonly singletons: Readonly<Record<SingletonModule, Readonly<Record<string, FieldState>>>>;
  /** Live entities; those the author rejected stay stored (not proposed again) but hidden. */
  readonly entities: Readonly<Record<EntityModule, readonly EntityInfo[]>>;
  /** Open conflict signals aimed at a field. */
  readonly conflicts: readonly Signal[];
}

/** Snapshot of everything the Atelier displays (module-level: stable for `useDocSnapshot`). */
export function readAtelier(doc: Y.Doc): AtelierData {
  return {
    project: readProjectMeta(doc),
    singletons: Object.fromEntries(
      singletonModules.map((m) => [m, readSingleton(doc, m)]),
    ) as Record<SingletonModule, Record<string, FieldState>>,
    entities: Object.fromEntries(
      entityModules.map((m) => [m, listEntities(doc, m).filter((e) => e.status !== 'rejected')]),
    ) as Record<EntityModule, EntityInfo[]>,
    conflicts: listSignals(doc, { state: 'open' }).filter(
      (s) => s.kind === 'conflict' && s.fieldRef !== undefined,
    ),
  };
}

const EMPTY: FieldState = { status: undefined, rejected: [] };

export function fieldState(data: AtelierData, target: SheetTarget, field: string): FieldState {
  if (target.entityId === undefined) {
    return data.singletons[target.module as SingletonModule]?.[field] ?? EMPTY;
  }
  const entity = data.entities[target.module as EntityModule]?.find(
    (e) => e.id === target.entityId,
  );
  return entity?.fields[field] ?? EMPTY;
}

export function fieldRefOf(target: SheetTarget, field: string): FieldRef {
  return target.entityId === undefined
    ? { module: target.module as SingletonModule, field }
    : { module: target.module as EntityModule, entityId: target.entityId, field };
}

export function conflictFor(data: AtelierData, ref: FieldRef): Signal | undefined {
  return data.conflicts.find(
    (s) =>
      s.fieldRef?.module === ref.module &&
      s.fieldRef.field === ref.field &&
      ('entityId' in s.fieldRef ? s.fieldRef.entityId : undefined) ===
        ('entityId' in ref ? ref.entityId : undefined),
  );
}

export type ShownStatus = 'proposed' | 'validated' | 'rejected' | 'contradicted' | 'empty';

/** The status a field is drawn with (« contredite » derived, D-9). */
export function shownStatus(state: FieldState, conflict: Signal | undefined): ShownStatus {
  if (state.status === 'validated') return conflict ? 'contradicted' : 'validated';
  return state.status ?? 'empty';
}

/** Entity modules shown under each entry of the rail. */
export const RAIL_SOURCES: Readonly<Record<AtelierModule, readonly ModuleName[]>> = {
  meta: ['meta'],
  characters: ['characters'],
  structure: ['structure', 'acts', 'arcs'],
  worldRules: ['worldRules'],
  clues: ['clues'],
};

/** Proposals waiting for the author in a rail entry (fields and whole entities). */
export function pendingCount(data: AtelierData, rail: AtelierModule): number {
  let count = 0;
  for (const module of RAIL_SOURCES[rail]) {
    if ((singletonModules as readonly string[]).includes(module)) {
      count += Object.values(data.singletons[module as SingletonModule]).filter(
        (f) => f.status === 'proposed',
      ).length;
    } else {
      for (const entity of data.entities[module as EntityModule]) {
        if (entity.status === 'proposed') count++;
        else count += Object.values(entity.fields).filter((f) => f.status === 'proposed').length;
      }
    }
  }
  return count;
}

/** The value shown for a field, whatever its status (author's, proposed or last rejected). */
export function shownValue(state: FieldState): unknown {
  if (state.status === 'validated') return state.value;
  if (state.status === 'proposed') return state.proposal?.value;
  if (state.status === 'rejected') return state.rejected[state.rejected.length - 1]?.value;
  return undefined;
}

/** `II.3`: chapter numeral and scene rank, as the design names scenes. */
export function sceneNumbers(outline: readonly OutlineChapter[]): Map<string, string> {
  const numbers = new Map<string, string>();
  outline.forEach((chapter, ci) =>
    chapter.scenes.forEach((scene, si) => numbers.set(scene.id, `${toRoman(ci + 1)}.${si + 1}`)),
  );
  return numbers;
}
