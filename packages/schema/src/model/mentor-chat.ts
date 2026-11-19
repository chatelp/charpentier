import * as Y from 'yjs';
import { newId, nowIso } from './ids';
import type { Origin } from './origins';

/**
 * The free conversation with the Compagnon (docs/SPEC.md §6.7), in the
 * project's mentor document (`project:<pid>/mentor`): a top-level array of
 * messages, appended by the author and by the agent.
 */
export interface ChatMessage {
  readonly id: string;
  readonly role: 'author' | 'compagnon';
  readonly text: string;
  /** One example sentence the author may insert (D-11). */
  readonly example?: string;
  /** The scene open when the message was written. */
  readonly sceneId?: string;
  /** The review of a background work (D-27): the interface names and dates it. */
  readonly work?: WorkRef;
  /** The author's validated style choice the answer relies on (phase 6.4). */
  readonly styleChoiceId?: string;
  /** What the answer wrote in the notebook (« Noté au carnet », phase 6.5). */
  readonly noted?: readonly NotedChange[];
  /** The working version it was born in, outside Principale (DESIGN 1.20): see bornIn. */
  readonly version?: string;
  readonly at: string;
}

/**
 * Background work (D-27), as the mentor document records it: on the whole
 * manuscript, or the reading of a reference text (`style`, phase 6.4).
 */
export type WorkTask = 'structure' | 'clues' | 'character' | 'style';
export interface WorkRef {
  readonly task: WorkTask;
  readonly characterId?: string;
}

/** Key of a work's record: one per task, one per character. */
export const workKey = (work: WorkRef) =>
  work.task === 'character' ? `character:${work.characterId ?? ''}` : work.task;

/** What a work left the last time it ran (in the mentor document's `works` map). */
export interface WorkRecord {
  readonly at: string;
  /** Digest of the manuscript it read (« unchanged since »). */
  readonly digest: string;
  readonly proposals: number;
  /** Its remarks still open after this run, raised now or before. */
  readonly signalIds: readonly string[];
  /** The fingerprints of every remark it made, to resolve those it no longer makes. */
  readonly fingerprints: readonly string[];
  /** Its review in the conversation (for `style`, its message in the interview). */
  readonly reviewId?: string;
  /** The reference text it read (`style`), by its title. */
  readonly title?: string;
}

const works = (mentorDoc: Y.Doc) => mentorDoc.getMap<WorkRecord>('works');

export function readWorkRecord(mentorDoc: Y.Doc, work: WorkRef): WorkRecord | undefined {
  return works(mentorDoc).get(workKey(work));
}

/** Every work that ran, with what it left, most recent first. */
export function listWorkRecords(mentorDoc: Y.Doc): (readonly [WorkRef, WorkRecord])[] {
  return [...works(mentorDoc).entries()]
    .map(([key, record]): readonly [WorkRef, WorkRecord] => [
      key.startsWith('character:')
        ? { task: 'character', characterId: key.slice('character:'.length) }
        : { task: key === 'clues' || key === 'style' ? key : 'structure' },
      record,
    ])
    .sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
}

export function writeWorkRecord(
  mentorDoc: Y.Doc,
  work: WorkRef,
  record: WorkRecord,
  origin: Origin,
): void {
  mentorDoc.transact(() => works(mentorDoc).set(workKey(work), record), origin);
}

const chat = (mentorDoc: Y.Doc) => mentorDoc.getArray<ChatMessage>('chat');

export function chatMessages(mentorDoc: Y.Doc): ChatMessage[] {
  return chat(mentorDoc).toArray();
}

export function addChatMessage(
  mentorDoc: Y.Doc,
  message: Omit<ChatMessage, 'id' | 'at'>,
  origin: Origin,
): string {
  const id = newId();
  mentorDoc.transact(() => {
    chat(mentorDoc).push([
      {
        id,
        at: nowIso(),
        role: message.role,
        text: message.text,
        ...(message.example !== undefined && { example: message.example }),
        ...(message.sceneId !== undefined && { sceneId: message.sceneId }),
        ...(message.work !== undefined && { work: { ...message.work } }),
        ...(message.styleChoiceId !== undefined && { styleChoiceId: message.styleChoiceId }),
        ...(message.noted?.length && { noted: message.noted.map((n) => ({ ...n })) }),
        ...(message.version !== undefined && { version: message.version }),
      },
    ]);
  }, origin);
  return id;
}

