import type * as Y from 'yjs';
import { interviewSections, type InterviewSection } from './mentor-chat';
import { listEntities, readSingleton, type EntityModule, type SingletonModule } from './modules';

/**
 * How far each section of the Atelier is filled, for the interview with the
 * Compagnon (D-26): which section the guided mode asks about, and the dots of
 * its progress line.
 */
export type SectionState = 'empty' | 'proposed' | 'validated';

const entitiesState = (root: Y.Doc, modules: readonly EntityModule[]): SectionState => {
  const entities = modules
    .flatMap((m) => listEntities(root, m))
    .filter((e) => e.status !== 'rejected');
  if (entities.some((e) => e.status === 'validated')) return 'validated';
  return entities.length ? 'proposed' : 'empty';
};

const singletonState = (root: Y.Doc, module: SingletonModule, keys: readonly string[]) => {
  const fields = readSingleton(root, module);
  const states = keys.map((k) => fields[k]?.status);
  if (states.some((s) => s === 'validated')) return 'validated';
  return states.some((s) => s === 'proposed') ? 'proposed' : 'empty';
};

/** How far each section of the Atelier is filled. */
export function sectionStates(root: Y.Doc): Record<InterviewSection, SectionState> {
  const structure = singletonState(root, 'structure', ['narrativeModel']);
  const acts = entitiesState(root, ['acts', 'arcs']);
  const rank = { empty: 0, proposed: 1, validated: 2 } as const;
  return {
    meta: singletonState(root, 'meta', ['pitch', 'intention']),
    characters: entitiesState(root, ['characters']),
    structure: rank[structure] >= rank[acts] ? structure : acts,
    worldRules: entitiesState(root, ['worldRules']),
    clues: entitiesState(root, ['clues']),
  };
}

/**
 * The section the guided interview asks about: the first empty one, then the
 * first only proposed, in the Atelier's order; none when all are validated.
 */
export function nextSection(
  root: Y.Doc,
  skip: readonly InterviewSection[] = [],
): InterviewSection | null {
  const states = sectionStates(root);
  const open = interviewSections.filter((s) => !skip.includes(s));
  return (
    open.find((s) => states[s] === 'empty') ?? open.find((s) => states[s] === 'proposed') ?? null
  );
}

/** Up to this many dots per section in the progress line. */
const SLOTS = 5;

/**
 * The progress line of the guided interview (docs/DESIGN.md §4.5): a dot per
 * slot of each section, full when the author validated it.
 */
export function sectionProgress(root: Y.Doc): Record<InterviewSection, boolean[]> {
  const validated = (module: SingletonModule, keys: readonly string[]) => {
    const fields = readSingleton(root, module);
    return keys.map((k) => fields[k]?.status === 'validated');
  };
  const entities = (module: EntityModule, count: number) => {
    const done = listEntities(root, module).filter((e) => e.status === 'validated').length;
    return Array.from({ length: count }, (_, i) => i < done);
  };
  const characters = listEntities(root, 'characters').filter((e) => e.status !== 'rejected');
  const protagonist = characters.find((c) => c.status === 'validated') ?? characters[0];
  return {
    meta: validated('meta', ['pitch', 'intention', 'tone', 'genres', 'audience']),
    characters: ['name', 'desire', 'fear', 'wound', 'arc']
      .slice(0, SLOTS)
      .map((f) => protagonist?.fields[f]?.status === 'validated'),
    structure: [...validated('structure', ['narrativeModel']), ...entities('acts', 3)],
    worldRules: entities('worldRules', 3),
    clues: entities('clues', 3),
  };
}
