import type { DeepTask, DeepWorkEstimate, LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  agentOrigin,
  anchorForQuote,
  createAgentWriter,
  fieldChoices,
  fragmentPlainText,
  getScene,
  hashEvidence,
  knownByField,
  listEntities,
  listSignals,
  listTrashedEntities,
  readFieldRef,
  readWorkRecord,
  workKey,
  writeWorkRecord,
  type WorkRef,
  readOutline,
  readSingleton,
  variantFragment,
  type EntityInfo,
  type EntityModule,
  type FieldRef,
  type SceneEvidence,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { sceneContext, sheetsSummary } from './context';
import { notebookForReading } from './memory';
import { narrativeProseIn } from './guard';

/**
 * Specialised agents on demand (D-27, docs/PLAN.md §6.3): background work on
 * the whole manuscript, one section of the Atelier each. They read the
 * project document and leave proposals and signals in it, through the
 * AgentWriter under their own name, and a review in the conversation, in the
 * Compagnon's voice (the author never sees which agent spoke).
 */

/** The agent behind each task: its name in the origins (`agent:<name>`). */
export const DEEP_AGENTS = {
  structure: 'structure',
  clues: 'clues',
  character: 'characters',
} as const satisfies Record<DeepTask, string>;

/** The longest text an agent may propose for one field. */
export const MAX_DEEP_VALUE = 600;
/** The longest review left in the conversation. */
export const MAX_DEEP_REVIEW = 2400;
const MAX_SIGNALS = 8;
/** Room for the model's thinking and its answer. */
const OUTPUT_BUDGET = 16000;
/** What a whole-manuscript answer usually takes (thinking included), for the estimate. */
const EXPECTED_OUTPUT = 6000;

// ─── Schemas ───

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: Record<string, unknown>) => ({ type: 'array', items });
const string = { type: 'string' };
const sceneIds = array(string);

/** A passage of the manuscript: the scene it is in and a verbatim quote of it. */
const passage = { sceneId: string, quote: string };

const signalItem = object({
  ...passage,
  kind: { enum: ['craft', 'clue'] },
  title: string,
  message: string,
  principle: string,
});

const CHARACTER_FIELDS = [
  'desire',
  'fear',
  'wound',
  'contradiction',
  'secret',
  'relations',
  'arc',
] as const;

export const deepWorkSchemas: Record<DeepTask, Record<string, unknown>> = {
  structure: object({
    review: string,
    narrativeModel: nullable({ enum: fieldChoices.structure.narrativeModel }),
    acts: array(
      object({
        existingId: nullable(string),
        title: string,
        summary: string,
        sceneIds,
        ...passage,
      }),
    ),
    arcs: array(
      object({
        existingId: nullable(string),
        title: string,
        kind: { enum: fieldChoices.arcs.kind },
        summary: string,
        sceneIds,
        ...passage,
      }),
    ),
    signals: array(signalItem),
  }),
  clues: object({
    review: string,
    clues: array(
      object({
        existingId: nullable(string),
        title: string,
        kind: { enum: fieldChoices.clues.kind },
        description: string,
        plantedIn: sceneIds,
        appearsIn: sceneIds,
        resolvedIn: sceneIds,
        ...passage,
      }),
    ),
    signals: array(signalItem),
  }),
  character: object({
    review: string,
    fields: array(object({ field: { enum: CHARACTER_FIELDS }, value: string, ...passage })),
    knowledge: array(object({ clueId: string, ...passage })),
    signals: array(signalItem),
  }),
};

interface Passage {
  sceneId: string;
  quote: string;
}
interface SignalOut extends Passage {
  kind: 'craft' | 'clue';
  title: string;
  message: string;
  principle: string;
}
interface Proposed extends Passage {
  existingId: string | null;
  title: string;
}
interface StructureOut {
  review: string;
  narrativeModel: string | null;
  acts: (Proposed & { summary: string; sceneIds: string[] })[];
  arcs: (Proposed & { kind: string; summary: string; sceneIds: string[] })[];
  signals: SignalOut[];
}
interface CluesOut {
  review: string;
  clues: (Proposed & {
    kind: string;
    description: string;
    plantedIn: string[];
    appearsIn: string[];
    resolvedIn: string[];
  })[];
  signals: SignalOut[];
}
interface CharacterOut {
  review: string;
  fields: (Passage & { field: string; value: string })[];
  knowledge: (Passage & { clueId: string })[];
  signals: SignalOut[];
}
export type DeepWorkOutput = StructureOut | CluesOut | CharacterOut;

