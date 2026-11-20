import { AgentWorks, parseReferenceFile, UnreadableReferenceError } from '@charpentier/agents';
import type { AgentDocuments } from '@charpentier/agents';
import {
  LlmOfflineError,
  LlmRefusalError,
  LlmUnconfiguredError,
  type AgentsService,
  type ApiKeyResult,
  type CompagnonUnlockResult,
  type DocumentHandle,
  type DocumentService,
  type LlmRequest,
  type LlmResponse,
  type LlmService,
  type LlmStatus,
  type ReferenceChoiceResult,
} from '@charpentier/platform';
import type * as Y from 'yjs';

/**
 * The Compagnon of the app in the browser (docs/PLAN.md phase 4.7 b, the
 * author's choice on 20 November 2026: the server relays the calls). The
 * agents run in the page, on the documents the page keeps, as on the
 * desktop (`AgentWorks`); each call to the model goes to the server that
 * served the page, which adds the account's key. The key never comes back.
 */

/** Where the browser remembers the light model (D-20); no secret. */
const LIGHT_KEY = 'charpentier.compagnon.light';

type ServerStatus = 'available' | 'unconfigured' | 'locked';

export interface WebCompagnonDeps {
  readonly documents: DocumentService;
  /** The server is the page's own origin. */
  readonly origin: string;
  readonly fetch?: typeof fetch;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** The author picks a file (« Importer un texte de référence… »); null if they close the dialog. */
  readonly pickFile?: () => Promise<{ name: string; bytes: Uint8Array } | null>;
}

/** The model, through the server: the page's `LlmService`. */
class RelayLlm implements LlmService {
  #status: LlmStatus = 'unconfigured';
  readonly #listeners = new Set<(status: LlmStatus) => void>();

  constructor(
    private readonly call: (path: string, init?: RequestInit) => Promise<Response>,
    private readonly light: () => 'opus' | 'haiku',
  ) {}

  status(): LlmStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: LlmStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setStatus(status: LlmStatus) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  async generate(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await this.call('/api/compagnon/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, light: this.light() }),
        ...(signal && { signal }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      this.setStatus('offline');
      throw new LlmOfflineError('The server cannot be reached', { cause: error });
    }
    if (response.ok) {
      this.setStatus('available');
      return (await response.json()) as LlmResponse;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    switch (body.error) {
      case 'refused':
        throw new LlmRefusalError('The model declined');
      case 'locked':
        this.setStatus('locked');
        throw new LlmUnconfiguredError('The key waits for the password');
      case 'no-key':
      case 'key-refused':
        this.setStatus('unconfigured');
        throw new LlmUnconfiguredError('No key');
      case 'offline':
        throw new LlmOfflineError('The provider cannot be reached');
    }
    if (response.status === 401) {
      this.setStatus('unconfigured');
      throw new LlmUnconfiguredError('Not signed in');
    }
    throw new Error(`The relay answered ${response.status} ${body.error ?? ''}`);
  }
}

/** The page's documents, held for an agent's work and let go after. */
class HeldDocuments implements AgentDocuments {
  readonly #held = new Map<string, DocumentHandle[]>();

  constructor(private readonly documents: DocumentService) {}

  async acquire(guid: string): Promise<Y.Doc> {
    const handle = await this.documents.open(guid);
    await handle.whenLoaded;
    this.#held.set(guid, [...(this.#held.get(guid) ?? []), handle]);
    return handle.doc;
  }

  release(guid: string): void {
    const handles = this.#held.get(guid);
    const handle = handles?.pop();
    if (handles?.length === 0) this.#held.delete(guid);
    void handle?.close();
  }
}

export class WebCompagnon implements AgentsService {
  readonly keyOnServer = true;
  readonly #llm: RelayLlm;
  readonly #works: AgentWorks;
  #light: 'opus' | 'haiku';

  constructor(private readonly deps: WebCompagnonDeps) {
    let light: string | null = null;
    try {
      light = deps.storage?.getItem(LIGHT_KEY) ?? null;
    } catch {
      // A browser that keeps nothing: Opus, the default.
    }
    this.#light = light === 'haiku' ? 'haiku' : 'opus';
    this.#llm = new RelayLlm(
      (path, init) => this.#call(path, init),
      () => this.#light,
    );
    this.#works = new AgentWorks(this.#llm, new HeldDocuments(deps.documents), {
      get: () => this.#light,
      set: (model) => {
        this.#light = model;
        try {
          deps.storage?.setItem(LIGHT_KEY, model);
        } catch {
          // Kept for this page only.
        }
      },
    });
    globalThis.addEventListener?.('online', () => void this.refresh());
    globalThis.addEventListener?.('offline', () => this.#llm.setStatus('offline'));
  }

