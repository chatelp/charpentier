import type { LlmService } from '@charpentier/platform';
import {
  anchorForQuote,
  createAgentWriter,
  getScene,
  hashEvidence,
  knownByField,
  listEntities,
  listSignals,
  listTrashedEntities,
  readFieldRef,
  readOutline,
  type AgentWriter,
  type EntityInfo,
  type EntityModule,
  type Evidence,
  type FieldRef,
  type FieldValue,
  type Signal,
  type SignalKind,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { sceneContext, sheetsSummary } from './context';
import { changeRatio, isOneSentence, MAX_CORRECTION_RATIO, narrativeProseIn } from './guard';
import type { MentorLevel } from './prompts';

const CHARACTER_FIELDS = [
  'age',
  'appearance',
  'occupation',
  'residence',
  'desire',
  'fear',
  'wound',
  'contradiction',
  'secret',
  'relations',
  'voice',
] as const;

const REMARK_KINDS = ['craft', 'clue', 'language', 'encouragement'] as const;
type RemarkKind = (typeof REMARK_KINDS)[number];

/** Which remarks each level of the slider lets through (D-19). Conflicts: always. */
export function remarkKindsFor(level: MentorLevel): readonly RemarkKind[] {
  switch (level) {
    case 1:
      return [];
    case 2:
      return ['clue', 'language'];
    case 3:
      return ['clue', 'language', 'craft'];
    case 4:
      return REMARK_KINDS;
  }
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: Record<string, unknown>) => ({ type: 'array', items });
const string = { type: 'string' };

/** JSON Schema of a scene analysis (structured output; every field required, null when empty). */
export const analysisSchema = object({
  characters: array(
    object({
      name: string,
      existingId: nullable(string),
      quote: string,
      fields: array(object({ field: { enum: CHARACTER_FIELDS }, value: string, quote: string })),
    }),
  ),
  worldRules: array(object({ title: string, statement: string, quote: string })),
  clues: array(
    object({
      existingId: nullable(string),
      title: string,
      kind: { enum: ['clue', 'redHerring', 'revelation'] },
      role: { enum: ['planted', 'appears', 'resolved'] },
      quote: string,
    }),
  ),
  knowledge: array(object({ clueId: string, who: string, quote: string })),
  conflicts: array(
    object({
      module: { enum: ['characters', 'worldRules', 'clues'] },
      entityId: string,
      field: string,
      quote: string,
      title: string,
      message: string,
      principle: string,
    }),
  ),
  remarks: array(
    object({
      kind: { enum: REMARK_KINDS },
      quote: string,
      title: string,
      message: string,
      principle: string,
      correction: nullable(string),
      example: nullable(string),
    }),
  ),
});

interface Analysis {
  characters: {
    name: string;
    existingId: string | null;
    quote: string;
    fields: { field: string; value: string; quote: string }[];
  }[];
  worldRules: { title: string; statement: string; quote: string }[];
  clues: {
    existingId: string | null;
    title: string;
    kind: string;
    role: 'planted' | 'appears' | 'resolved';
    quote: string;
  }[];
  knowledge: { clueId: string; who: string; quote: string }[];
  conflicts: {
    module: EntityModule;
    entityId: string;
    field: string;
    quote: string;
    title?: string;
    message: string;
    principle: string;
  }[];
  remarks: {
    kind: RemarkKind;
    quote: string;
    title?: string;
    message: string;
    principle: string;
    correction: string | null;
    example: string | null;
  }[];
}

export function analysisSystemPrompt(input: { language: string; level: MentorLevel }): string {
  const kinds = remarkKindsFor(input.level);
  const language = input.language.startsWith('fr') ? 'French' : 'English';
  return `You are "le Compagnon", an experienced novelist and editor mentoring a beginner novelist. You are reading one scene they have just finished, with their sheets (characters, world rules, clues) and the outline of their manuscript. You report what you notice as structured data. You never write the novel: no narrative text, no dialogue, no rewriting. A "correction" fixes language only (spelling, grammar, agreement) and changes as little as possible. An "example" is at most ONE sentence that illustrates a craft point; usually null.

QUOTES
Every "quote" is copied VERBATIM from the scene text, 3 to 12 words, within one paragraph. It is how your remark is anchored in the text: if you cannot quote it exactly, leave the item out.

WHAT TO REPORT
- characters: characters who appear or are named in this scene. Use "existingId" when the character already has a sheet (match by name), null otherwise. "fields": only facts the scene states or clearly shows (age, appearance, occupation, residence, desire, fear, wound, contradiction, secret, relations, voice), each with the quote that supports it. Never invent.
- worldRules: laws or constraints of the story's world that the scene establishes, if any.
- clues: clues, red herrings and revelations this scene plants, shows again or resolves ("existingId" for an existing clue sheet).
- knowledge: for existing clues, who learns of the clue in this scene ("who" is a character id or "reader").
- conflicts: places where the scene contradicts a VALIDATED fact of the sheets (module, entityId, field as given in the sheets). A character acting on information before the scene where they learn it is a conflict on the clue's knownBy field. Say what differs; do not decide which is right.
- remarks: ${kinds.length ? `only of these kinds: ${kinds.join(', ')}.` : 'none (leave the list empty).'} "craft" = a point about the writing (stakes, point of view, rhythm, showing vs telling, dialogue); "clue" = a clue never exploited, a revelation not prepared, a red herring never resolved; "language" = a grammar or agreement error, with its "correction"; "encouragement" = something that works, said simply. Each remark has a "title" of 2 to 6 words naming it, and gives the craft "principle" behind it (the why). Few and important beats many and minor: at most 5 remarks.

STYLE
Messages are in ${language}, address the author formally ("vous"), short sentences, no exclamation marks, questions rather than verdicts where you can.`;
}

function contextMessage(root: Y.Doc, sceneDoc: Y.Doc, sceneId: string): string {
  const outline = readOutline(root)
    .map((chapter, ci) =>
      chapter.scenes
        .map(
          (s, si) =>
            `${ci + 1}.${si + 1} ${s.title}${s.id === sceneId ? ' (this scene)' : ''} [${s.id}]`,
        )
        .join('\n'),
    )
    .join('\n');
  const characters = listEntities(root, 'characters')
    .map(
      (c) =>
        `${c.id}: ${String(c.fields['name']?.value ?? c.fields['name']?.proposal?.value ?? '?')} (${c.status})`,
    )
    .join('\n');
  const clues = listEntities(root, 'clues')
    .map(
      (c) =>
        `${c.id}: ${String(c.fields['title']?.value ?? c.fields['title']?.proposal?.value ?? '?')}`,
    )
    .join('\n');
  const { scene } = sceneContext(root, sceneDoc, sceneId);
  return [
    `<outline>\n${outline}\n</outline>`,
    `<sheet_ids>\ncharacters:\n${characters}\nclues:\n${clues}\n</sheet_ids>`,
    `<validated_sheets>\n${sheetsSummary(root)}\n</validated_sheets>`,
    `<scene title="${scene?.title ?? ''}">\n${scene?.text ?? ''}\n</scene>`,
  ].join('\n\n');
}

const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const nameOf = (entity: EntityInfo, field: string) => {
  const state = entity.fields[field];
  const value = state?.value ?? state?.proposal?.value ?? state?.rejected.at(-1)?.value;
  return typeof value === 'string' ? value : '';
};

/** Every entity of a module, trashed and rejected included (so nothing refused comes back). */
const allEntities = (root: Y.Doc, module: EntityModule) => [
  ...listEntities(root, module),
  ...listTrashedEntities(root, module),
];

export interface AnalysisResult {
  readonly proposals: number;
  readonly signals: number;
  readonly resolved: number;
}

/**
 * Bottom-up analysis of a finished scene (docs/SPEC.md §7.2, §7.4, §5.6):
 * proposals in the sheets, conflicts with validated facts, clue tracking and
 * remarks anchored in the text, all through the AgentWriter (statuses are
 * respected: a validated or rejected field is never overwritten). Remarks of
 * an earlier analysis of this scene that are not reported again are resolved.
 */
export async function analyzeScene(input: {
  readonly llm: LlmService;
  readonly root: Y.Doc;
  readonly sceneDoc: Y.Doc;
  readonly sceneId: string;
  readonly level: MentorLevel;
  /** `fast` for the frequent automatic analyses (Haiku when the author chose it, D-20). */
  readonly tier?: 'fast' | 'deep';
  readonly signal?: AbortSignal;
}): Promise<AnalysisResult> {
  const { root, sceneDoc, sceneId, level } = input;
  const scene = getScene(root, sceneId);
  if (!scene) return { proposals: 0, signals: 0, resolved: 0 };
  const variantId = scene.activeVariantId;
  const language = sceneContext(root, sceneDoc, sceneId).language;
  const response = await input.llm.generate(
    {
      system: analysisSystemPrompt({ language, level }),
      messages: [{ role: 'user', content: contextMessage(root, sceneDoc, sceneId) }],
      responseSchema: analysisSchema,
      maxOutputTokens: 16000,
      tier: input.tier ?? 'deep',
    },
    input.signal,
  );
  const analysis = JSON.parse(response.text) as Analysis;
  return applyAnalysis(
    createAgentWriter(root, 'scene-analysis'),
    { root, sceneDoc, sceneId, variantId, level },
    analysis,
  );
}

export function applyAnalysis(
  writer: AgentWriter,
  target: { root: Y.Doc; sceneDoc: Y.Doc; sceneId: string; variantId: string; level: MentorLevel },
  analysis: Analysis,
): AnalysisResult {
  const { root, sceneDoc, sceneId, variantId } = target;
  const sceneText = sceneContext(root, sceneDoc, sceneId).scene?.text ?? '';
  const evidence = (quote: string): Evidence[] => [{ sceneId, variantId, quote }];
  const anchor = (quote: string) => anchorForQuote(sceneDoc, sceneId, variantId, quote);
  let proposals = 0;
  let signals = 0;

  // ─── Sheets (bottom-up) ───
  const characters = allEntities(root, 'characters');
  for (const c of analysis.characters) {
    if (!anchor(c.quote)) continue; // Not in the text: invented.
    const existing =
      characters.find((e) => e.id === c.existingId) ??
      characters.find((e) => normalizeName(nameOf(e, 'name')) === normalizeName(c.name));
    const fields = Object.fromEntries(
      c.fields
        .filter((f) => anchor(f.quote) && (CHARACTER_FIELDS as readonly string[]).includes(f.field))
        .map((f) => [f.field, f.value]),
    );
    if (!existing) {
      writer.proposeEntity('characters', { name: c.name, ...fields }, evidence(c.quote));
      proposals++;
      continue;
    }
    if (
      existing.status === 'rejected' ||
      !listEntities(root, 'characters').some((e) => e.id === existing.id)
    )
      continue;
    for (const f of c.fields) {
      if (!(f.field in fields)) continue;
      const result = writer.proposeField(
        { module: 'characters', entityId: existing.id, field: f.field },
        f.value,
        evidence(f.quote),
      );
      if (result.ok) proposals++;
    }
  }

  const rules = allEntities(root, 'worldRules');
  for (const rule of analysis.worldRules) {
    if (
      !anchor(rule.quote) ||
      rules.some((r) => normalizeName(nameOf(r, 'title')) === normalizeName(rule.title))
    )
      continue;
    writer.proposeEntity(
      'worldRules',
      { title: rule.title, statement: rule.statement },
      evidence(rule.quote),
    );
    proposals++;
  }

  const clues = allEntities(root, 'clues');
  const roleField = { planted: 'plantedIn', appears: 'appearsIn', resolved: 'resolvedIn' } as const;
  for (const clue of analysis.clues) {
    if (!anchor(clue.quote)) continue;
    const existing =
      clues.find((e) => e.id === clue.existingId) ??
      clues.find((e) => normalizeName(nameOf(e, 'title')) === normalizeName(clue.title));
    if (!existing) {
      writer.proposeEntity(
        'clues',
        { title: clue.title, kind: clue.kind, [roleField[clue.role]]: [sceneId] },
        evidence(clue.quote),
      );
      proposals++;
      continue;
    }
    if (existing.status === 'rejected') continue;
    const ref: FieldRef = { module: 'clues', entityId: existing.id, field: roleField[clue.role] };
    const current = readFieldRef(root, ref);
    const scenes = new Set<string>(
      Array.isArray(current.value)
        ? current.value.filter((v): v is string => typeof v === 'string')
        : [],
    );
    if (scenes.has(sceneId)) continue;
    const order = readOutline(root).flatMap((ch) => ch.scenes.map((s) => s.id));
    const value: FieldValue = order.filter((id) => scenes.has(id) || id === sceneId);
    if (writer.proposeField(ref, value, evidence(clue.quote)).ok) proposals++;
  }

  const characterIds = new Set(listEntities(root, 'characters').map((c) => c.id));
  for (const k of analysis.knowledge) {
    if (!anchor(k.quote) || !clues.some((c) => c.id === k.clueId)) continue;
    if (k.who !== 'reader' && !characterIds.has(k.who)) continue;
    const ref: FieldRef = { module: 'clues', entityId: k.clueId, field: knownByField(k.who) };
    if (writer.proposeField(ref, { fromSceneId: sceneId }, evidence(k.quote)).ok) proposals++;
  }

  // ─── Remarks in the text ───
  const all = listSignals(root);
  const reported = new Set<string>();
  const raise = (signal: {
    kind: SignalKind;
    quote: string;
    title?: string;
    message: string;
    principle: string;
    fieldRef?: FieldRef;
    suggestion?: Signal['suggestion'];
  }) => {
    const textAnchor = anchor(signal.quote);
    if (!textAnchor) return;
    if (narrativeProseIn(signal.message, sceneText).length) return; // The rule, here too.
    const fingerprint = hashEvidence([
      {
        sceneId,
        variantId,
        quote: `${signal.kind}|${signal.quote}|${signal.fieldRef ? `${signal.fieldRef.module}.${'entityId' in signal.fieldRef ? signal.fieldRef.entityId : ''}.${signal.fieldRef.field}` : ''}`,
      },
    ]);
    reported.add(fingerprint);
    // Raised before and still open, or dismissed by the author: not again.
    if (all.some((s) => s.fingerprint === fingerprint && s.state !== 'resolved')) return;
    writer.raiseSignal({
      kind: signal.kind,
      message: signal.message,
      ...(signal.title && { title: signal.title }),
      principle: signal.principle,
      textAnchor,
      fingerprint,
      ...(signal.fieldRef && { fieldRef: signal.fieldRef }),
      ...(signal.suggestion && { suggestion: signal.suggestion }),
    });
    signals++;
  };

  for (const conflict of analysis.conflicts) {
    const ref = {
      module: conflict.module,
      entityId: conflict.entityId,
      field: conflict.field,
    } as FieldRef;
    try {
      if (readFieldRef(root, ref).status !== 'validated') continue; // Only validated facts conflict (D-9).
    } catch {
      continue;
    }
    raise({
      kind: 'conflict',
      quote: conflict.quote,
      ...(conflict.title && { title: conflict.title }),
      message: conflict.message,
      principle: conflict.principle,
      fieldRef: ref,
    });
  }

  const allowed = new Set(remarkKindsFor(target.level));
  for (const remark of analysis.remarks) {
    if (!allowed.has(remark.kind)) continue;
    const suggestion: Signal['suggestion'] | undefined =
      remark.kind === 'language' &&
      remark.correction &&
      changeRatio(remark.quote, remark.correction) <= MAX_CORRECTION_RATIO
        ? { kind: 'correction', text: remark.correction }
        : remark.example &&
            isOneSentence(remark.example) &&
            !narrativeProseIn(remark.example, sceneText).some((v) => v.kind === 'quote')
          ? { kind: 'example', text: remark.example }
          : undefined;
    if (remark.kind === 'language' && suggestion?.kind !== 'correction') continue;
    raise({
      kind: remark.kind === 'encouragement' ? 'craft' : remark.kind,
      quote: remark.quote,
      ...(remark.title && { title: remark.title }),
      message: remark.message,
      principle: remark.principle,
      ...(suggestion && { suggestion }),
    });
  }

  // Earlier remarks on this scene that the text no longer calls for.
  let resolved = 0;
  for (const s of all) {
    if (s.state !== 'open' || s.author !== 'mentor' || s.textAnchor?.sceneId !== sceneId) continue;
    if (s.fingerprint && reported.has(s.fingerprint)) continue;
    if (s.kind === 'external-edit') continue;
    if (writer.resolveOwnSignal(s.id)) resolved++;
  }
  return { proposals, signals, resolved };
}