// ─── Prompts ───

const COMMON = `You are "le Compagnon", an experienced novelist and editor mentoring a beginner novelist. You are reading their WHOLE manuscript, with their sheets, to do one piece of background work. You report it as structured data. You never write the novel: no narrative text, no dialogue, no rewriting, no scene to add.

PASSAGES
Every "quote" is copied VERBATIM from the scene named by "sceneId", 3 to 12 words, within one paragraph. It is how your item is anchored in the text: if you cannot quote it exactly, leave the item out. Scene ids are the ids given in <scene id="…">. Lists of scenes ("sceneIds", "plantedIn"…) hold such ids, in the order of the manuscript.

SIGNALS
"signals" are remarks anchored in the text, at most ${MAX_SIGNALS}, the most important first: where something stops, is missing or is not prepared. Each has a "title" of 2 to 6 words, a short "message" (what you see, as a question where you can, never a verdict), and the craft "principle" behind it. "kind": "clue" for a clue, a red herring or a revelation, "craft" otherwise.

PROPOSALS
Proposed values describe the author's book in a few words (at most ${MAX_DEEP_VALUE} characters); they are notes, never passages of the novel. Use "existingId" for a sheet that already exists (the ids are in <sheets>), null for a new one. Never propose again what the author rejected.

REVIEW
"review" is what you tell the author in the conversation: first what holds, then the two or three points most worth working on, each with its why, and end with one question. At most ${MAX_DEEP_REVIEW} characters. You may quote the author's words briefly to point at passages.`;

const TASKS: Record<DeepTask, string> = {
  structure: `THE WORK: CHECK THE STRUCTURE
Read the manuscript for its shape: acts, the arcs of the story (main and secondary), and the tension along the way. Propose the acts as the manuscript draws them (title, a summary of what turns in it, its scenes), and the arcs (title, kind, summary, the scenes where the arc moves). Propose "narrativeModel" only if the sheets have none and the manuscript clearly follows one, null otherwise. Signal an arc abandoned (anchored in the scene where it stops), an act missing or out of balance, a long stretch where the tension falls.`,
  clues: `THE WORK: TRACK THE CLUES
Read the manuscript for its clues, red herrings and revelations: where each is planted, where it shows again, where it is resolved. Propose the clue sheets with their path (plantedIn, appearsIn, resolvedIn). Signal a clue planted and never used, a revelation that nothing prepares, a red herring never cleared, a character who knows something before the scene where they learn it.`,
  character: `THE WORK: TAKE STOCK OF ONE CHARACTER
The character is given in <character>. Follow them scene by scene: what they want, what they fear, what they know and when they learn it, how they change. Propose the fields of their sheet that the manuscript shows (desire, fear, wound, contradiction, secret, relations, arc), each with the passage that shows it. In "knowledge", the existing clues (ids in <sheets>) this character learns, with the passage where they learn it. Signal where they act against what the sheet says, or on something they cannot know yet, and where their arc stalls.`,
};

export function deepWorkSystemPrompt(task: DeepTask, language: string): string {
  const name = language.startsWith('fr') ? 'French' : 'English';
  return `${COMMON}\n\n${TASKS[task]}\n\nSTYLE\nEverything you write is in ${name}, addresses the author formally ("vous"), in short sentences, without exclamation marks.`;
}

// ─── Context ───

const nameOf = (entity: EntityInfo, field: string) => {
  const state = entity.fields[field];
  const value = state?.value ?? state?.proposal?.value ?? state?.rejected.at(-1)?.value;
  return typeof value === 'string' ? value : '';
};

