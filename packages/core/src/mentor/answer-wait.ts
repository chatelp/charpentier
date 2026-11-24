import type { AgentsService, AnswerPhase, AnswerResult } from '@charpentier/platform';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Waiting for the Compagnon's answer (docs/DESIGN.md §4.5, « Pendant qu'il
 * réfléchit », 1.34), shared by the views that show it: the interview's page,
 * the panel's conversation, the console's key. Kept with the Compagnon's
 * service, not in a view, so that a panel closed and opened again still shows
 * the wait, and the shortcut stops it from anywhere.
 */

/** Which thread waits: the conversation about the text, or the interview. */
export type AnswerKind = 'chat' | 'interview';

export interface AnswerWait {
  /** When the author sent (the clock's time, ms). */
  readonly since: number;
  /** As the engine told it; « Il réfléchit… » until it says more (or forever, if it cannot). */
  readonly phase: AnswerPhase;
  readonly phaseSince: number;
  /** The phase before `reviewing`: shown while the guardrails take under half a second. */
  readonly before: AnswerPhase;
  /**
   * The thread's last message when asked. The answer lands in the document a
   * moment before the request ends: a newer message of the Compagnon's takes
   * the block's place at once, never beside it.
   */
  readonly after: string | undefined;
}

export interface AnswerState {
  readonly wait: AnswerWait | null;
  /** How the last request ended when it brought no answer; `stopped` offers « Envoyer à nouveau ». */
  readonly ended: Exclude<AnswerResult, 'answered'> | null;
}

/** The time the wait is measured in; a test moves it forward. */
export const waitClock = { now: (): number => Date.now() };

const IDLE: AnswerState = { wait: null, ended: null };
const KINDS: readonly AnswerKind[] = ['chat', 'interview'];
const keyOf = (projectId: string, kind: AnswerKind) => `${projectId}|${kind}`;

/** A request in progress; one the author stopped is no longer in the list. */
interface Request {
  wait: AnswerWait;
}

class Answers {
  readonly #states = new Map<string, AnswerState>();
  readonly #requests = new Map<string, Request[]>();
  /** The last request of each thread, to send it again as it was (its section, its scene). */
  readonly #lastSent = new Map<string, () => void>();
  readonly #listeners = new Set<() => void>();

