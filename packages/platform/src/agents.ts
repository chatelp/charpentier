import type { LlmStatus } from './llm';

/** Outcome of saving an API key: checked against the provider first. */
/** `no-keychain`: a good key, but this system has nowhere to keep it safely. */
export type ApiKeyResult = 'saved' | 'invalid' | 'offline' | 'no-keychain';

/**
 * Background work on the whole manuscript, by a specialised agent (D-27):
 * check the structure, track the clues, take stock of one character.
 */
export type DeepTask = 'structure' | 'clues' | 'character';

/** What a task on the whole manuscript will cost, announced before it runs. */
export interface DeepWorkEstimate {
  /** What it reads. */
  readonly scenes: number;
  readonly words: number;
  readonly inputTokens: number;
  /** The usual answer, thinking included. */
  readonly outputTokens: number;
  /** In US dollars, the provider's currency: the usual cost, and at most (the longest answer). */
  readonly usd: number;
  readonly usdMax: number;
  /** How long it usually takes, in seconds: from, to. */
  readonly seconds: readonly [number, number];
  /** When it last ran on this very manuscript, if it did (ISO date). */
  readonly unchangedSince?: string;
}

/**
 * A reference text the author chose (docs/PLAN.md §6.4), held by the host
 * until it is read or dropped: what it is, and what reading it will cost.
 * The text itself never reaches the interface, nor the project.
 */
export interface ReferenceChoice {
  /** To read it, or drop it. */
  readonly token: string;
  readonly title: string;
  readonly author?: string;
  readonly format: 'txt' | 'md' | 'epub' | 'pdf';
  readonly words: number;
  readonly chapters: number;
  /** The passages drawn at random that go to the model; the rest is measured on the device. */
  readonly passages: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** In US dollars: the usual cost, and at most. */
  readonly usd: number;
  readonly usdMax: number;
  readonly seconds: readonly [number, number];
}

/**
 * Choosing a file: the text, or why not: the author closed the dialog, a
 * file the host cannot read, a book locked by a DRM or a password, a PDF of
 * scanned pages, a text too short to say much (REFERENCE_MIN_WORDS).
 */
export type ReferenceChoiceResult = ReferenceChoice | 'cancelled' | ReferenceRefusal;

export interface ReferenceRefusal {
  readonly refused: 'unreadable' | 'protected' | 'image-pdf' | 'too-short';
  /** For `too-short`: how many words it has. */
  readonly words?: number;
}

/** How a background work ended: `stopped` by the author, `empty` with nothing to read. */
export type DeepWorkOutcome = AskResult | 'stopped' | 'empty';

/** Opening the key again with the account's password. */
export type CompagnonUnlockResult = 'unlocked' | 'invalid' | 'too-many-attempts' | 'offline';

/** Outcome of asking the Compagnon to answer (its answer lands in the mentor document). */
export type AskResult = 'answered' | 'unavailable' | 'offline' | 'refused' | 'failed';

/**
 * Entry point of core into the Compagnon. Agents run outside the UI
 * (Electron main process, server) and write their results into the project's
 * Yjs documents, never into scene documents (docs/SPEC.md §15.5). The API key
 * goes in, never back out: the UI cannot read it.
 */
export interface AgentsService {
  status(): LlmStatus;
  onStatusChange(listener: (status: LlmStatus) => void): () => void;
  /** Checks the key with the provider, then keeps it in the OS keychain. */
  setApiKey(key: string): Promise<ApiKeyResult>;
  forgetApiKey(): Promise<void>;
  /** Answers the author's last message of the conversation (docs/SPEC.md §6.7). */
  ask(input: { readonly projectId: string; readonly sceneId?: string }): Promise<AskResult>;
  /**
   * Analyses scenes (docs/SPEC.md §6.2): sheets proposals, conflicts, remarks.
   * `automatic` skips scenes unchanged since their last analysis and may use
   * the light model.
   */
  analyze(input: {
    readonly projectId: string;
    readonly sceneIds: readonly string[];
    readonly automatic: boolean;
  }): Promise<AskResult>;
  /**
   * The Compagnon's review of a whole chapter, left in the conversation (D-19:
   * at the end of each chapter at level 4, on demand at every level).
   * `automatic` skips a chapter unchanged since its last review.
   */
  reviewChapter(input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly automatic: boolean;
  }): Promise<AskResult>;
  /**
   * One turn of the interview with the Compagnon (D-26): answers the author's
   * last message of the interview thread, or (guided) asks the next
   * question; what belongs to the Atelier is filed there as proposals.
   * `skip`: sections the author left for later.
   */
  interview(input: {
    readonly projectId: string;
    readonly mode: 'free' | 'guided';
    readonly skip?: readonly string[];
    /** « Autre section… »: this section instead of the emptiest one. */
    readonly section?: string;
    /** « Passer »: another question on the same section. */
    readonly pass?: boolean;
  }): Promise<AskResult>;
  /**
   * What a task on the whole manuscript will cost (D-27, docs/PLAN.md §6.3),
   * or null when there is nothing to read (no text, no such character).
   */
  estimateDeepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }): Promise<DeepWorkEstimate | null>;
  /**
   * Runs it: proposals and signals in the project, the review in the
   * conversation. One task at a time per project, queued with the readings.
   */
  deepWork(input: {
    readonly projectId: string;
    readonly task: DeepTask;
    readonly characterId?: string;
  }): Promise<DeepWorkOutcome>;
  /** « Arrêter »: the running work stops, and nothing it found is filed. */
  stopDeepWork(input: { readonly projectId: string }): Promise<void>;
  /**
   * « Importer un texte de référence… » (docs/PLAN.md §6.4): the system's
   * file dialog, then the text read and held by the host, its cost estimated.
   */
  chooseReference(input: { readonly projectId: string }): Promise<ReferenceChoiceResult>;
  /**
   * Reads the chosen text: style choices proposed in Style et voix, the
   * Compagnon's message in the interview; then the text is dropped. Queued
   * with the other works of the project; « Arrêter » is `stopDeepWork`.
   */
  readReference(input: {
    readonly projectId: string;
    readonly token: string;
  }): Promise<DeepWorkOutcome>;
  /** The author changed their mind: the text is dropped unread. */
  dropReference(input: { readonly token: string }): Promise<void>;
  /**
   * Where the key lives, for the words of the interface: the device's
   * keychain (desktop), or the author's server (the browser, phase 4.7 b).
   */
  readonly keyOnServer?: boolean;
  /**
   * « locked » (the key on the server, sealed by the password): the account's
   * password opens it again for this session. Absent where no key is locked.
   */
  unlock?(password: string): Promise<CompagnonUnlockResult>;
  /** D-20: the model of the light, frequent work. */
  lightModel(): Promise<'opus' | 'haiku'>;
  setLightModel(model: 'opus' | 'haiku'): Promise<void>;
}