const allEntities = (root: Y.Doc, module: EntityModule) => [
  ...listEntities(root, module),
  ...listTrashedEntities(root, module),
];

/** The manuscript, scene by scene (active variants), with the ids the agents answer with. */
export function manuscriptOf(root: Y.Doc, sceneDocs: ReadonlyMap<string, Y.Doc>) {
  const scenes: { id: string; variantId: string; title: string; text: string }[] = [];
  const parts: string[] = [];
  readOutline(root).forEach((chapter, ci) => {
    parts.push(`<chapter n="${ci + 1}" title="${chapter.title}">`);
    chapter.scenes.forEach((s, si) => {
      const scene = getScene(root, s.id);
      const doc = sceneDocs.get(s.id);
      if (!scene || !doc) return;
      const text = fragmentPlainText(variantFragment(doc, scene.activeVariantId));
      if (!text.trim()) return;
      scenes.push({ id: s.id, variantId: scene.activeVariantId, title: scene.title, text });
      parts.push(
        `<scene id="${s.id}" n="${ci + 1}.${si + 1}" title="${scene.title}">\n${text}\n</scene>`,
      );
    });
    parts.push('</chapter>');
  });
  return { scenes, text: parts.join('\n') };
}

/** Every sheet with its id and status, so that the agent can point at it (and leave the rejected alone). */
function sheetIds(root: Y.Doc): string {
  const lines: string[] = [];
  for (const module of ['characters', 'acts', 'arcs', 'clues'] as const) {
    const title = module === 'characters' ? 'name' : 'title';
    for (const e of allEntities(root, module))
      lines.push(`${module} ${e.id}: ${nameOf(e, title) || '?'} (${e.status})`);
  }
  return lines.join('\n');
}

function characterBlock(root: Y.Doc, characterId: string | undefined) {
  if (!characterId) return undefined;
  const character = listEntities(root, 'characters').find((c) => c.id === characterId);
  if (!character || character.status === 'rejected') return undefined;
  const fields = Object.entries(character.fields)
    .map(([field, state]) => {
      const value = state.value ?? state.proposal?.value;
      return value === undefined || value === null
        ? undefined
        : `${field} (${state.status}): ${typeof value === 'string' ? value : JSON.stringify(value)}`;
    })
    .filter((line): line is string => line !== undefined);
  return `<character id="${characterId}" name="${nameOf(character, 'name')}">\n${fields.join('\n')}\n</character>`;
}

function contextMessage(
  root: Y.Doc,
  manuscript: string,
  task: DeepTask,
  characterId: string | undefined,
) {
  return [
    `<sheets>\n${sheetIds(root)}\n\nvalidated:\n${sheetsSummary(root)}\n</sheets>`,
    ...(task === 'character' ? [characterBlock(root, characterId) ?? ''] : []),
    `<manuscript>\n${manuscript}\n</manuscript>`,
  ].join('\n\n');
}

// ─── Estimate ───

/** French and English prose: about 3.5 characters per token on Claude's tokenizer. */
const CHARS_PER_TOKEN = 3.5;
/** Opus 5.5, per million tokens (Anthropic first-party rates, November 2026). */
export const DEEP_PRICES = { input: 4, output: 20 } as const;