/**
 * The interview with the Compagnon (D-26): its own thread in the mentor
 * document, apart from the conversation about the text. The Compagnon's
 * messages say which section they are about and what they proposed.
 */
/** A note an answer wrote, corrected or removed. */
export interface NotedChange {
  readonly path: string;
  readonly change: 'created' | 'updated' | 'removed';
}

export interface InterviewMessage extends Omit<ChatMessage, 'example' | 'sceneId'> {
  /** Free conversation, or questions section by section. */
  readonly mode?: InterviewMode;
  /** The section the Compagnon's question is about (guided mode). */
  readonly section?: InterviewSection;
  /** Guided mode: the Compagnon's next question, and why he asks it. */
  readonly question?: string;
  readonly why?: string;
  /** What this answer proposed in the Atelier (the field, or the new sheet). */
  readonly placed?: readonly InterviewPlacement[];
  /**
   * A reference text (phase 6.4): on the author's message, the file they
   * gave; on the Compagnon's, the book his style choices come from.
   */
  readonly reference?: InterviewReference;
}

export interface InterviewReference {
  readonly title: string;
  readonly author?: string;
  readonly format?: string;
  readonly words?: number;
}

export type InterviewMode = 'free' | 'guided';

/** The sections of the Atelier, in the order the guided interview goes through them. */
export const interviewSections = [
  'meta',
  'characters',
  'structure',
  'worldRules',
  'clues',
] as const;
export type InterviewSection = (typeof interviewSections)[number];

export interface InterviewPlacement {
  readonly module: string;
  readonly entityId?: string;
  readonly field?: string;
}

const interview = (mentorDoc: Y.Doc) => mentorDoc.getArray<InterviewMessage>('interview');

export function interviewMessages(mentorDoc: Y.Doc): InterviewMessage[] {
  return interview(mentorDoc).toArray();
}

export function addInterviewMessage(
  mentorDoc: Y.Doc,
  message: Omit<InterviewMessage, 'id' | 'at'>,
  origin: Origin,
): string {
  const id = newId();
  mentorDoc.transact(() => {
    interview(mentorDoc).push([
      {
        id,
        at: nowIso(),
        role: message.role,
        text: message.text,
        ...(message.mode !== undefined && { mode: message.mode }),
        ...(message.section !== undefined && { section: message.section }),
        ...(message.question !== undefined && { question: message.question }),
        ...(message.why !== undefined && { why: message.why }),
        ...(message.placed !== undefined && { placed: message.placed }),
        ...(message.reference !== undefined && { reference: { ...message.reference } }),
        ...(message.noted?.length && { noted: message.noted.map((n) => ({ ...n })) }),
        ...(message.version !== undefined && { version: message.version }),
      },
    ]);
  }, origin);
  return id;
}

/**
 * One Compagnon, several modes (D-35): the conversation about the text and
 * the interview, read as a single thread in the order they were said. Each
 * keeps its own array in the mentor document, as it always did: nothing
 * moves, nothing is copied, and a device of an older version still finds its
 * own; this is a reading of the two.
 *
 * `answering` (companionThread): the author's message being answered, the
 * last of its own array, where it was just appended. It comes last whatever
 * the clocks say: a message another device dated in the future, or one of
 * the same millisecond, must not pass after the question just asked, which
 * would then no longer be the one answered.
 */
export type ThreadMode = 'conversation' | 'interview';

export interface ThreadMessage {
  readonly id: string;
  readonly at: string;
  readonly mode: ThreadMode;
  readonly role: 'author' | 'compagnon';
  readonly text: string;
  /** What the message is about, for the Compagnon: a work's bilan, a reference text, a question. */
  readonly note?: string;
}

export function companionThread(mentorDoc: Y.Doc, answering?: string): ThreadMessage[] {
  const conversation = chatMessages(mentorDoc).map((m): ThreadMessage => ({
    id: m.id,
    at: m.at,
    mode: 'conversation',
    role: m.role,
    text: m.text,
    ...(m.work && { note: `bilan: ${m.work.task}` }),
  }));
  const interview = interviewMessages(mentorDoc).map((m): ThreadMessage => ({
    id: m.id,
    at: m.at,
    mode: 'interview',
    role: m.role,
    text: [m.text, m.question].filter(Boolean).join('\n'),
    ...(m.reference && { note: `reference text: ${m.reference.title}` }),
  }));
  const thread = [...conversation, ...interview].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1,
  );
  const asked = thread.find((m) => m.id === answering);
  return asked ? [...thread.filter((m) => m !== asked), asked] : thread;
}
