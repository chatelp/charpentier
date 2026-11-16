import type { LlmRequest, LlmResponse, LlmService, LlmToolCall } from '@charpentier/platform';
import {
  agentOrigin,
  agentRenameNote,
  agentTrashNote,
  agentWriteNote,
  findNote,
  listNotes,
  NoteRefused,
  type Note,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { narrativeProseIn } from './guard';

/**
 * The Compagnon's memory (docs/PLAN.md phase 6.5, D-35): the notebook of the
 * project, run as the memory tool's commands (view, create, str_replace,
 * insert, delete, rename) under `/memories`. The model calls them; this
 * runs them on the notebook, under guards: a note speaks of the author or
 * the book, never a line of the novel; it stays short; it holds no secret;
 * a note the author touched is read only.
 */

export const MEMORY_ROOT = '/memories';
/** The project's notes; the author's (across projects) come with their own document later. */
export const PROJECT_DIR = `${MEMORY_ROOT}/projet`;
export const AUTHOR_DIR = `${MEMORY_ROOT}/auteur`;
/** A note is a few lines, not a chapter. */
export const MAX_NOTE = 2000;
const MAX_NOTES = 300;
/** Rounds of tool calls in one answer, at most. */
const MAX_ROUNDS = 6;
const MEMORY_AGENT = 'memory';

const SECRET = /sk-ant-|sk-[a-z0-9]{20}|api[_ -]?key\s*[:=]|mot de passe\s*[:=]|password\s*[:=]/i;

const normalizePath = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const path = raw.trim().replace(/\/+/g, '/').replace(/\/$/, '');
  if (path !== MEMORY_ROOT && !path.startsWith(`${MEMORY_ROOT}/`)) return null;
  // No climbing out of the notebook.
  if (path.split('/').some((part) => part === '..' || part === '.')) return null;
  return path;
};