/** What a task will cost, before it runs (docs/PLAN.md §6.3: cost announced before the work). */
export function estimateDeepWork(input: {
  readonly root: Y.Doc;
  readonly sceneDocs: ReadonlyMap<string, Y.Doc>;
  readonly task: DeepTask;
  readonly characterId?: string;
  /** To say when the manuscript has not changed since the last run. */
  readonly mentorDoc?: Y.Doc;
}): DeepWorkEstimate | undefined {
  const { root, sceneDocs, task, characterId } = input;
  const manuscript = manuscriptOf(root, sceneDocs);
  if (manuscript.scenes.length === 0) return undefined;
  if (task === 'character' && !characterBlock(root, characterId)) return undefined;
  const language = sceneContext(root, undefined, undefined).language;
  const chars =
    deepWorkSystemPrompt(task, language).length +
    contextMessage(root, manuscript.text, task, characterId).length +
    (input.mentorDoc ? notebookForReading(input.mentorDoc).length : 0) +
    JSON.stringify(deepWorkSchemas[task]).length;
  const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN);
  const outputTokens = EXPECTED_OUTPUT;
  const cost = (output: number) =>
    (inputTokens * DEEP_PRICES.input + output * DEEP_PRICES.output) / 1_000_000;
  const reading = inputTokens / READ_TOKENS_PER_SECOND;
  const last = input.mentorDoc && readWorkRecord(input.mentorDoc, workRef(task, characterId));
  return {
    scenes: manuscript.scenes.length,
    words: manuscript.scenes.reduce((n, s) => n + countWords(s.text), 0),
    inputTokens,
    outputTokens,
    usd: cost(outputTokens),
    usdMax: cost(OUTPUT_BUDGET),
    seconds: [
      Math.round(reading + outputTokens / FAST_TOKENS_PER_SECOND),
      Math.round(reading + outputTokens / SLOW_TOKENS_PER_SECOND),
    ],
    ...(last && last.digest === digestOf(manuscript.text) && { unchangedSince: last.at }),
  };
}

/** The pace of the deep model, for the duration announced (rough, on purpose). */
const READ_TOKENS_PER_SECOND = 20_000;
const FAST_TOKENS_PER_SECOND = 90;
const SLOW_TOKENS_PER_SECOND = 45;

const countWords = (text: string) => text.split(/\s+/u).filter(Boolean).length;
const digestOf = (text: string) => hashEvidence([{ sceneId: '', variantId: '', quote: text }]);
const workRef = (task: DeepTask, characterId: string | undefined): WorkRef =>
  task === 'character' ? { task, characterId: characterId ?? '' } : { task };

// ─── The work ───

const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export interface DeepWorkResult {
  readonly proposals: number;
  readonly signals: number;
  readonly resolved: number;
}

/**
 * Runs one task on the whole manuscript. `nothing-to-read` when there is no
 * text yet (or, for a character, no such sheet).
 */
