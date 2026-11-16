import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  analyzeScene,
  answerAuthor,
  deepWork,
  estimateDeepWork,
  estimateStyle,
  interviewTurn,
  readReference,
  reviewChapter,
  sceneContext,
  type ReferenceText,
} from '@charpentier/agents';
import type {
  ApiKeyResult,
  AskResult,
  DeepTask,
  DeepWorkEstimate,
  DeepWorkOutcome,
  LlmStatus,
  ReferenceChoiceResult,
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
} from '@charpentier/schema';
import type * as Y from 'yjs';
import type { Request } from '../shared/ipc';
import { LlmRefusalError, LlmUnconfiguredError, type AnthropicLlmService } from './anthropic-llm';
import type { DocStore } from './doc-store';
import { readReferenceFile, UnreadableReferenceError } from './reference-file';
import type { SecretStore } from './secret-store';

export const API_KEY_SECRET = 'anthropic.apiKey';

/** Under this, a text says too little of a style (DESIGN §4.5, « trop court »). */
const REFERENCE_MIN_WORDS = 2000;
/** A reference text chosen and left on its confirmation is let go after this. */
const REFERENCE_HELD_MS = 30 * 60 * 1000;

type AgentRequest = Extract<Request, { type: `agents.${string}` }>;

/**
 * The Compagnon's side of the main process: the LLM service, the key in the
 * keychain, and (from phase 3.4) the agents themselves.
 */
export class AgentHost {
  constructor(
    readonly llm: AnthropicLlmService,
    private readonly secrets: SecretStore,
    private readonly store: DocStore,
    private readonly lightModel: {
      get(): 'opus' | 'haiku';
      set(model: 'opus' | 'haiku'): void;
    } = { get: () => 'opus', set: () => {} },
  ) {}

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
            tier: automatic ? 'fast' : 'deep',
          });
          mentorDoc.transact(() => analyses.set(sceneId, digest), agentOrigin('scene-analysis'));
        });
      }
      return 'answered';
    } catch (error) {
      if (error instanceof LlmUnconfiguredError) return 'unavailable';
      if (error instanceof LlmRefusalError) return 'refused';
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
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
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
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
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
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
    const controller = new AbortController();
    this.#works.set(projectId, controller);
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
        if (error instanceof Anthropic.APIConnectionError) return 'offline';
        console.error(`Charpentier: the ${task} work failed`, error);
        return 'failed';
      }
    });
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run.finally(() => {
      if (this.#works.get(projectId) === controller) this.#works.delete(projectId);
    });
  }

  /** The background work of each project, to stop it (« Arrêter »). */
  readonly #works = new Map<string, AbortController>();

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

  /** A file the author chose: read, held, its reading's cost estimated. */
  async openReference(projectId: string, file: string): Promise<ReferenceChoiceResult> {
    let text: ReferenceText & { format: 'txt' | 'md' | 'epub' | 'pdf' };
    try {
      text = await readReferenceFile(file);
    } catch (error) {
      if (error instanceof UnreadableReferenceError) return error.reason;
      console.error('Charpentier: a reference text could not be read', error);
      return 'unreadable';
    }
    const rootGuid = guids.project(projectId);
    const language = await this.#withDocs([rootGuid], async (docs) => {
      const root = docs.get(rootGuid);
      return root ? sceneContext(root, undefined, undefined).language : 'fr';
    });
    const estimate = estimateStyle(text, language);
    if (estimate.words < REFERENCE_MIN_WORDS) return 'too-short';
    const token = randomUUID();
    const timer = setTimeout(() => this.#dropReference(token), REFERENCE_HELD_MS);
    timer.unref?.();
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
    const controller = new AbortController();
    this.#works.set(projectId, controller);
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
        if (error instanceof Anthropic.APIConnectionError) return 'offline';
        console.error('Charpentier: the reading of a reference text failed', error);
        return 'failed';
      }
    });
    this.#running.set(
      projectId,
      run.catch(() => {}),
    );
    return run.finally(() => {
      if (this.#works.get(projectId) === controller) this.#works.delete(projectId);
    });
  }

  /** Holds the documents an agent needs for the time of its work. */
  async #withDocs<T>(
    guidsNeeded: readonly string[],
    work: (docs: Map<string, Y.Doc>) => Promise<T>,
  ) {
    const docs = new Map(
      guidsNeeded.map((guid) => [guid, this.store.acquire(guid, this)] as const),
    );
    try {
      return await work(docs);
    } finally {
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
      if (error instanceof Anthropic.APIConnectionError) return 'offline';
      console.error('Charpentier: the Compagnon could not answer', error);
      return 'failed';
    }
  }

  async handle(
    request: AgentRequest,
  ): Promise<
    LlmStatus | ApiKeyResult | DeepWorkOutcome | DeepWorkEstimate | 'opus' | 'haiku' | null
  > {
    switch (request.type) {
      case 'agents.status':
        return this.llm.status();
      case 'agents.setKey': {
        const key = request.key.trim();
        const check = await this.llm.checkKey(key);
        if (check === 'invalid') return 'invalid';
        if (check === 'offline') return 'offline';
        // Said, not mistaken for a bad key: the system cannot keep it (Linux without keychain).
        if (!this.secrets.set(API_KEY_SECRET, key)) return 'no-keychain';
        this.llm.keyChanged();
        return 'saved';
      }
      case 'agents.forgetKey':
        this.secrets.delete(API_KEY_SECRET);
        this.llm.keyChanged();
        return null;
      case 'agents.ask':
        return this.#ask(request.projectId, request.sceneId);
      case 'agents.analyze':
        return this.#analyze(request.projectId, request.sceneIds, request.automatic);
      case 'agents.reviewChapter':
        return this.#reviewChapter(request.projectId, request.chapterId, request.automatic);
      case 'agents.interview':
        return this.#interview(request.projectId, request.mode, request.skip ?? [], {
          ...(request.section !== undefined && { section: request.section }),
          ...(request.pass !== undefined && { pass: request.pass }),
        });
      case 'agents.estimateDeepWork':
        return this.#estimateDeepWork(request.projectId, request.task, request.characterId);
      case 'agents.deepWork':
        return this.#deepWork(request.projectId, request.task, request.characterId);
      case 'agents.chooseReference':
        // The system's file dialog belongs to the window: apps/desktop opens
        // it, then hands the file to openReference.
        throw new Error('A reference text is chosen through the window');
      case 'agents.readReference':
        return this.#readReference(request.projectId, request.token);
      case 'agents.dropReference':
        this.#dropReference(request.token);
        return null;
      case 'agents.stopDeepWork':
        this.#works.get(request.projectId)?.abort();
        return null;
      case 'agents.lightModel':
        return this.lightModel.get();
      case 'agents.setLightModel':
        this.lightModel.set(request.model);
        return null;
    }
  }
}