const numbered = (text: string) =>
  text
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(6)}\t${line}`)
    .join('\n');

export interface MemoryStore {
  /** The index the Compagnon reads at every call: each note's path and first line. */
  index(): string;
  isEmpty(): boolean;
  /** Runs one command of the memory tool; the text goes back to the model. */
  run(input: Readonly<Record<string, unknown>>): {
    readonly text: string;
    readonly isError: boolean;
  };
}

/**
 * The project's notebook as the memory tool sees it. `sources`: the messages
 * of the thread the notes written now come from (the author's last words).
 */
export function projectMemory(input: {
  readonly mentorDoc: Y.Doc;
  readonly sources?: readonly string[];
  /** The author's own words, which a note may quote. */
  readonly authorText?: string;
}): MemoryStore {
  const { mentorDoc } = input;
  const origin = agentOrigin(MEMORY_AGENT);
  const notes = () => listNotes(mentorDoc);
  const ok = (text: string) => ({ text, isError: false });
  const fail = (text: string) => ({ text: `Error: ${text}`, isError: true });

  const checkText = (text: unknown): string | null => {
    if (typeof text !== 'string') return 'the text is missing';
    if (text.length > MAX_NOTE) return `a note is at most ${MAX_NOTE} characters: split it`;
    if (SECRET.test(text)) return 'no secret (key, password) in the notebook';
    if (narrativeProseIn(text, input.authorText ?? '').length > 0)
      return 'a note describes; it never holds lines of the novel or dialogue';
    return null;
  };

  const write = (path: string, text: string) =>
    agentWriteNote(
      mentorDoc,
      { path, text, ...(input.sources?.length && { sources: input.sources }) },
      origin,
    );

  const view = (path: string) => {
    const note = findNote(mentorDoc, path);
    if (note)
      return ok(
        `${note.by === 'author' ? "(the author's note: read only)\n" : ''}${numbered(note.text)}`,
      );
    const below = notes().filter((n) => n.path.startsWith(`${path}/`));
    if (path === MEMORY_ROOT || below.length > 0)
      return ok(
        [
          `Files in ${path}:`,
          ...below.map((n) => `${n.text.length}\t${n.path}${n.by === 'author' ? ' (author)' : ''}`),
          ...(below.length === 0 ? ['(empty)'] : []),
        ].join('\n'),
      );
    return fail(`${path} does not exist`);
  };

  return {
    isEmpty: () => notes().length === 0,
    index() {
      const all = notes();
      if (all.length === 0) return '(the notebook is empty)';
      const firstLine = (n: Note) => n.text.split('\n').find((l) => l.trim()) ?? '';
      return all
        .map(
          (n) =>
            `${n.path}${n.by === 'author' ? ' (author, read only)' : ''}: ${firstLine(n).slice(0, 160)}`,
        )
        .join('\n');
    },

    run(command) {
      const path = normalizePath(command['path']);
      try {
        switch (command['command']) {
          case 'view':
            return path ? view(path) : fail('the path must be under /memories');
          case 'create': {
            if (!path || path === MEMORY_ROOT)
              return fail('the path must be a file under /memories');
            const problem = checkText(command['file_text']);
            if (problem) return fail(problem);
            if (!findNote(mentorDoc, path) && notes().length >= MAX_NOTES)
              return fail('the notebook is full: merge or remove notes first');
            write(path, String(command['file_text']));
            return ok(`File created successfully at: ${path}`);
          }
          case 'str_replace': {
            const note = path ? findNote(mentorDoc, path) : undefined;
            if (!path || !note) return fail(`${String(command['path'])} does not exist`);
            const oldStr = String(command['old_str'] ?? '');
            const count = oldStr ? note.text.split(oldStr).length - 1 : 0;
            if (count !== 1)
              return fail(count === 0 ? 'old_str was not found' : 'old_str appears more than once');
            const text = note.text.replace(oldStr, String(command['new_str'] ?? ''));
            const problem = checkText(text);
            if (problem) return fail(problem);
            write(path, text);
            return ok('The memory file has been edited.');
          }
          case 'insert': {
            const note = path ? findNote(mentorDoc, path) : undefined;
            if (!path || !note) return fail(`${String(command['path'])} does not exist`);
            const lines = note.text.split('\n');
            const at = Math.max(0, Math.min(lines.length, Number(command['insert_line'] ?? 0)));
            lines.splice(at, 0, String(command['insert_text'] ?? ''));
            const text = lines.join('\n');
            const problem = checkText(text);
            if (problem) return fail(problem);
            write(path, text);
            return ok(`The file ${path} has been edited.`);
          }
          case 'delete':
            if (!path) return fail('the path must be under /memories');
            agentTrashNote(mentorDoc, path, origin);
            return ok(`File deleted: ${path}`);
          case 'rename': {
            const from = normalizePath(command['old_path']);
            const to = normalizePath(command['new_path']);
            if (!from || !to) return fail('both paths must be under /memories');
            agentRenameNote(mentorDoc, from, to, origin);
            return ok(`File renamed from ${from} to ${to}`);
          }
          default:
            return fail(`unknown command ${String(command['command'])}`);
        }
      } catch (error) {
        if (error instanceof NoteRefused) return fail(error.message);
        throw error;
      }
    },
  };
}

/** The whole thread, at most, that a first reading takes in. */
const FIRST_READING = 400;

/**
 * The part of the thread sent with a call: the last `window` messages; the
 * whole of it (up to FIRST_READING) while the notebook is still empty, so
 * that the Compagnon's first call after the update reads everything said
 * before and notes what matters (the transition of D-35: nothing lost).
 */
export function threadWindow<T>(thread: readonly T[], store: MemoryStore, window: number): T[] {
  return store.isEmpty() ? thread.slice(-FIRST_READING) : thread.slice(-window);
}

/** How the Compagnon is told about his notebook, in every mode. */
export function memoryInstructions(store: MemoryStore): string {
  return `YOUR NOTEBOOK (memory tool, under ${MEMORY_ROOT}): you keep notes across sessions, one note per fact, in ${PROJECT_DIR}/ for this book and ${AUTHOR_DIR}/ for the author as a writer (how they work, what helps them, what they do not want). Note what you will need later and that the Atelier's sheets do not hold: the author's story and intentions, their decisions and why, their doubts, the questions to come back to, how they want to be accompanied. Keep notes short, dated by their content, and up to date: correct or remove a note that is no longer true rather than adding a contradicting one. Never write lines of the novel, dialogue or secrets in it. Notes marked "author" are the author's: read them, never change them. View a note before relying on its details.
INDEX OF THE NOTEBOOK:
${store.index()}${
    store.isEmpty()
      ? `\nYOUR NOTEBOOK IS EMPTY: you receive the whole of what was said so far. Before answering, read it and write the notes that matter (a few well-chosen notes, not a transcript).`
      : ''
  }`;
}

/**
 * One answer of the model with its notebook: runs the memory tool's calls
 * and asks again, until it answers (a few rounds at most).
 */
export async function generateWithMemory(
  llm: LlmService,
  request: LlmRequest,
  store: MemoryStore,
  signal?: AbortSignal,
): Promise<LlmResponse> {
  let messages = [...request.messages];
  let response: LlmResponse | undefined;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // The last round has no tool: it must answer.
    const tools = round < MAX_ROUNDS - 1 ? [{ kind: 'memory' as const }] : [];
    response = await llm.generate({ ...request, messages, ...(tools.length && { tools }) }, signal);
    const calls: readonly LlmToolCall[] = response.toolCalls ?? [];
    if (calls.length === 0) return response;
    messages = [
      ...messages,
      { role: 'assistant', content: [{ type: 'provider_turn', turn: response.turn }] },
      {
        role: 'user',
        content: calls.map((call) => {
          const result = store.run(call.input);
          return {
            type: 'tool_result' as const,
            callId: call.id,
            content: result.text,
            ...(result.isError && { isError: true }),
          };
        }),
      },
    ];
  }
  return response ?? { text: '' };
}
