import * as Y from 'yjs';
import {
  agentProposeField,
  authorAcceptProposal,
  authorClearField,
  authorRejectProposal,
  authorSetField,
  fieldKeys,
  readField,
  type Evidence,
  type FieldState,
  type FieldValue,
  type ProposalResult,
} from './fields';
import { names, newId, nowIso } from './ids';
import { AUTHOR, type Origin } from './origins';

/**
 * Modules of a project (docs/SPEC.md §5.3, §15.2). Each module is a top-level
 * map `module:<name>` in the root document.
 *
 * - Singleton modules hold fields directly (Méta; the structure's narrative model).
 * - Entity modules hold one map per entity (a character, an act, a rule…),
 *   which holds the entity's own status keys (`$…`) and its fields.
 */
export const singletonModules = ['meta', 'structure'] as const;
export const entityModules = [
  'characters',
  'acts',
  'arcs',
  'worldRules',
  'clues',
  'style',
] as const;
export type SingletonModule = (typeof singletonModules)[number];
export type EntityModule = (typeof entityModules)[number];
export type ModuleName = SingletonModule | EntityModule;

export const isSingletonModule = (name: string): name is SingletonModule =>
  (singletonModules as readonly string[]).includes(name);
export const isEntityModule = (name: string): name is EntityModule =>
  (entityModules as readonly string[]).includes(name);

/** Known fields per module, for the UI and the agents. Storage accepts any valid key. */
export const knownFields = {
  meta: ['pitch', 'summary', 'intention', 'themes', 'tone', 'genres', 'audience'],
  structure: ['narrativeModel'],
  characters: [
    'name',
    'age',
    'appearance',
    'occupation',
    'residence',
    'desire',
    'fear',
    'wound',
    'contradiction',
    'secret',
    'arc',
    'relations',
    'voice',
    'appearances',
  ],
  acts: ['title', 'summary', 'sceneIds'],
  arcs: ['title', 'kind', 'summary', 'sceneIds'],
  worldRules: ['title', 'statement', 'consequences'],
  // Clues also hold `knownBy:<characterId>` and `knownBy:reader` fields (value: { fromSceneId }).
  clues: ['kind', 'title', 'description', 'plantedIn', 'resolvedIn', 'appearsIn'],
  // Style et voix (phase 6.4): one choice per entity, in the Compagnon's words,
  // drawn from a reference text that is never kept (`source` is its title).
  style: ['category', 'choice', 'measure', 'source', 'sourceAuthor'],
} as const satisfies Record<ModuleName, readonly string[]>;

/** What a style choice is about (phase 6.4). */
export const styleCategories = [
  'pointOfView',
  'tense',
  'sentences',
  'dialogue',
  'description',
  'register',
  'chapters',
  'other',
] as const;
export type StyleCategory = (typeof styleCategories)[number];

/** The values a choice field accepts (shown as a list in the Atelier, checked for agents). */
export const fieldChoices = {
  structure: {
    narrativeModel: ['threeActs', 'fiveActs', 'herosJourney', 'saveTheCat', 'kishotenketsu'],
  },
  arcs: { kind: ['main', 'secondary'] },
  clues: { kind: ['clue', 'redHerring', 'revelation'] },
  style: { category: styleCategories },
} as const satisfies Partial<Record<ModuleName, Readonly<Record<string, readonly string[]>>>>;

export const knownByField = (who: string | 'reader') => `knownBy:${who}`;

/** Address of one field: a singleton module's field, or an entity's field. */
export type FieldRef =
  | { readonly module: SingletonModule; readonly field: string }
  | { readonly module: EntityModule; readonly entityId: string; readonly field: string };

export type EntityStatus = 'proposed' | 'validated' | 'rejected';

export interface EntityInfo {
  readonly id: string;
  readonly status: EntityStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly fields: Readonly<Record<string, FieldState>>;
}

type YMap = Y.Map<unknown>;

export const moduleMap = (doc: Y.Doc, module: ModuleName): YMap =>
  doc.getMap<unknown>(names.module(module));

export function entityMap(doc: Y.Doc, module: EntityModule, entityId: string): YMap {
  const entity = moduleMap(doc, module).get(entityId);
  if (!(entity instanceof Y.Map)) throw new Error(`Unknown ${module} entity: ${entityId}`);
  return entity as YMap;
}

export function fieldContainer(doc: Y.Doc, ref: FieldRef): YMap {
  return 'entityId' in ref ? entityMap(doc, ref.module, ref.entityId) : moduleMap(doc, ref.module);
}

function entityStatus(entity: YMap): EntityStatus {
  if (entity.get('$rejectedAt') !== undefined) return 'rejected';
  if (entity.get('$validatedAt') !== undefined || entity.get('$createdBy') === 'author')
    return 'validated';
  return 'proposed';
}

const isTrashed = (entity: YMap) => entity.get('$trashedAt') !== undefined;

function toEntityInfo(id: string, entity: YMap): EntityInfo {
  return {
    id,
    status: entityStatus(entity),
    createdBy: String(entity.get('$createdBy') ?? ''),
    createdAt: String(entity.get('$createdAt') ?? ''),
    fields: Object.fromEntries(fieldKeys(entity).map((f) => [f, readField(entity, f)])),
  };
}

// ─── Reading ─────────────────────────────────────────────────────────────

export function readFieldRef(doc: Y.Doc, ref: FieldRef): FieldState {
  return readField(fieldContainer(doc, ref), ref.field);
}

