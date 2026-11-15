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
  readonly at: string;
}

/** Background work on the whole manuscript (D-27), as the mentor document records it. */
export type WorkTask = 'structure' | 'clues' | 'character';
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
  /** Its review in the conversation. */
  readonly reviewId?: string;
}

const works = (mentorDoc: Y.Doc) => mentorDoc.getMap<WorkRecord>('works');

export function readWorkRecord(mentorDoc: Y.Doc, work: WorkRef): WorkRecord | undefined {
  return works(mentorDoc).get(workKey(work));
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
      },
    ]);
  }, origin);
  return id;
}
