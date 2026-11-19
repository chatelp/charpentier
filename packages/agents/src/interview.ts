import { UnusableAnswerError } from './answer';
import type { LlmService } from '@charpentier/platform';
import {
  addInterviewMessage,
  agentOrigin,
  companionThread,
  createAgentWriter,
  fieldChoices,
  interviewMessages,
  knownFields,
  listEntities,
  listTrashedEntities,
  readMentorLevel,
  readProjectMeta,
  readSingleton,
  type EntityInfo,
  type EntityModule,
  type FieldState,
  type InterviewEvidence,
  type InterviewMessage,
  type InterviewMode,
  type InterviewPlacement,
  type InterviewSection,
  nextSection,
  type SingletonModule,
  bornIn,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import {
  generateWithMemory,
  MEMORY_INSTRUCTIONS,
  leavingAlert,
  leavingSoon,
  projectMemory,
  stableThread,
  windowStart,
} from './memory';
import { bookContext } from './book-context';
import { keepThreadSummary } from './thread-summary';
import { narrativeProseIn } from './guard';
import { compagnonSystemPrompt, type MentorLevel } from './prompts';

/**
 * The interview with the Compagnon (D-26, docs/PLAN.md phase 6.1): the
 * Atelier filled by talking. In free mode the author says what they want and
 * the Compagnon puts what belongs to the Atelier in the right section; in
 * guided mode the specialist of one section (D-27) asks one question at a
 * time, the emptiest section first. Either way it only leaves proposals,
 * drawn from the author's own words, and never a line of the novel.
 */

/**
 * What the interview may fill: text and choice fields, never scene references.
 * Style et voix is filled from reference texts (phase 6.4), not by talking.
 */
export const INTERVIEW_FIELDS = {
  meta: ['pitch', 'summary', 'intention', 'themes', 'tone', 'genres', 'audience'],
  structure: ['narrativeModel'],
  characters: knownFields.characters.filter((f) => f !== 'appearances'),
  acts: ['title', 'summary'],
  arcs: ['title', 'kind', 'summary'],
  worldRules: ['title', 'statement', 'consequences'],
  clues: ['title', 'kind', 'description'],
} as const satisfies Record<Exclude<SingletonModule | EntityModule, 'style'>, readonly string[]>;

type InterviewModule = keyof typeof INTERVIEW_FIELDS;
const MODULES = Object.keys(INTERVIEW_FIELDS) as InterviewModule[];
const ALL_FIELDS = [...new Set(Object.values(INTERVIEW_FIELDS).flat())];

/** The field that names an entity (its sheet's title). */
const titleField = (module: EntityModule) => (module === 'characters' ? 'name' : 'title');

/** Longest value the interview may propose: a sheet's field, not a page. */
export const MAX_INTERVIEW_VALUE = 600;
/** Author messages a proposal may quote, counting back from the last one. */
const QUOTED_MESSAGES = 6;
/** Turns of the interview sent back to the model. */
const HISTORY = 30;

/**
 * The specialist of each section (D-27): what it looks for, the questions
 * it asks in guided mode. The Compagnon remains the only voice.
 */
export const SECTION_SPECIALISTS: Record<InterviewSection, string> = {
  meta: `THE PROJECT (module "meta"). You look for the book as a whole: the pitch in one sentence (who wants what, against what), what the author intends the reader to feel or understand ("intention"), themes, tone, genres, audience. Ask about the pitch first if it is missing; help the author find it by questions (whose story, what they want, what stands in the way), never by writing it for them.`,
  characters: `THE CHARACTERS (module "characters"). You look for the main characters: their name, what they want (desire), what they fear, their wound, their contradiction, their secret, how they change (arc), their relations, their voice. Start with the protagonist. One character, one aspect at a time; a character who wants nothing is the first thing to ask about.`,
  structure: `THE STRUCTURE (modules "structure", "acts", "arcs"). You look for the shape of the story: the narrative model (threeActs, fiveActs, herosJourney, saveTheCat, kishotenketsu), the acts and what happens in each, the main and secondary arcs. Ask how the story begins, where it turns, how it ends; propose a narrative model only when the author's answers point to one.`,
  worldRules: `THE WORLD (module "worldRules"). You look for the rules of the story's world: place and period, what is possible and impossible in it (magic, technology, society, laws), and what each rule costs the characters ("consequences"). Ask what a reader must accept to believe the story.`,
  clues: `CLUES AND REVELATIONS (module "clues"). You look for what the story hides and reveals: the secrets, the clues that prepare a revelation, the red herrings. Ask what the reader should not know too soon, and what will surprise them while seeming inevitable afterwards.`,
};

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const string = { type: 'string' };

/** JSON Schema of one turn of the interview (structured output). */
export const interviewSchema = object({
  reply: string,
  question: nullable(string),
  why: nullable(string),
  proposals: {
    type: 'array',
    items: object({
      module: { enum: MODULES },
      entityId: nullable(string),
      entityName: nullable(string),
      field: { enum: ALL_FIELDS },
      value: string,
      quote: string,
    }),
  },
});

interface Turn {
  reply: string;
  question: string | null;
  why: string | null;
  proposals: {
    module: InterviewModule;
    entityId: string | null;
    entityName: string | null;
    field: string;
    value: string;
    quote: string;
  }[];
}

export function interviewSystemPrompt(input: {
  language: string;
  level: MentorLevel;
  mode: InterviewMode;
  section: InterviewSection | null;
}): string {
  const fields = MODULES.map((m) => `- ${m}: ${INTERVIEW_FIELDS[m].join(', ')}`).join('\n');
  const choices = Object.entries(fieldChoices)
    .flatMap(([m, byField]) =>
      Object.entries(byField).map(([f, values]) => `- ${m}.${f}: ${values.join(' | ')}`),
    )
    .join('\n');
  return `${compagnonSystemPrompt(input)}

THE INTERVIEW
This is not about a scene: you are talking with the author about their book to fill their Atelier, the sheets that describe it (the project, characters, structure, world rules, clues). The author's sheets as they stand come with their last words, with ids and statuses, then your notebook, then the mode of this turn (free, or guided on one section with its specialist).

PROPOSALS
Each proposal is one value for one field of the Atelier, drawn from what the AUTHOR said. Rules:
- "quote" is copied VERBATIM from one of the author's recent messages (3 to 20 words): the words the proposal comes from. Nothing the author did not say: never invent a name, a trait or an event. If they did not say it, ask instead.
- "value" restates the author's idea in a sheet's words: short, factual, in the project's language. No narrative prose, no dialogue, no scene: a sheet, not the book.
- Fields by module:
${fields}
- Choice fields take one of these values:
${choices}
- For a character, an act, an arc, a rule or a clue that already has a sheet, give its "entityId"; for a new one, entityId null and "entityName" its name (the character's name, or the title of the act, arc, rule or clue). Several proposals may describe the same new entity with the same entityName.
- For "meta" and "structure", entityId and entityName are null.
- Never propose for a field shown as validated or rejected; propose only what is new.
- No proposal is fine: an empty list when the author said nothing for the sheets.

OUTPUT
Return JSON with "reply" (what you say to the author), "question" and "why" (guided mode only, null otherwise) and "proposals". There is no example sentence in the interview.

${MEMORY_INSTRUCTIONS}`;
}

/**
 * The mode of one turn, sent with the author's last words (not in the system
 * prompt, which stays the same from call to call: the prompt cache).
 */
export function interviewModeText(input: {
  mode: InterviewMode;
  section: InterviewSection | null;
}): string {
  return input.mode === 'free'
    ? `MODE: FREE. The author talks freely about their book, as to a friend who knows the craft. Answer what they say or ask, briefly, and put what they tell you about the book in the right section of the Atelier (see PROPOSALS). In "reply", say in a few words where you put what ("I noted Hélène in the characters, and the period in the project."). You may end with one question, if it helps.`
    : input.section
      ? `MODE: GUIDED. You lead, one question at a time, on one section of the Atelier. Take what the author just answered into PROPOSALS and acknowledge it briefly in "reply" (where you put what; empty acknowledgement when there was no answer). Then ask ONE next question about this section (what is still missing or only proposed in it) in "question", and say in "why" in one short sentence why it matters for the book. If the author passed on your last question, ask a different one.\n${SECTION_SPECIALISTS[input.section]}`
      : `MODE: GUIDED. Every section of the Atelier has a first answer. Take the author's last answer into PROPOSALS, say so in "reply", and invite them to review the proposals in the Atelier or to go on freely; "question" and "why" are null.`;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const valueText = (state: FieldState | undefined): string | undefined => {
  const value = state?.value ?? state?.proposal?.value;
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const describeField = (field: string, state: FieldState | undefined) => {
  const value = valueText(state);
  const rejected = state?.rejected.map((r) => JSON.stringify(r.value)) ?? [];
  if (!value && rejected.length === 0) return undefined;
  const parts = [value ? `${field} (${state?.status}): ${value}` : `${field}:`];
  if (rejected.length) parts.push(`rejected: ${rejected.join(', ')}`);
  return parts.join(' — ');
};

/** The Atelier as it stands, for the model: values with their status, ids of the sheets. */
export function atelierState(root: Y.Doc): string {
  const lines: string[] = [];
  for (const module of ['meta', 'structure'] as const) {
    const fields = readSingleton(root, module);
    const described = (INTERVIEW_FIELDS[module] as readonly string[])
      .map((f) => describeField(f, fields[f]))
      .filter((line): line is string => line !== undefined);
    lines.push(`[${module}]`, ...(described.length ? described : ['(empty)']));
  }
  for (const module of ['characters', 'acts', 'arcs', 'worldRules', 'clues'] as const) {
    lines.push(`[${module}]`);
    const entities = listEntities(root, module);
    if (entities.length === 0) lines.push('(empty)');
    for (const entity of entities) {
      const fields = (INTERVIEW_FIELDS[module] as readonly string[])
        .map((f) => describeField(f, entity.fields[f]))
        .filter(Boolean);
      lines.push(`- ${entity.id} (${entity.status}): ${fields.join('; ')}`);
    }
  }
  return lines.join('\n');
}

/** Texts the agent says itself, by language. */
const FALLBACK: Record<string, string> = {
  fr: 'Je préfère ne rien écrire pour votre roman : c’est votre voix qui compte. Parlez-moi plutôt de votre histoire, je range ce que vous me dites dans l’Atelier.',
  en: 'I would rather not write anything for your novel: your voice is what matters. Tell me about your story instead, and I will file what you say in the Atelier.',
};

const CORRECTION = `Your previous answer broke THE RULE: it contained text written for the novel (dialogue, narrative passages). Answer again without any of it.`;

function parseTurn(text: string): Turn | undefined {
  try {
    const value = JSON.parse(text) as Partial<Turn>;
    if (typeof value.reply !== 'string') return undefined;
    const text_ = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const question = text_(value.question);
    if (!value.reply.trim() && !question) return undefined;
    return {
      reply: value.reply.trim(),
      question,
      why: question ? text_(value.why) : null,
      proposals: Array.isArray(value.proposals) ? value.proposals : [],
    };
  } catch {
    return undefined;
  }
}

export interface InterviewResult {
  /** False when there was nothing to answer (free mode, the Compagnon spoke last). */
  readonly answered: boolean;
  readonly placed: readonly InterviewPlacement[];
  /** Proposals left out by the guardrails (an invented quote, prose, an unknown field…). */
  readonly dropped: number;
  readonly guarded: boolean;
}

/**
 * One turn of the interview: answers the author's last message (or, in
 * guided mode, asks the next question), files proposals in the Atelier
 * through the AgentWriter and appends the Compagnon's message to the
 * interview thread of the mentor document.
 */
export async function interviewTurn(input: {
  readonly llm: LlmService;
  readonly root: Y.Doc;
  readonly mentorDoc: Y.Doc;
  readonly mode: InterviewMode;
  /** Sections the author asked to leave for later (guided mode). */
  readonly skip?: readonly InterviewSection[];
  /** The section the author chose (« Autre section… »), instead of the emptiest one. */
  readonly section?: InterviewSection;
  /** The author passes on the question in progress: another one, same section. */
  readonly pass?: boolean;
  readonly signal?: AbortSignal;
}): Promise<InterviewResult> {
  const { llm, root, mentorDoc, mode } = input;
  const messages = interviewMessages(mentorDoc);
  const last = messages.at(-1);
  const authorSpoke = last?.role === 'author';
  if (mode === 'free' && !authorSpoke)
    return { answered: false, placed: [], dropped: 0, guarded: false };

  const section = mode === 'guided' ? (input.section ?? nextSection(root, input.skip)) : null;
  const language = readProjectMeta(root)?.language ?? 'fr';
  const level = readMentorLevel(root);
  // One Compagnon (D-35): what was said in the conversation is part of the interview's thread.
  // The message just sent is the thread's last turn, as it is its array's (one rule, see companionThread).
  const thread = companionThread(mentorDoc, authorSpoke ? last.id : undefined);
  const authorMessages = messages.filter((m) => m.role === 'author').slice(-QUOTED_MESSAGES);
  const authorText = authorMessages.map((m) => m.text).join('\n');
  const memory = projectMemory({
    mentorDoc,
    root,
    ...(last?.role === 'author' && { sources: [last.id] }),
    authorText: thread
      .filter((m) => m.role === 'author')
      .map((m) => m.text)
      .join('\n'),
  });
  // The thread's last messages; before them, its summary; the alert when the oldest are about to go.
  const start = windowStart(thread.length, memory, HISTORY);
  const history = thread.slice(start);
  const earlier = await keepThreadSummary({
    llm,
    mentorDoc,
    thread,
    start,
    language,
    ...(input.signal && { signal: input.signal }),
  });
  const alert = leavingAlert(leavingSoon(thread.length, memory, HISTORY), history[0]);

  // From the most stable to the most changing (the prompt cache, phase 6.5):
  // the system prompt; the Atelier and the notebook as they stood when the
  // thread sent began; the thread so far, whose start moves by steps; then,
  // with the author's last words, what changes at every turn: what changed
  // in the Atelier and the notebook since, the mode.
  const said = (m: (typeof history)[number]) =>
    m.mode === 'conversation' ? `(in the conversation about the text) ${m.text}` : m.text;
  const past = authorSpoke ? history.slice(0, -1) : history;
  const pastTurns = past.map((m) => ({
    role: m.role === 'author' ? ('user' as const) : ('assistant' as const),
    content:
      m.role === 'author'
        ? said(m)
        : JSON.stringify({ reply: said(m), question: null, why: null, proposals: [] }),
  }));
  const book = bookContext({ mentorDoc, store: memory, key: 'interview', start });
  const now = [
    ...(book.now ? [book.now] : []),
    ...(alert ? [alert] : []),
    interviewModeText({ mode, section }),
    authorSpoke
      ? said(history.at(-1) ?? ({ mode: 'interview', text: '' } as (typeof history)[number]))
      : input.pass
        ? '[The author passes on this question: ask a different one, same section.]'
        : '[The author opens the guided interview: ask your question.]',
  ].join('\n\n');
  const turns = [
    { role: 'user' as const, content: book.stable, stable: true },
    ...stableThread(pastTurns, earlier),
    { role: 'user' as const, content: now },
  ];
  const system = interviewSystemPrompt({ language, level, mode, section });

  let turn: Turn | undefined;
  // How the last attempt ended: the rule broken (a refusal follows), or no answer to read.
  let failed: 'guarded' | 'truncated' | 'unreadable' | undefined;
  for (let attempt = 0; attempt < 2 && !turn; attempt++) {
    const response = await generateWithMemory(
      llm,
      {
        system,
        // The correction only after an answer that broke the rule.
        messages: failed === 'guarded' ? [...turns, { role: 'user', content: CORRECTION }] : turns,
        responseSchema: interviewSchema,
        maxOutputTokens: 16000,
        tier: 'deep',
      },
      memory,
      input.signal,
    );
    const parsed = response.truncated ? undefined : parseTurn(response.text);
    if (!parsed) failed = response.truncated ? 'truncated' : 'unreadable';
    else if (
      [parsed.reply, parsed.question ?? '', parsed.why ?? ''].every(
        (t) => narrativeProseIn(t, authorText).length === 0,
      )
    )
      turn = parsed;
    else failed = 'guarded';
  }
  // No answer to read is a failure, not a refusal: nothing is said in his name.
  if (!turn && failed !== 'guarded') throw new UnusableAnswerError(failed ?? 'unreadable');
  if (!turn) {
    addInterviewMessage(
      mentorDoc,
      {
        role: 'compagnon',
        text: FALLBACK[language.slice(0, 2)] ?? FALLBACK['fr'] ?? '',
        mode,
        ...(section && { section }),
        ...bornIn(root),
      },
      agentOrigin('interview'),
    );
    return { answered: true, placed: [], dropped: 0, guarded: true };
  }

  const { placed, dropped } = fileProposals(
    root,
    mode === 'guided' && section ? `interview-${section}` : 'interview',
    turn.proposals,
    authorMessages,
  );
  addInterviewMessage(
    mentorDoc,
    {
      role: 'compagnon',
      text: turn.reply,
      mode,
      ...(section && { section }),
      ...(turn.question && { question: turn.question }),
      ...(turn.why && { why: turn.why }),
      ...(placed.length > 0 && { placed }),
      ...(memory.changes().length > 0 && { noted: memory.changes() }),
      ...bornIn(root),
    },
    agentOrigin('interview'),
  );
  return { answered: true, placed, dropped, guarded: false };
}

/**
 * Files the proposals of one turn through the AgentWriter, after the
 * guardrails: a known field, a value of the right kind, the author's words
 * quoted verbatim, no prose, nothing on a rejected sheet. Statuses are kept
 * by the writer itself (a validated or rejected field is never touched).
 */
export function fileProposals(
  root: Y.Doc,
  agent: string,
  proposals: Turn['proposals'],
  authorMessages: readonly InterviewMessage[],
): { placed: InterviewPlacement[]; dropped: number } {
  const writer = createAgentWriter(root, agent);
  const placed: InterviewPlacement[] = [];
  let dropped = 0;
  const authorText = authorMessages.map((m) => m.text).join('\n');
  const evidenceFor = (quote: string): InterviewEvidence[] | undefined => {
    const wanted = normalize(quote);
    if (wanted.split(' ').length < 2) return undefined;
    const message = [...authorMessages].reverse().find((m) => normalize(m.text).includes(wanted));
    return message ? [{ messageId: message.id, quote: quote.trim() }] : undefined;
  };
  // New entities, gathered by module and name (several proposals may describe one).
  const created = new Map<
    string,
    { module: EntityModule; fields: Record<string, string>; evidence: InterviewEvidence[] }
  >();
  const allOf = (module: EntityModule): EntityInfo[] => [
    ...listEntities(root, module),
    ...listTrashedEntities(root, module),
  ];

  for (const p of proposals) {
    const fields = INTERVIEW_FIELDS[p.module] as readonly string[] | undefined;
    const value = typeof p.value === 'string' ? p.value.trim() : '';
    const evidence = evidenceFor(p.quote ?? '');
    const choices = (fieldChoices as Record<string, Record<string, readonly string[]> | undefined>)[
      p.module
    ]?.[p.field];
    if (
      !fields?.includes(p.field) ||
      !value ||
      value.length > MAX_INTERVIEW_VALUE ||
      (choices && !choices.includes(value)) ||
      !evidence ||
      narrativeProseIn(value, authorText, { notes: true }).length > 0
    ) {
      dropped++;
      continue;
    }
    if (p.module === 'meta' || p.module === 'structure') {
      const result = writer.proposeField({ module: p.module, field: p.field }, value, evidence);
      if (result.ok) placed.push({ module: p.module, field: p.field });
      else dropped++;
      continue;
    }
    const module = p.module;
    const entities = allOf(module);
    const named = p.entityName?.trim();
    const existing =
      entities.find((e) => e.id === p.entityId) ??
      (named
        ? entities.find((e) => {
            const state = e.fields[titleField(module)];
            const name = state?.value ?? state?.proposal?.value ?? state?.rejected.at(-1)?.value;
            return typeof name === 'string' && normalize(name) === normalize(named);
          })
        : undefined);
    if (existing) {
      const live = listEntities(root, module).some((e) => e.id === existing.id);
      if (!live || existing.status === 'rejected') {
        dropped++;
        continue;
      }
      const result = writer.proposeField(
        { module, entityId: existing.id, field: p.field },
        value,
        evidence,
      );
      if (result.ok) placed.push({ module, entityId: existing.id, field: p.field });
      else dropped++;
      continue;
    }
    if (!named) {
      dropped++;
      continue;
    }
    const key = `${module}|${normalize(named)}`;
    const entry = created.get(key) ?? {
      module,
      fields: { [titleField(module)]: named },
      evidence: [],
    };
    entry.fields[p.field] = value;
    entry.evidence.push(...evidence);
    created.set(key, entry);
  }
  for (const { module, fields, evidence } of created.values()) {
    const unique = [...new Map(evidence.map((e) => [`${e.messageId}|${e.quote}`, e])).values()];
    const entityId = writer.proposeEntity(module, fields, unique);
    // The sheet, then each of its other fields: each one is decided on its own.
    placed.push({ module, entityId });
    for (const field of Object.keys(fields))
      if (field !== titleField(module)) placed.push({ module, entityId, field });
  }
  return { placed, dropped };
}