export function readSingleton(doc: Y.Doc, module: SingletonModule): Record<string, FieldState> {
  const container = moduleMap(doc, module);
  return Object.fromEntries(fieldKeys(container).map((f) => [f, readField(container, f)]));
}

const byCreation = (a: EntityInfo, b: EntityInfo) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

/** Entities of a module in creation order, trashed ones excluded. */
export function listEntities(doc: Y.Doc, module: EntityModule): EntityInfo[] {
  return [...moduleMap(doc, module).entries()]
    .filter((e): e is [string, YMap] => e[1] instanceof Y.Map && !isTrashed(e[1] as YMap))
    .map(([id, entity]) => toEntityInfo(id, entity))
    .sort(byCreation);
}

/** Trashed entities of a module, most recently trashed first. */
export function listTrashedEntities(
  doc: Y.Doc,
  module: EntityModule,
): (EntityInfo & { readonly trashedAt: string })[] {
  return [...moduleMap(doc, module).entries()]
    .filter((e): e is [string, YMap] => e[1] instanceof Y.Map && isTrashed(e[1] as YMap))
    .map(([id, entity]) => ({
      ...toEntityInfo(id, entity),
      trashedAt: String(entity.get('$trashedAt')),
    }))
    .sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : a.trashedAt > b.trashedAt ? -1 : 0));
}

export function getEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
): EntityInfo | undefined {
  const entity = moduleMap(doc, module).get(entityId);
  return entity instanceof Y.Map && !isTrashed(entity as YMap)
    ? toEntityInfo(entityId, entity as YMap)
    : undefined;
}

// ─── Author operations ───────────────────────────────────────────────────

export function setField(
  doc: Y.Doc,
  ref: FieldRef,
  value: FieldValue,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => authorSetField(fieldContainer(doc, ref), ref.field, value), origin);
}

export function clearField(doc: Y.Doc, ref: FieldRef, origin: Origin = AUTHOR): void {
  doc.transact(() => authorClearField(fieldContainer(doc, ref), ref.field), origin);
}

export function acceptProposal(doc: Y.Doc, ref: FieldRef, origin: Origin = AUTHOR): void {
  doc.transact(() => authorAcceptProposal(fieldContainer(doc, ref), ref.field), origin);
}

export function rejectProposal(doc: Y.Doc, ref: FieldRef, origin: Origin = AUTHOR): void {
  doc.transact(() => authorRejectProposal(fieldContainer(doc, ref), ref.field), origin);
}

/** Creates an entity entered by the author: it and its fields are validated. */
export function createEntity(
  doc: Y.Doc,
  module: EntityModule,
  fields: Readonly<Record<string, FieldValue>> = {},
  origin: Origin = AUTHOR,
): string {
  const id = newId();
  doc.transact(() => {
    const entity = new Y.Map<unknown>();
    moduleMap(doc, module).set(id, entity);
    entity.set('$createdBy', 'author');
    entity.set('$createdAt', nowIso());
    for (const [field, value] of Object.entries(fields)) authorSetField(entity, field, value);
  }, origin);
  return id;
}

export function validateEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const entity = entityMap(doc, module, entityId);
    entity.set('$validatedAt', nowIso());
    entity.delete('$rejectedAt');
  }, origin);
}

export function rejectEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => {
    const entity = entityMap(doc, module, entityId);
    entity.set('$rejectedAt', nowIso());
    entity.delete('$validatedAt');
  }, origin);
}

/**
 * The author takes back an entry they rejected (« Reprendre »): it is a
 * proposal again, for them to validate or reject (docs/DESIGN.md §4.5).
 */
export function reconsiderEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => entityMap(doc, module, entityId).delete('$rejectedAt'), origin);
}

/** Moves an entity to the trash (never a hard delete). */
export function trashEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => entityMap(doc, module, entityId).set('$trashedAt', nowIso()), origin);
}

export function restoreEntity(
  doc: Y.Doc,
  module: EntityModule,
  entityId: string,
  origin: Origin = AUTHOR,
): void {
  doc.transact(() => entityMap(doc, module, entityId).delete('$trashedAt'), origin);
}

// ─── Agent operations (used through AgentWriter only) ────────────────────

export function proposeFieldValue(
  doc: Y.Doc,
  ref: FieldRef,
  proposal: { value: FieldValue; agent: string; evidence: readonly Evidence[] },
  origin: Origin,
): ProposalResult | { readonly ok: false; readonly reason: 'entity-rejected' } {
  let result: ProposalResult | { readonly ok: false; readonly reason: 'entity-rejected' } = {
    ok: true,
  };
  doc.transact(() => {
    const container = fieldContainer(doc, ref);
    if ('entityId' in ref && (entityStatus(container) === 'rejected' || isTrashed(container))) {
      result = { ok: false, reason: 'entity-rejected' };
      return;
    }
    result = agentProposeField(container, ref.field, proposal);
  }, origin);
  return result;
}

export function proposeEntityWithFields(
  doc: Y.Doc,
  module: EntityModule,
  input: {
    agent: string;
    fields: Readonly<Record<string, FieldValue>>;
    evidence: readonly Evidence[];
  },
  origin: Origin,
): string {
  const id = newId();
  doc.transact(() => {
    const entity = new Y.Map<unknown>();
    moduleMap(doc, module).set(id, entity);
    entity.set('$createdBy', `agent:${input.agent}`);
    entity.set('$createdAt', nowIso());
    for (const [field, value] of Object.entries(input.fields)) {
      agentProposeField(entity, field, { value, agent: input.agent, evidence: input.evidence });
    }
  }, origin);
  return id;
}