  constructor(private readonly agents: AgentsService) {
    // For the service's life: the answers go on whatever view is open.
    agents.onAnswerPhase?.(({ projectId, phase }) => {
      if (phase) this.#tellPhase(projectId, phase);
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  state(projectId: string, kind: AnswerKind): AnswerState {
    return this.#states.get(keyOf(projectId, kind)) ?? IDLE;
  }

  /** Whether he prepares an answer, in either thread: for this project, or for any. */
  waiting(projectId?: string): boolean {
    return projectId === undefined
      ? [...this.#states.values()].some((s) => s.wait !== null)
      : KINDS.some((kind) => this.state(projectId, kind).wait !== null);
  }

  #set(key: string, state: AnswerState) {
    this.#states.set(key, state);
    for (const listener of this.#listeners) listener();
  }

  /** The engine's word on a project's answer: every thread of it that waits takes it. */
  #tellPhase(projectId: string, phase: AnswerPhase) {
    const now = waitClock.now();
    for (const kind of KINDS) {
      const key = keyOf(projectId, kind);
      const request = this.#requests.get(key)?.at(-1);
      if (!request || request.wait.phase === phase) continue;
      const before = phase === 'reviewing' ? request.wait.phase : phase;
      request.wait = { ...request.wait, phase, phaseSince: now, before };
      this.#set(key, { wait: request.wait, ended: null });
    }
  }

  async request(
    projectId: string,
    kind: AnswerKind,
    run: () => Promise<AnswerResult>,
    after?: string,
  ): Promise<AnswerResult> {
    const key = keyOf(projectId, kind);
    this.#lastSent.set(key, () => void this.request(projectId, kind, run, after));
    const now = waitClock.now();
    const request: Request = {
      wait: { since: now, phase: 'thinking', phaseSince: now, before: 'thinking', after },
    };
    const active = this.#requests.get(key) ?? [];
    this.#requests.set(key, active);
    active.push(request);
    this.#set(key, { wait: request.wait, ended: null });
    let result: AnswerResult;
    try {
      result = await run();
    } catch (error) {
      console.error('Charpentier: the Compagnon could not be asked', error);
      result = 'failed';
    }
    const index = active.indexOf(request);
    // Stopped by the author: nothing more to say, unless the answer was already there.
    if (index === -1) {
      if (result === 'answered' && active.length === 0) this.#set(key, IDLE);
      return result;
    }
    active.splice(index, 1);
    const next = active.at(-1);
    this.#set(key, {
      wait: next?.wait ?? null,
      ended: next || result === 'answered' ? null : result,
    });
    return result;
  }

  stop(projectId: string): void {
    if (!this.agents.stopAnswer) return;
    for (const kind of KINDS) {
      const key = keyOf(projectId, kind);
      const active = this.#requests.get(key);
      if (!active?.length) continue;
      active.splice(0);
      this.#set(key, { wait: null, ended: 'stopped' });
    }
    void this.agents.stopAnswer({ projectId });
  }

  sendAgain(projectId: string, kind: AnswerKind): void {
    this.#lastSent.get(keyOf(projectId, kind))?.();
  }

  forgetProblem(projectId: string, kind: AnswerKind): void {
    const { wait, ended } = this.state(projectId, kind);
    if (!wait && ended && ended !== 'stopped') this.#set(keyOf(projectId, kind), IDLE);
  }
}

const answers = new WeakMap<AgentsService, Answers>();

function answersOf(agents: AgentsService): Answers {
  const known = answers.get(agents);
  if (known) return known;
  const created = new Answers(agents);
  answers.set(agents, created);
  return created;
}

/**
 * Asks for an answer and waits for it: the block shows from now until the
 * request ends, whatever view asked and whichever is open. `after`: the
 * thread's last message, see `AnswerWait`.
 */
export const requestAnswer = (
  agents: AgentsService,
  projectId: string,
  kind: AnswerKind,
  run: () => Promise<AnswerResult>,
  after?: string,
): Promise<AnswerResult> => answersOf(agents).request(projectId, kind, run, after);

/**
 * « Arrêter » (1.34): the block goes at once, the author's message stays with
 * « Envoyer à nouveau »; the host stops the answer and it writes nothing.
 */
export const stopAnswer = (agents: AgentsService, projectId: string): void =>
  answersOf(agents).stop(projectId);

/** « Envoyer à nouveau »: the stopped request, exactly as it was. */
export const sendAgain = (agents: AgentsService, projectId: string, kind: AnswerKind): void =>
  answersOf(agents).sendAgain(projectId, kind);

/** The view is left: the problem it said is not said again when it comes back. */
export const forgetProblem = (agents: AgentsService, projectId: string, kind: AnswerKind): void =>
  answersOf(agents).forgetProblem(projectId, kind);

/** The Compagnon prepares an answer for this project (either thread). */
export const isAnswerWaiting = (agents: AgentsService, projectId: string): boolean =>
  answersOf(agents).waiting(projectId);

/** The block shows: he prepares an answer, and it is not in the thread yet. */
export const showsWait = (
  wait: AnswerWait | null,
  last: { readonly id: string; readonly role: 'author' | 'compagnon' } | undefined,
): wait is AnswerWait =>
  wait !== null &&
  !(wait.after !== undefined && last?.role === 'compagnon' && last.id !== wait.after);

export function useAnswerState(
  agents: AgentsService,
  projectId: string,
  kind: AnswerKind,
): AnswerState {
  const known = answersOf(agents);
  return useSyncExternalStore(
    known.subscribe,
    useCallback(() => known.state(projectId, kind), [known, projectId, kind]),
  );
}

/** He prepares one, for whichever project (the console's key is not told which is open). */
export function useAnyAnswerWaiting(agents: AgentsService): boolean {
  const known = answersOf(agents);
  return useSyncExternalStore(
    known.subscribe,
    useCallback(() => known.waiting(), [known]),
  );
}
