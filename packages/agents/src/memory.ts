import type { LlmRequest, LlmResponse, LlmService, LlmToolCall } from '@charpentier/platform';
import {
  agentOrigin,
  agentRenameNote,
  agentTrashNote,
  agentWriteNote,
  findNote,
  listNotes,
  NoteRefused,
  noteNatures,
  notebookStarted,
  type Note,
  type NotedChange,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { ATELIER_DIR, atelierFiles } from './atelier-files';
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

const noteEntry = (n: Note) =>
  `## ${n.path}${n.by === 'author' ? ' (author, read only)' : ''}\n${n.text}`;
const atelierEntry = ([path, text]: readonly [string, string]) => `## ${path}\n${text}`;

export interface MemoryStore {
  /** The index the Compagnon reads at every call: each note's path and first line. */
  index(): string;
  /** Every note, whole, with its path. */
  whole(): string;
  /** The Atelier's files, whole, and their index (empty without the Atelier). */
  atelierWhole(): string;
  atelierIndex(): string;
  /** Each file of the tree as the whole texts above give it (Atelier and notes), by path. */
  entries(): ReadonlyMap<string, string>;
  /** What this call wrote, corrected or removed (« Noté au carnet »). */
  changes(): readonly NotedChange[];
  /**
   * The notebook was never written in (the first reading takes the whole
   * thread). False once a note existed, even if all are in the trash since.
   */
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
  /** The Atelier, read only under /memories/atelier (a source like the notebook). */
  readonly root?: Y.Doc;
  readonly sources?: readonly string[];
  /** The author's own words, which a note may quote. */
  readonly authorText?: string;
}): MemoryStore {
  const { mentorDoc, root } = input;
  const changes = new Map<string, NotedChange['change']>();
  const changed = (path: string, change: NotedChange['change']) =>
    changes.set(path, changes.get(path) === 'created' && change === 'updated' ? 'created' : change);
  const atelier = () => (root ? atelierFiles(root) : new Map<string, string>());
  const inAtelier = (path: string) => path === ATELIER_DIR || path.startsWith(`${ATELIER_DIR}/`);
  /** Where a note may be written or moved to: a file of one of the two notebooks, nowhere else. */
  const inNotebook = (path: string) =>
    [PROJECT_DIR, AUTHOR_DIR].some((dir) => path.startsWith(`${dir}/`));
  const elsewhere = `a note is a file under ${PROJECT_DIR}/ or ${AUTHOR_DIR}/`;
  const origin = agentOrigin(MEMORY_AGENT);
  const notes = () => listNotes(mentorDoc);
  const ok = (text: string) => ({ text, isError: false });
  const fail = (text: string) => ({ text: `Error: ${text}`, isError: true });

  const checkText = (text: unknown): string | null => {
    if (typeof text !== 'string') return 'the text is missing';
    if (text.length > MAX_NOTE) return `a note is at most ${MAX_NOTE} characters: split it`;
    if (SECRET.test(text)) return 'no secret (key, password) in the notebook';
    if (narrativeProseIn(text, input.authorText ?? '', { notes: true }).length > 0)
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
    if (inAtelier(path)) {
      const files = atelier();
      const file = files.get(path);
      if (file !== undefined) return ok(`(the author's Atelier: read only)\n${numbered(file)}`);
      const below = [...files.keys()].filter((p) => p.startsWith(`${path}/`));
      return below.length
        ? ok([`Files in ${path} (read only):`, ...below].join('\n'))
        : fail(`${path} does not exist`);
    }
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
          ...(path === MEMORY_ROOT && root
            ? [`${ATELIER_DIR}/ (the author's Atelier, read only)`]
            : []),
          ...below.map((n) => `${n.text.length}\t${n.path}${n.by === 'author' ? ' (author)' : ''}`),
          ...(below.length === 0 ? ['(empty)'] : []),
        ].join('\n'),
      );
    return fail(`${path} does not exist`);
  };

  return {
    isEmpty: () => !notebookStarted(mentorDoc),
    whole: () => notes().map(noteEntry).join('\n\n'),
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

    changes: () => [...changes].map(([path, change]) => ({ path, change })),
    atelierWhole: () => [...atelier()].map(atelierEntry).join('\n\n'),
    entries: () =>
      new Map([
        ...[...atelier()].map((file) => [file[0], atelierEntry(file)] as const),
        ...notes().map((n) => [n.path, noteEntry(n)] as const),
      ]),
    atelierIndex: () =>
      [...atelier()]
        .map(([path, text]) => `${path}: ${text.split('\n').slice(1).join(' · ').slice(0, 140)}`)
        .join('\n'),

    run(command) {
      const path = normalizePath(command['path']);
      // The Atelier is read here, changed only through proposals the author validates.
      // Every path a command names: a rename's `new_path` too, or a note
      // moved there would stand in the tree as one of the author's sheets.
      const named = [path, normalizePath(command['old_path']), normalizePath(command['new_path'])];
      if (command['command'] !== 'view' && named.some((p) => p !== null && inAtelier(p)))
        return fail(
          "the Atelier is the author's, read only: propose a change instead (in the interview, PROPOSALS)",
        );
      try {
        switch (command['command']) {
          case 'view':
            return path ? view(path) : fail('the path must be under /memories');
          case 'create': {
            if (!path || !inNotebook(path)) return fail(elsewhere);
            const problem = checkText(command['file_text']);
            if (problem) return fail(problem);
            const exists = !!findNote(mentorDoc, path);
            if (!exists && notes().length >= MAX_NOTES)
              return fail('the notebook is full: merge or remove notes first');
            write(path, String(command['file_text']));
            changed(path, exists ? 'updated' : 'created');
            return ok(`File created successfully at: ${path}`);
          }
          case 'str_replace': {
            const note = path ? findNote(mentorDoc, path) : undefined;
            if (!path || !note) return fail(`${String(command['path'])} does not exist`);
            const oldStr = String(command['old_str'] ?? '');
            const count = oldStr ? note.text.split(oldStr).length - 1 : 0;
            if (count !== 1)
              return fail(count === 0 ? 'old_str was not found' : 'old_str appears more than once');
            // A function: `$&`, `$'` and the like in new_str are text, not patterns.
            const newStr = String(command['new_str'] ?? '');
            const text = note.text.replace(oldStr, () => newStr);
            const problem = checkText(text);
            if (problem) return fail(problem);
            write(path, text);
            changed(path, 'updated');
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
            changed(path, 'updated');
            return ok(`The file ${path} has been edited.`);
          }
          case 'delete':
            if (!path) return fail('the path must be under /memories');
            agentTrashNote(mentorDoc, path, origin);
            changed(path, 'removed');
            return ok(`File deleted: ${path}`);
          case 'rename': {
            const from = normalizePath(command['old_path']);
            const to = normalizePath(command['new_path']);
            if (!from || !to) return fail('both paths must be under /memories');
            if (!inNotebook(to)) return fail(elsewhere);
            agentRenameNote(mentorDoc, from, to, origin);
            changes.delete(from);
            changed(to, 'updated');
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
/** The window moves by steps this long, so that its start stays put between them (prompt cache). */
const WINDOW_STEP = 20;

/**
 * The part of the thread sent with a call: about the last `window` messages,
 * starting at a multiple of WINDOW_STEP so that the start stays the same for
 * many calls (a sliding start would change the whole prompt every time); the
 * whole of it (up to FIRST_READING) while the notebook is still empty, so
 * that the first call after the update reads everything said before and
 * notes what matters (the transition of D-35: nothing lost).
 */
export function threadWindow<T>(thread: readonly T[], store: MemoryStore, window: number): T[] {
  return thread.slice(windowStart(thread.length, store, window));
}

/** Where the part of the thread sent with a call starts (see threadWindow). */
export function windowStart(length: number, store: MemoryStore, window: number): number {
  if (store.isEmpty()) return Math.max(0, length - FIRST_READING);
  return Math.max(0, Math.floor((length - window) / WINDOW_STEP) * WINDOW_STEP);
}

/** Messages to come before the oldest block sent leaves the window: the alert's horizon. */
const ALERT_AHEAD = 4;

/**
 * How many of the oldest messages sent will soon no longer be (the next
 * step of the window), 0 when none: the Compagnon is told, so that he notes
 * what matters in them before they go (D-35; the summary keeps the rest).
 */
export function leavingSoon(length: number, store: MemoryStore, window: number): number {
  if (store.isEmpty()) return 0;
  const start = windowStart(length, store, window);
  const next = windowStart(length + ALERT_AHEAD, store, window);
  return Math.min(next - start, length - start);
}

/** The alert sent with the author's last words, when the oldest messages sent are about to go. */
export function leavingAlert(count: number, first?: { readonly text: string }): string {
  if (count <= 0) return '';
  const opening = first ? ` (from "${first.text.slice(0, 60).replace(/\s+/g, ' ')}…")` : '';
  return `THE FIRST ${count} MESSAGES OF THE THREAD ABOVE${opening} will soon no longer be sent to you; only a summary will remain. Before answering, make sure what matters in them for later is in your notebook (do not note again what is already there).`;
}

/**
 * The thread's past turns, ready to be sent: after the summary of what came
 * before (when the thread is long), the last of them marked stable (the
 * prompt cache's point: everything up to there is the same next time).
 */
export function stableThread(
  pastTurns: readonly { readonly role: 'user' | 'assistant'; readonly content: string }[],
  earlier?: string,
): { role: 'user' | 'assistant'; content: string; stable?: boolean }[] {
  const summary = earlier
    ? `What was said before the messages below, summarized (older than them; the Atelier and your notebook come first):\n<earlier-thread>\n${earlier}\n</earlier-thread>`
    : '';
  const opening = [summary, 'The thread with the author so far:'].filter(Boolean).join('\n\n');
  const first = pastTurns[0];
  const before =
    first?.role === 'user'
      ? [
          { ...first, content: summary ? `${summary}\n\n${first.content}` : first.content },
          ...pastTurns.slice(1),
        ]
      : [{ role: 'user' as const, content: opening }, ...pastTurns];
  return before.map((m, index) => (index === before.length - 1 ? { ...m, stable: true } : m));
}

/** A notebook this short is read whole by the works that cannot open notes (analyses, reviews). */
const READ_NOTEBOOK = 16000;

/**
 * The notebook for the works that read it without the tool (a scene's
 * analysis, a chapter's review, the deep works): what the author decided,
 * intends, doubts, so that a remark does not go against a deliberate choice.
 * Read only: only the Compagnon in the conversation and the interview writes it.
 * Empty when there is no note.
 */
export function notebookForReading(mentorDoc: Y.Doc): string {
  const notes = listNotes(mentorDoc);
  if (notes.length === 0) return '';
  // The author's notes and their decisions first, when everything does not fit.
  const rank = (n: Note) =>
    (n.by === 'author' ? 0 : 10) + noteNatures.findIndex((x) => n.path.includes(`/${x}/`));
  let text = '';
  for (const n of [...notes].sort((a, b) => rank(a) - rank(b))) {
    const entry = `## ${n.path}${n.by === 'author' ? ' (written by the author)' : ''}\n${n.text}\n\n`;
    if (text.length + entry.length > READ_NOTEBOOK) break;
    text += entry;
  }
  return `The notebook the Compagnon keeps with the author (their decisions, intentions, doubts; read only). What the author validated in the sheets comes first, then their own notes, then the Compagnon's. Do not remark against a choice the notebook shows the author made on purpose; you may remind them of it when it matters.\n<notebook>\n${text.trim()}\n</notebook>`;
}

/** A notebook this short goes whole with every call (cheaper than reading notes one by one). */
const WHOLE_NOTEBOOK = 8000;

/** How the Compagnon is told about his notebook, in every mode: the same at every call. */
export const MEMORY_INSTRUCTIONS = `WHAT YOU KNOW lies in one tree under ${MEMORY_ROOT}, read with the memory tool: ${ATELIER_DIR}/ is the author's Atelier (their sheets, each field with its status; read only: you change it only through proposals they validate); ${PROJECT_DIR}/ and ${AUTHOR_DIR}/ are your notebook.
YOUR NOTEBOOK: each note is a file in a folder of its nature: ${PROJECT_DIR}/<nature>/<name>.md for this book, ${AUTHOR_DIR}/<nature>/<name>.md for the author; natures: ${noteNatures.join(', ')} ("a-reprendre": what to come back to with the author; "histoire": what the author tells of themselves and where the book comes from; "accompagnement" and "facon-d-ecrire" usually about the author). Its first line is a short title, "# La fin reste ouverte". You keep notes across sessions, one note per fact, in ${PROJECT_DIR}/ for this book and ${AUTHOR_DIR}/ for the author as a writer (how they work, what helps them, what they do not want). Note what you will need later and that the Atelier's sheets do not hold: the author's story and intentions, their decisions and why, their doubts, the questions to come back to, how they want to be accompanied. Keep notes short, dated by their content, and up to date: correct or remove a note that is no longer true rather than adding a contradicting one. Never write lines of the novel, dialogue or secrets in it. Notes marked "author" are the author's: read them, never change them. The Atelier and your notebook come before the thread, as they stood when the thread sent began; what changed in them since comes with the author's last words and wins over it. When only an index comes, view a file before relying on its details.
THE EARLIER THREAD: when the thread is long, only its last messages are sent to you; what came before comes as a summary (<earlier-thread>), less precise than your notebook. When told that the oldest messages sent will soon go, note what matters in them before answering.
PRECEDENCE, when what you know disagrees over time:
1. What the author validated in the Atelier is their decision: it comes first, before your notebook and before old messages.
2. A note the author wrote or corrected comes before your own notes.
3. Between two things the author said, the more recent wins, unless a validated decision says otherwise.
4. When they contradict each other, do not settle it alone and never touch a validated field: point it out to the author with both sides ("you validated X, but you said yesterday Y: shall we change it?"), and update your own note so that it records how things evolved (what was said, when, and what was decided).`;

/** An Atelier this short goes whole with every call; beyond, its index (and the tool). */
const WHOLE_ATELIER = 16000;

/**
 * The Atelier as it stands, sent with the author's last words: a source like
 * the notebook, whole while short, else its index (each sheet read as needed).
 */
export function atelierContext(store: MemoryStore): string {
  const whole = store.atelierWhole();
  return whole.length <= WHOLE_ATELIER
    ? `The author's Atelier as it stands (their decisions and what waits for them), ${ATELIER_DIR}:\n<atelier>\n${whole}\n</atelier>`
    : `The author's Atelier, its index (view a sheet under ${ATELIER_DIR} for its fields):\n<atelier-index>\n${store.atelierIndex()}\n</atelier-index>`;
}

/** The notebook as it stands: whole while short, else its index. */
export function notebookBody(store: MemoryStore): string {
  const whole = store.whole();
  return whole.length <= WHOLE_NOTEBOOK
    ? `<notebook>\n${whole || '(empty)'}\n</notebook>`
    : `<notebook-index>\n${store.index()}\n</notebook-index>`;
}

/** Sent with the author's last words while the notebook is empty: the first reading. */
export const EMPTY_NOTEBOOK = `YOUR NOTEBOOK IS EMPTY: you received the whole of what was said so far. Before answering, read it and write the notes that matter (a few well-chosen notes, not a transcript).`;

/** The notebook as it stands, sent with the author's last words: whole while short, else its index. */
export function memoryContext(store: MemoryStore): string {
  const body = notebookBody(store);
  return store.isEmpty() ? `${body}\n${EMPTY_NOTEBOOK}` : body;
}

/** @deprecated kept for callers that build one system text: instructions and notebook together. */
export const memoryInstructions = (store: MemoryStore) =>
  `${MEMORY_INSTRUCTIONS}\n${memoryContext(store)}`;

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
    // The last round must answer. The tool stays declared (the history holds
    // its calls and results: without it the provider refuses the request),
    // but it may not be called.
    const last = round === MAX_ROUNDS - 1;
    response = await llm.generate(
      {
        ...request,
        messages,
        tools: [{ kind: 'memory' as const }],
        ...(last && { toolChoice: 'none' as const }),
      },
      signal,
    );
    const calls: readonly LlmToolCall[] = response.toolCalls ?? [];
    // A call on the last round all the same is not run: no answer came.
    if (calls.length === 0 || last) return response;
    messages = [
      // One cache point in the loop: the latest results (earlier ones are dropped).
      ...messages.map((m, i) =>
        i >= request.messages.length && m.stable ? { ...m, stable: false } : m,
      ),
      { role: 'assistant', content: [{ type: 'provider_turn', turn: response.turn }] },
      {
        role: 'user',
        stable: true,
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
