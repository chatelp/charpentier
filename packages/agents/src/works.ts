import {
  LlmOfflineError,
  LlmRefusalError,
  LlmUnconfiguredError,
  type AskResult,
  type DeepTask,
  type DeepWorkEstimate,
  type DeepWorkOutcome,
  type LlmService,
  type ReferenceChoice,
} from '@charpentier/platform';
import {
  agentOrigin,
  fragmentPlainText,
  interviewSections,
  type InterviewSection,
  getScene,
  guids,
  hashEvidence,
  readMentorLevel,
  readOutline,
  variantFragment,
  watchAuthorship,
  type AuthorshipViolation,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { analyzeScene } from './analysis';
import { sceneContext } from './context';
import { answerAuthor } from './conversation';
import { deepWork, estimateDeepWork } from './deep-work';
import { interviewTurn } from './interview';
import { reviewChapter } from './review';
import { estimateStyle, readReference, type ReferenceText } from './style-reference';

/**
 * Where the documents an agent works on come from: the desktop's main
 * process holds them already open (synchronously), the browser opens them
 * from its own storage (asynchronously). Held until released.
 */
export interface AgentDocuments {
  acquire(guid: string, holder: unknown): Y.Doc | Promise<Y.Doc>;
  release(guid: string, holder: unknown): void;
}

/** Under this, a text says too little of a style (DESIGN §4.5, « trop court »). */
const REFERENCE_MIN_WORDS = 2000;
/** A reference text chosen and left on its confirmation is let go after this. */
const REFERENCE_HELD_MS = 30 * 60 * 1000;

/**
 * The Compagnon's works, wherever they run (the desktop's main process, the
 * browser): one task at a time per project, the documents held for the time
 * of a work, every agent write checked by `watchAuthorship`. The host brings
 * the LLM service (its key, or the server's relay) and the documents.
 */
export class AgentWorks {
  constructor(
    readonly llm: LlmService,
    private readonly store: AgentDocuments,
    private readonly lightModelStore: {
      get(): 'opus' | 'haiku';
      set(model: 'opus' | 'haiku'): void;
    } = { get: () => 'opus', set: () => {} },
    /**
     * Told of every write an agent may not make (to a scene above all:
     * principle n°1). The write is not undone, AgentWriter is what prevents
     * it; this second line of defence makes a leak loud.
     */
    private readonly onViolation: (violation: AuthorshipViolation) => void = (violation) =>
      console.error('Charpentier: an agent wrote where it may not', violation),
  ) {}

  /** The authorship guard of each document agents hold, shared by the works that overlap. */
  readonly #guards = new Map<string, { holders: number; stop: () => void }>();

  /** One analysis at a time per project: automatic triggers queue behind it. */
  readonly #running = new Map<string, Promise<unknown>>();

  async #analyze(
    projectId: string,
    sceneIds: readonly string[],
    automatic: boolean,
  ): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    if (automatic && this.llm.status() === 'offline') return 'offline';
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const run = previous.then(() => this.#analyzeNow(projectId, sceneIds, automatic));
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run;
  }

  async #analyzeNow(
    projectId: string,
    sceneIds: readonly string[],
    automatic: boolean,
  ): Promise<AskResult> {
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    try {
      for (const sceneId of sceneIds) {
        const sceneGuid = guids.scene(projectId, sceneId);
        await this.#withDocs([rootGuid, mentorGuid, sceneGuid], async (docs) => {
          const root = docs.get(rootGuid);
          const mentorDoc = docs.get(mentorGuid);
          const sceneDoc = docs.get(sceneGuid);
          const scene = root && getScene(root, sceneId);
          if (!root || !mentorDoc || !sceneDoc || !scene) return;
          const level = readMentorLevel(root);
          // What was analysed last: an unchanged scene is not analysed again automatically.
          const text = fragmentPlainText(variantFragment(sceneDoc, scene.activeVariantId));
          if (!text.trim()) return;
          const digest = hashEvidence([
            { sceneId, variantId: scene.activeVariantId, quote: `${level}|${text}` },
          ]);
          const analyses = mentorDoc.getMap<string>('analyses');
          if (automatic && analyses.get(sceneId) === digest) return;
          await analyzeScene({
            llm: this.llm,
            root,
            sceneDoc,
            sceneId,
            level,
            mentorDoc,
            tier: automatic ? 'fast' : 'deep',
          });
          mentorDoc.transact(() => analyses.set(sceneId, digest), agentOrigin('scene-analysis'));
        });
      }
      return 'answered';
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof LlmOfflineError) return 'offline';
      console.error('Charpentier: the scene analysis failed', error);
      return 'failed';
    }
  }

  /** The review of a chapter, queued like the analyses (one reading at a time per project). */
  async #reviewChapter(
    projectId: string,
    chapterId: string,
    automatic: boolean,
  ): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    if (automatic && this.llm.status() === 'offline') return 'offline';
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const run = previous.then(() => this.#reviewChapterNow(projectId, chapterId, automatic));
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run;
  }

  async #reviewChapterNow(
    projectId: string,
    chapterId: string,
    automatic: boolean,
  ): Promise<AskResult> {
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    try {
      return await this.#withDocs([rootGuid, mentorGuid], async (docs) => {
        const root = docs.get(rootGuid);
        const mentorDoc = docs.get(mentorGuid);
        if (!root || !mentorDoc) throw new Error('Documents missing');
        const sceneIds =
          readOutline(root)
            .find((c) => c.id === chapterId)
            ?.scenes.map((s) => s.id) ?? [];
        const sceneGuids = sceneIds.map((id) => guids.scene(projectId, id));
        return this.#withDocs(sceneGuids, async (sceneDocs) => {
          await reviewChapter({
            llm: this.llm,
            root,
            mentorDoc,
            sceneDocs: new Map(
              sceneIds.flatMap((id, i) => {
                const doc = sceneDocs.get(sceneGuids[i] ?? '');
                return doc ? [[id, doc] as const] : [];
              }),
            ),
            chapterId,
            automatic,
          });
          return 'answered' as const;
        });
      });
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof LlmOfflineError) return 'offline';
      console.error('Charpentier: the chapter review failed', error);
      return 'failed';
    }
  }

  /** One turn of the interview (D-26), queued with the readings: one task at a time per project. */
  async #interview(
    projectId: string,
    mode: 'free' | 'guided',
    skip: readonly string[],
    choice: { section?: string; pass?: boolean },
  ): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const run = previous.then(() => this.#interviewNow(projectId, mode, skip, choice));
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run;
  }

  async #interviewNow(
    projectId: string,
    mode: 'free' | 'guided',
    skip: readonly string[],
    choice: { section?: string; pass?: boolean },
  ): Promise<AskResult> {
    const isSection = (s: string | undefined): s is InterviewSection =>
      s !== undefined && (interviewSections as readonly string[]).includes(s);
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    try {
      return await this.#withDocs([rootGuid, mentorGuid], async (docs) => {
        const root = docs.get(rootGuid);
        const mentorDoc = docs.get(mentorGuid);
        if (!root || !mentorDoc) throw new Error('Documents missing');
        // Nothing to answer (free mode, the Compagnon spoke last) is not an error.
        await interviewTurn({
          llm: this.llm,
          root,
          mentorDoc,
          mode,
          skip: skip.filter(isSection),
          ...(isSection(choice.section) && { section: choice.section }),
          ...(choice.pass && { pass: true }),
        });
        return 'answered' as const;
      });
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof LlmOfflineError) return 'offline';
      console.error('Charpentier: the interview failed', error);
      return 'failed';
    }
  }

  /** Holds the project, its mentor document and every scene of the manuscript. */
  async #withManuscript<T>(
    projectId: string,
    work: (docs: { root: Y.Doc; mentorDoc: Y.Doc; sceneDocs: Map<string, Y.Doc> }) => Promise<T>,
  ): Promise<T> {
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    return this.#withDocs([rootGuid, mentorGuid], async (docs) => {
      const root = docs.get(rootGuid);
      const mentorDoc = docs.get(mentorGuid);
      if (!root || !mentorDoc) throw new Error('Documents missing');
      const sceneIds = readOutline(root).flatMap((c) => c.scenes.map((s) => s.id));
      const sceneGuids = sceneIds.map((id) => guids.scene(projectId, id));
      return this.#withDocs(sceneGuids, (held) =>
        work({
          root,
          mentorDoc,
          sceneDocs: new Map(
            sceneIds.flatMap((id, i) => {
              const doc = held.get(sceneGuids[i] ?? '');
              return doc ? [[id, doc] as const] : [];
            }),
          ),
        }),
      );
    });
  }

  async #estimateDeepWork(
    projectId: string,
    task: DeepTask,
    characterId: string | undefined,
  ): Promise<DeepWorkEstimate | null> {
    return this.#withManuscript(
      projectId,
      async (docs) =>
        estimateDeepWork({
          ...docs,
          task,
          ...(characterId !== undefined && { characterId }),
        }) ?? null,
    );
  }

  /** A specialised agent on the whole manuscript (D-27), queued with the readings. */
  async #deepWork(
    projectId: string,
    task: DeepTask,
    characterId: string | undefined,
  ): Promise<DeepWorkOutcome> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const controller = this.#startWork(projectId);
    const run = previous.then(async (): Promise<DeepWorkOutcome> => {
      if (controller.signal.aborted) return 'stopped';
      try {
        return await this.#withManuscript(projectId, async (docs) => {
          const result = await deepWork({
            llm: this.llm,
            ...docs,
            task,
            ...(characterId !== undefined && { characterId }),
            signal: controller.signal,
          });
          return result === 'nothing-to-read' ? 'empty' : 'answered';
        });
      } catch (error) {
        if (controller.signal.aborted) return 'stopped';
        if (error instanceof LlmUnconfiguredError) return 'unavailable';
        if (error instanceof LlmRefusalError) return 'refused';
        if (error instanceof LlmOfflineError) return 'offline';
        console.error(`Charpentier: the ${task} work failed`, error);
        return 'failed';
      }
    });
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run.finally(() => {
      this.#endWork(projectId, controller);
    });
  }

  /**
   * The background works of each project, running or queued, each with its
   * own controller: « Arrêter » stops them all (a work queued behind another
   * must not take the running one's place here, or it could not be stopped).
   */
  readonly #works = new Map<string, Set<AbortController>>();

  #startWork(projectId: string): AbortController {
    const controller = new AbortController();
    const works = this.#works.get(projectId) ?? new Set();
    works.add(controller);
    this.#works.set(projectId, works);
    return controller;
  }

  #endWork(projectId: string, controller: AbortController): void {
    const works = this.#works.get(projectId);
    works?.delete(controller);
    if (works?.size === 0) this.#works.delete(projectId);
  }

  /**
   * The reference texts chosen and not read yet (docs/PLAN.md §6.4), in
   * memory only; one the author leaves on the confirmation is let go after
   * REFERENCE_HELD_MS.
   */
  readonly #references = new Map<
    string,
    { projectId: string; text: ReferenceText; timer: ReturnType<typeof setTimeout> }
  >();

  #dropReference(token: string) {
    const held = this.#references.get(token);
    if (held) clearTimeout(held.timer);
    this.#references.delete(token);
  }

  /**
   * A text the author chose, already read by the host from its file: held,
   * its reading's cost estimated (`ReferenceChoice`), or too short to say
   * much of a style.
   */
  async holdReference(
    projectId: string,
    text: ReferenceText & { format: ReferenceChoice['format'] },
  ): Promise<ReferenceChoice | { refused: 'too-short'; words: number }> {
    const rootGuid = guids.project(projectId);
    const language = await this.#withDocs([rootGuid], async (docs) => {
      const root = docs.get(rootGuid);
      return root ? sceneContext(root, undefined, undefined).language : 'fr';
    });
    const estimate = estimateStyle(text, language);
    if (estimate.words < REFERENCE_MIN_WORDS)
      return { refused: 'too-short', words: estimate.words };
    const token = globalThis.crypto.randomUUID();
    const timer = setTimeout(() => this.#dropReference(token), REFERENCE_HELD_MS);
    // In Node, a held text does not keep the process alive.
    (timer as { unref?: () => void }).unref?.();
    this.#references.set(token, { projectId, text, timer });
    return {
      token,
      title: text.title,
      ...(text.author && { author: text.author }),
      format: text.format,
      ...estimate,
    };
  }

  /** Reads a held text (queued with the project's other works), then lets it go. */
  async #readReference(projectId: string, token: string): Promise<DeepWorkOutcome> {
    const held = this.#references.get(token);
    if (!held || held.projectId !== projectId) return 'empty';
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    this.#dropReference(token);
    const previous = this.#running.get(projectId) ?? Promise.resolve();
    const controller = this.#startWork(projectId);
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    const run = previous.then(async (): Promise<DeepWorkOutcome> => {
      if (controller.signal.aborted) return 'stopped';
      try {
        return await this.#withDocs([rootGuid, mentorGuid], async (docs) => {
          const root = docs.get(rootGuid);
          const mentorDoc = docs.get(mentorGuid);
          if (!root || !mentorDoc) throw new Error('Documents missing');
          const result = await readReference({
            llm: this.llm,
            root,
            mentorDoc,
            text: held.text,
            signal: controller.signal,
          });
          return result === 'nothing-to-read' ? 'empty' : 'answered';
        });
      } catch (error) {
        if (controller.signal.aborted) return 'stopped';
        if (error instanceof LlmUnconfiguredError) return 'unavailable';
        if (error instanceof LlmRefusalError) return 'refused';
        if (error instanceof LlmOfflineError) return 'offline';
        console.error('Charpentier: the reading of a reference text failed', error);
        return 'failed';
      }
    });
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run.finally(() => {
      this.#endWork(projectId, controller);
    });
  }

  /** Holds the documents an agent needs for the time of its work. */
  async #withDocs<T>(
    guidsNeeded: readonly string[],
    work: (docs: Map<string, Y.Doc>) => Promise<T>,
  ) {
    const docs = new Map<string, Y.Doc>();
    try {
      for (const guid of guidsNeeded) docs.set(guid, await this.store.acquire(guid, this));
    } catch (error) {
      for (const guid of docs.keys()) this.store.release(guid, this);
      throw error;
    }
    // Every agent transaction on these documents is checked while they are held.
    for (const [guid, doc] of docs) {
      const guard = this.#guards.get(guid);
      if (guard) guard.holders++;
      else
        this.#guards.set(guid, {
          holders: 1,
          stop: watchAuthorship(doc, (violation) => this.onViolation(violation)),
        });
    }
    try {
      return await work(docs);
    } finally {
      for (const guid of docs.keys()) {
        const guard = this.#guards.get(guid);
        if (guard && --guard.holders === 0) {
          guard.stop();
          this.#guards.delete(guid);
        }
      }
      for (const guid of guidsNeeded) this.store.release(guid, this);
    }
  }

  async #ask(projectId: string, sceneId: string | undefined): Promise<AskResult> {
    if (this.llm.status() === 'unconfigured') return 'unavailable';
    const rootGuid = guids.project(projectId);
    const mentorGuid = guids.mentor(projectId);
    const sceneGuid = sceneId ? guids.scene(projectId, sceneId) : undefined;
    try {
      await this.#withDocs([rootGuid, mentorGuid, ...(sceneGuid ? [sceneGuid] : [])], (docs) => {
        const root = docs.get(rootGuid);
        const mentorDoc = docs.get(mentorGuid);
        if (!root || !mentorDoc) throw new Error('Documents missing');
        const sceneDoc = sceneGuid ? docs.get(sceneGuid) : undefined;
        return answerAuthor({
          llm: this.llm,
          root,
          mentorDoc,
          ...(sceneDoc && { sceneDoc }),
          ...(sceneId !== undefined && { sceneId }),
        });
      });
      return 'answered';
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof LlmOfflineError) return 'offline';
      console.error('Charpentier: the Compagnon could not answer', error);
      return 'failed';
    }
  }

  /** Answers the author's last message of the conversation. */
  ask(input: { readonly projectId: string; readonly sceneId?: string }): Promise<AskResult> {
    return this.#ask(input.projectId, input.sceneId);
  }

  analyze(input: {
    readonly projectId: string;
    readonly sceneIds: readonly string[];
    readonly automatic: boolean;
  }): Promise<AskResult> {
    return this.#analyze(input.projectId, input.sceneIds, input.automatic);
  }

  reviewChapter(input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly automatic: boolean;
  }): Promise<AskResult> {
    return this.#reviewChapter(input.projectId, input.chapterId, input.automatic);
  }

  interview(input: {
    readonly projectId: string;
    readonly mode: 'free' | 'guided';
    readonly skip?: readonly string[];
    readonly section?: string;
    readonly pass?: boolean;
  }): Promise<AskResult> {
    return this.#interview(input.projectId, input.mode, input.skip ?? [], {
      ...(input.section !== undefined && { section: input.section }),
      ...(input.pass !== undefined && { pass: input.pass }),
    });
  }

  estimateDeepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }): Promise<DeepWorkEstimate | null> {
    return this.#estimateDeepWork(input.projectId, input.task, input.characterId);
  }

  deepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }): Promise<DeepWorkOutcome> {
    return this.#deepWork(input.projectId, input.task, input.characterId);
  }

  readReference(input: { readonly projectId: string; readonly token: string }) {
    return this.#readReference(input.projectId, input.token);
  }

  dropReference(input: { readonly token: string }): void {
    this.#dropReference(input.token);
  }

  /** « Arrêter »: the running work stops, and nothing it found is filed. */
  stopDeepWork(input: { readonly projectId: string }): void {
    for (const work of this.#works.get(input.projectId) ?? []) work.abort();
  }

  lightModel(): 'opus' | 'haiku' {
    return this.lightModelStore.get();
  }

  setLightModel(model: 'opus' | 'haiku'): void {
    this.lightModelStore.set(model);
  }
}