export async function deepWork(input: {
  readonly llm: LlmService;
  readonly root: Y.Doc;
  readonly mentorDoc: Y.Doc;
  readonly sceneDocs: ReadonlyMap<string, Y.Doc>;
  readonly task: DeepTask;
  readonly characterId?: string;
  readonly signal?: AbortSignal;
}): Promise<DeepWorkResult | 'nothing-to-read'> {
  const { root, sceneDocs, task, characterId } = input;
  const manuscript = manuscriptOf(root, sceneDocs);
  if (manuscript.scenes.length === 0) return 'nothing-to-read';
  if (task === 'character' && !characterBlock(root, characterId)) return 'nothing-to-read';
  const language = sceneContext(root, undefined, undefined).language;
  const response = await input.llm.generate(
    {
      system: deepWorkSystemPrompt(task, language),
      messages: [
        {
          role: 'user',
          content: [
            notebookForReading(input.mentorDoc),
            contextMessage(root, manuscript.text, task, characterId),
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      responseSchema: deepWorkSchemas[task],
      maxOutputTokens: OUTPUT_BUDGET,
      tier: 'deep',
    },
    input.signal,
  );
  const output = JSON.parse(response.text) as DeepWorkOutput;
  return applyDeepWork({ ...input, manuscript }, output);
}

/** Files what an agent answered, through its AgentWriter and under every guardrail. */
export function applyDeepWork(
  target: {
    readonly root: Y.Doc;
    readonly mentorDoc: Y.Doc;
    readonly sceneDocs: ReadonlyMap<string, Y.Doc>;
    readonly task: DeepTask;
    readonly characterId?: string;
    readonly manuscript?: ReturnType<typeof manuscriptOf>;
  },
  output: DeepWorkOutput,
): DeepWorkResult {
  const { root, mentorDoc, sceneDocs, task, characterId } = target;
  const manuscript = target.manuscript ?? manuscriptOf(root, sceneDocs);
  const agent = DEEP_AGENTS[task];
  const writer = createAgentWriter(root, agent);
  const order = manuscript.scenes.map((s) => s.id);
  const known = new Set(order);
  const authorText = manuscript.scenes.map((s) => s.text).join('\n');

  /** The passage, if it really is in that scene (otherwise the item is invented). */
  const located = (p: Passage) => {
    const scene = manuscript.scenes.find((s) => s.id === p.sceneId);
    const doc = sceneDocs.get(p.sceneId);
    if (!scene || !doc) return undefined;
    const anchor = anchorForQuote(doc, scene.id, scene.variantId, p.quote);
    if (!anchor) return undefined;
    const evidence: SceneEvidence = {
      sceneId: scene.id,
      variantId: scene.variantId,
      quote: p.quote,
    };
    return { anchor, evidence };
  };
  /** Known scenes, once each, in the manuscript's order. */
  const scenesOf = (ids: readonly string[]) => {
    const wanted = new Set(ids.filter((id) => known.has(id)));
    return order.filter((id) => wanted.has(id));
  };
  /** A note on the book, never a passage of it. */
  const noteOk = (value: string) =>
    value.trim().length > 0 &&
    value.length <= MAX_DEEP_VALUE &&
    narrativeProseIn(value, authorText).length === 0;

  let proposals = 0;
  const propose = (ref: FieldRef, value: string | readonly string[], evidence: SceneEvidence) => {
    if (typeof value === 'string' ? !noteOk(value) : value.length === 0) return;
    if (writer.proposeField(ref, typeof value === 'string' ? value : [...value], [evidence]).ok)
      proposals++;
  };
  /** An existing sheet the agent may still propose on (not rejected, not in the trash). */
  const live = (module: EntityModule, id: string | null, title: string, titleField: string) => {
    const all = allEntities(root, module);
    const existing =
      all.find((e) => e.id === id) ??
      all.find((e) => normalizeName(nameOf(e, titleField)) === normalizeName(title));
    if (!existing) return { existing: undefined, blocked: false };
    const blocked =
      existing.status === 'rejected' ||
      !listEntities(root, module).some((e) => e.id === existing.id);
    return { existing, blocked };
  };

  const proposeSheet = (
    module: 'acts' | 'arcs' | 'clues',
    item: Proposed,
    fields: Record<string, string | readonly string[]>,
  ) => {
    const where = located(item);
    if (!where || !item.title.trim() || item.title.length > 120) return;
    const { existing, blocked } = live(module, item.existingId, item.title, 'title');
    if (blocked) return;
    const usable = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => (typeof v === 'string' ? noteOk(v) : v.length > 0)),
    );
    if (!existing) {
      writer.proposeEntity(
        module,
        {
          title: item.title.trim(),
          ...Object.fromEntries(
            Object.entries(usable).map(([k, v]) => [k, typeof v === 'string' ? v : [...v]]),
          ),
        },
        [where.evidence],
      );
      proposals++;
      return;
    }
    for (const [field, value] of Object.entries(usable))
      propose({ module, entityId: existing.id, field }, value, where.evidence);
  };

  if (task === 'structure') {
    const out = output as StructureOut;
    const current = readSingleton(root, 'structure')['narrativeModel'];
    if (
      out.narrativeModel &&
      (fieldChoices.structure.narrativeModel as readonly string[]).includes(out.narrativeModel) &&
      current?.value === undefined &&
      out.acts[0]
    ) {
      const where = located(out.acts[0]);
      if (
        where &&
        writer.proposeField({ module: 'structure', field: 'narrativeModel' }, out.narrativeModel, [
          where.evidence,
        ]).ok
      )
        proposals++;
    }
    for (const act of out.acts)
      proposeSheet('acts', act, { summary: act.summary, sceneIds: scenesOf(act.sceneIds) });
    for (const arc of out.arcs)
      if ((fieldChoices.arcs.kind as readonly string[]).includes(arc.kind))
        proposeSheet('arcs', arc, {
          kind: arc.kind,
          summary: arc.summary,
          sceneIds: scenesOf(arc.sceneIds),
        });
  } else if (task === 'clues') {
    const out = output as CluesOut;
    for (const clue of out.clues)
      if ((fieldChoices.clues.kind as readonly string[]).includes(clue.kind))
        proposeSheet('clues', clue, {
          kind: clue.kind,
          description: clue.description,
          plantedIn: scenesOf(clue.plantedIn),
          appearsIn: scenesOf(clue.appearsIn),
          resolvedIn: scenesOf(clue.resolvedIn),
        });
  } else if (characterId) {
    const out = output as CharacterOut;
    for (const f of out.fields) {
      if (!(CHARACTER_FIELDS as readonly string[]).includes(f.field)) continue;
      const where = located(f);
      if (where)
        propose(
          { module: 'characters', entityId: characterId, field: f.field },
          f.value,
          where.evidence,
        );
    }
    const clueIds = new Set(listEntities(root, 'clues').map((c) => c.id));
    for (const k of out.knowledge) {
      const where = located(k);
      if (!where || !clueIds.has(k.clueId)) continue;
      const ref: FieldRef = {
        module: 'clues',
        entityId: k.clueId,
        field: knownByField(characterId),
      };
      if (writer.proposeField(ref, { fromSceneId: k.sceneId }, [where.evidence]).ok) proposals++;
    }
  }

  // ─── Signals in the text ───
  const work = workRef(task, characterId);
  const key = workKey(work);
  const before = new Set<string>(readWorkRecord(mentorDoc, work)?.fingerprints ?? []);
  const all = listSignals(root);
  const reported: string[] = [];
  const signalIds: string[] = [];
  let signals = 0;
  for (const s of output.signals.slice(0, MAX_SIGNALS)) {
    const where = located(s);
    if (!where || !s.message.trim() || narrativeProseIn(s.message, authorText).length) continue;
    const kind = s.kind === 'clue' ? 'clue' : 'craft';
    const fingerprint = hashEvidence([
      {
        sceneId: s.sceneId,
        variantId: where.evidence.variantId,
        quote: `${key}|${kind}|${s.quote}`,
      },
    ]);
    reported.push(fingerprint);
    const earlier = all.find((x) => x.fingerprint === fingerprint && x.state !== 'resolved');
    if (earlier) {
      if (earlier.state === 'open') signalIds.push(earlier.id);
      continue;
    }
    const id = writer.raiseSignal({
      kind,
      message: s.message.trim(),
      ...(s.title.trim() && { title: s.title.trim() }),
      principle: s.principle.trim(),
      textAnchor: where.anchor,
      fingerprint,
    });
    signalIds.push(id);
    signals++;
  }
  // This task's remarks of last time that it does not make again.
  let resolved = 0;
  for (const s of all)
    if (
      s.state === 'open' &&
      s.author === 'mentor' &&
      s.fingerprint &&
      before.has(s.fingerprint) &&
      !reported.includes(s.fingerprint) &&
      writer.resolveOwnSignal(s.id)
    )
      resolved++;

  // ─── The review, in the Compagnon's voice ───
  // The interface names and dates it (« Bilan de la structure »): the text is the review alone.
  const review = output.review.trim().slice(0, MAX_DEEP_REVIEW);
  const origin = agentOrigin(agent);
  mentorDoc.transact(() => {
    const reviewId =
      review && narrativeProseIn(review, authorText).length === 0
        ? addChatMessage(mentorDoc, { role: 'compagnon', text: review, work }, origin)
        : undefined;
    writeWorkRecord(
      mentorDoc,
      work,
      {
        at: new Date().toISOString(),
        digest: digestOf(manuscript.text),
        proposals,
        signalIds,
        fingerprints: reported,
        ...(reviewId && { reviewId }),
      },
      origin,
    );
  }, origin);
  return { proposals, signals, resolved };
}

/** Reads a field without throwing (an agent may name a sheet that is gone). */
export function readFieldSafe(root: Y.Doc, ref: FieldRef) {
  try {
    return readFieldRef(root, ref);
  } catch {
    return undefined;
  }
}