  #call(path: string, init: RequestInit = {}) {
    return (this.deps.fetch ?? fetch)(`${this.deps.origin}${path}`, {
      ...init,
      credentials: 'same-origin',
    });
  }

  /** Asks the server where the key stands (at start, after signing in, back online). */
  async refresh(): Promise<void> {
    try {
      const response = await this.#call('/api/compagnon');
      if (!response.ok) return this.#llm.setStatus('unconfigured');
      const { status } = (await response.json()) as { status?: ServerStatus };
      this.#llm.setStatus(status ?? 'unconfigured');
    } catch {
      this.#llm.setStatus('offline');
    }
  }

  status(): LlmStatus {
    return this.#llm.status();
  }

  onStatusChange(listener: (status: LlmStatus) => void): () => void {
    return this.#llm.onStatusChange(listener);
  }

  async setApiKey(key: string): Promise<ApiKeyResult> {
    try {
      const response = await this.#call('/api/compagnon/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (!response.ok) return 'offline';
      const { result } = (await response.json()) as { result?: ApiKeyResult };
      if (result === 'saved') this.#llm.setStatus('available');
      return result ?? 'offline';
    } catch {
      return 'offline';
    }
  }

  async forgetApiKey(): Promise<void> {
    try {
      await this.#call('/api/compagnon/key', { method: 'DELETE' });
    } finally {
      await this.refresh();
    }
  }

  async unlock(password: string): Promise<CompagnonUnlockResult> {
    try {
      const response = await this.#call('/api/compagnon/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 401) return 'invalid';
      if (response.status === 429) return 'too-many-attempts';
      if (!response.ok) return 'offline';
      const { status } = (await response.json()) as { status?: ServerStatus };
      this.#llm.setStatus(status ?? 'unconfigured');
      return 'unlocked';
    } catch {
      return 'offline';
    }
  }

  ask: AgentsService['ask'] = (input) => this.#works.ask(input);
  analyze: AgentsService['analyze'] = (input) => this.#works.analyze(input);
  reviewChapter: AgentsService['reviewChapter'] = (input) => this.#works.reviewChapter(input);
  interview: AgentsService['interview'] = (input) => this.#works.interview(input);
  estimateDeepWork: AgentsService['estimateDeepWork'] = (input) =>
    this.#works.estimateDeepWork(input);
  deepWork: AgentsService['deepWork'] = (input) => this.#works.deepWork(input);
  readReference: AgentsService['readReference'] = (input) => this.#works.readReference(input);

  async stopDeepWork(input: { readonly projectId: string }): Promise<void> {
    this.#works.stopDeepWork(input);
  }

  async dropReference(input: { readonly token: string }): Promise<void> {
    this.#works.dropReference(input);
  }

  async chooseReference(input: { readonly projectId: string }): Promise<ReferenceChoiceResult> {
    const file = await this.deps.pickFile?.();
    if (!file) return 'cancelled';
    try {
      return await this.#works.holdReference(
        input.projectId,
        await parseReferenceFile(file.bytes, file.name),
      );
    } catch (error) {
      if (error instanceof UnreadableReferenceError) return { refused: error.reason };
      console.error('Charpentier: a reference text could not be read', error);
      return { refused: 'unreadable' };
    }
  }

  async lightModel(): Promise<'opus' | 'haiku'> {
    return this.#works.lightModel();
  }

  async setLightModel(model: 'opus' | 'haiku'): Promise<void> {
    this.#works.setLightModel(model);
  }
}

/** The browser's file dialog, for the formats a reference text comes in. */
export function pickReferenceFile(): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.epub,.pdf';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      void file.arrayBuffer().then(
        (buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }),
        () => resolve(null),
      );
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
