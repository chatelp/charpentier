import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type {
  AdminOpening,
  DocumentHandle,
  DocumentService,
  SignInResult,
  SyncAccountInfo,
  SyncDevice,
  SyncService,
  SyncStatus,
} from '@charpentier/platform';
import { guids, isPristineProject, listAllScenes, names } from '@charpentier/schema';
import type * as Y from 'yjs';
import type { DocumentLibrary, LibraryRecord } from './library';

/**
 * The sync of the app in the browser (docs/PLAN.md phase 4.7 a), the
 * desktop's in its browser form: the documents kept in IndexedDB are relayed
 * to the server that served the page, by one Hocuspocus provider each, over
 * one WebSocket. The session lives in a cookie the page cannot read
 * (`HttpOnly`): the providers send « cookie » instead of a token, and this
 * code never holds a secret. Writing never waits for the network.
 */

/** The account's library: one entry per project, last change wins. */
const PROJECTS = 'projects';
/** What the providers send for a token: the server reads the cookie instead. */
const COOKIE_TOKEN = 'cookie';
/** Where the browser remembers who is signed in (no secret: the cookie is the session). */
const ACCOUNT_KEY = 'charpentier.sync.account';

interface StoredAccount extends SyncAccountInfo {
  readonly userId: string;
}

export interface WebSyncDeps {
  readonly documents: DocumentService;
  readonly library: DocumentLibrary;
  /** The server is the page's own origin (`https://charpentier.chatel.pm`). */
  readonly origin: string;
  /** Name of this device in the account's list (« Navigateur · Firefox »). */
  readonly device: string;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  readonly fetch?: typeof fetch;
  /** For a test outside a browser. */
  readonly WebSocket?: unknown;
  /** A new tab, opened on the author's gesture (« Administrer le serveur… »). */
  readonly openTab?: () => { opener: unknown; location: { href: string }; close(): void } | null;
  /** Forgets every document the browser keeps (« Se déconnecter »). */
  readonly forgetDocuments?: () => Promise<void>;
}

const wsUrl = (origin: string) => origin.replace(/\/+$/, '').replace(/^http/, 'ws');

export class WebSync implements SyncService {
  #account: StoredAccount | null = null;
  #socket: HocuspocusProviderWebsocket | null = null;
  readonly #providers = new Map<string, { provider: HocuspocusProvider; handle: DocumentHandle }>();
  #libraryDoc: Y.Doc | null = null;
  #status: SyncStatus = 'off';
  #connected = false;
  /** The account's library heard from the server at least once since starting. */
  #librarySynced = false;
  /** This browser's untouched starters, kept off an account that has projects. */
  readonly #withheld = new Set<string>();
  readonly #listeners = new Set<(status: SyncStatus) => void>();
  readonly #stops: (() => void)[] = [];

  constructor(private readonly deps: WebSyncDeps) {}

  /** The web app syncs only with the server that served it. */
  get server(): string {
    return this.deps.origin;
  }

  #fetch(path: string, init: RequestInit = {}) {
    return (this.deps.fetch ?? fetch)(`${this.deps.origin}${path}`, {
      ...init,
      credentials: 'same-origin',
    });
  }

  #stored(): StoredAccount | null {
    try {
      const raw = this.deps.storage?.getItem(ACCOUNT_KEY);
      return raw ? (JSON.parse(raw) as StoredAccount) : null;
    } catch {
      return null;
    }
  }

  #store(account: StoredAccount | null) {
    try {
      if (account) this.deps.storage?.setItem(ACCOUNT_KEY, JSON.stringify(account));
      else this.deps.storage?.removeItem(ACCOUNT_KEY);
    } catch {
      // A browser that keeps nothing: the session lasts as long as the page.
    }
  }

  status(): SyncStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async account(): Promise<SyncAccountInfo | null> {
    const account = this.#account ?? this.#stored();
    return account ? { server: account.server, email: account.email } : null;
  }

  #setStatus(status: SyncStatus) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  #refreshStatus() {
    if (!this.#account) return this.#setStatus('off');
    if (this.#status === 'unauthorized') return;
    if (!this.#connected) return this.#setStatus(this.#socket ? 'offline' : 'connecting');
    const pending = [...this.#providers.values()].some(
      ({ provider }) => !provider.isSynced || provider.hasUnsyncedChanges,
    );
    this.#setStatus(pending ? 'syncing' : 'synced');
  }

  async signIn(input: {
    readonly server: string;
    readonly email: string;
    readonly password: string;
  }): Promise<SignInResult> {
    let response: Response;
    try {
      response = await this.#fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          device: this.deps.device,
          cookie: true,
        }),
      });
    } catch {
      return 'unreachable';
    }
    if (response.status === 401) return 'invalid';
    if (response.status === 429) return 'too-many-attempts';
    if (!response.ok) return 'unreachable';
    const body = (await response.json()) as { userId?: unknown };
    if (typeof body.userId !== 'string') return 'unreachable';
    this.stop();
    this.#store({ server: this.deps.origin, email: input.email.trim(), userId: body.userId });
    this.#status = 'off';
    await this.start();
    return 'ok';
  }

  /**
   * Signs this browser out and forgets what it keeps, once everything is on
   * the server; with changes not sent yet, they stay here until next time.
   */
  async signOut(): Promise<void> {
    const synced = await this.idle(5000);
    this.stop();
    this.#store(null);
    this.#setStatus('off');
    try {
      await this.#fetch('/api/logout', { method: 'POST' });
    } catch {
      // Offline: the session stays valid on the server until revoked from another device.
    }
    if (synced) await this.deps.forgetDocuments?.();
  }

  /** Starts syncing if this browser is signed in (the cookie is checked by the server). */
  async start(): Promise<void> {
    if (this.#socket) return;
    const account = this.#stored();
    this.#account = account;
    if (!account) return this.#setStatus('off');
    this.#setStatus('connecting');

    const socket = new HocuspocusProviderWebsocket({
      url: wsUrl(this.deps.origin),
      ...(this.deps.WebSocket !== undefined && { WebSocketPolyfill: this.deps.WebSocket }),
    });
    socket.on('status', ({ status }: { status: string }) => {
      this.#connected = status === 'connected';
      this.#refreshStatus();
    });
    this.#socket = socket;

    const libraryHandle = await this.deps.documents.open(`library:${account.userId}`);
    await libraryHandle.whenLoaded;
    if (this.#socket !== socket) return void libraryHandle.close();
    this.#libraryDoc = libraryHandle.doc;
    const libraryProvider = this.#provide(libraryHandle);
    libraryProvider.on('synced', () => {
      this.#librarySynced = true;
      void this.reconcile();
    });
    const projects = libraryHandle.doc.getMap(PROJECTS);
    const onRemote = (_event: unknown, transaction: Y.Transaction) => {
      if (transaction.origin !== null && !transaction.local) void this.reconcile();
    };
    projects.observe(onRemote);
    this.#stops.push(() => projects.unobserve(onRemote));
    const stopLocal = await this.deps.library.onLocalChange(() => void this.reconcile());
    this.#stops.push(stopLocal);
    await this.reconcile();
  }

  /** Stops syncing; what was written stays in the browser. */
  stop(): void {
    for (const stop of this.#stops.splice(0)) stop();
    for (const { provider, handle } of this.#providers.values()) {
      provider.destroy();
      void handle.close();
    }
    this.#providers.clear();
    this.#socket?.destroy();
    this.#socket = null;
    this.#connected = false;
    this.#libraryDoc = null;
    this.#account = null;
    this.#librarySynced = false;
    this.#withheld.clear();
    if (this.#status !== 'unauthorized') this.#setStatus('off');
  }

  #provide(handle: DocumentHandle): HocuspocusProvider {
    const existing = this.#providers.get(handle.guid);
    if (existing) {
      void handle.close();
      return existing.provider;
    }
    const socket = this.#socket;
    if (!socket) throw new Error('Sync is not started');
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: handle.guid,
      document: handle.doc,
      token: COOKIE_TOKEN,
      awareness: null,
    });
    provider.on('synced', () => this.#refreshStatus());
    provider.on('unsyncedChanges', () => this.#refreshStatus());
    provider.on('authenticationFailed', () => {
      // The session was revoked or the password changed: sign in again.
      this.#setStatus('unauthorized');
    });
    provider.attach();
    this.#providers.set(handle.guid, { provider, handle });
    return provider;
  }

  async #openAndProvide(guid: string) {
    if (this.#providers.has(guid)) return;
    const handle = await this.deps.documents.open(guid);
    await handle.whenLoaded;
    if (!this.#socket) return void handle.close();
    this.#provide(handle);
  }

  /** A project this browser made at its first visit, still untouched (not for the account). */
  async #pristine(projectId: string): Promise<boolean> {
    const handles: DocumentHandle[] = [];
    const open = async (guid: string) => {
      const handle = await this.deps.documents.open(guid);
      handles.push(handle);
      await handle.whenLoaded;
      return handle.doc;
    };
    try {
      const root = await open(guids.project(projectId));
      const scenes = new Map<string, Y.Doc>();
      for (const scene of listAllScenes(root))
        scenes.set(scene.id, await open(guids.scene(projectId, scene.id)));
      return isPristineProject({ root, mentor: await open(guids.mentor(projectId)), scenes });
    } finally {
      for (const handle of handles) void handle.close();
    }
  }

  /** The browser's projects kept off the account (untouched starters). */
  withheld(): readonly string[] {
    return [...this.#withheld];
  }

  /** Syncs a project's documents: root, mentor, and each scene with its history. */
  async #syncProject(projectId: string) {
    const rootGuid = guids.project(projectId);
    if (this.#providers.has(rootGuid)) return;
    const handle = await this.deps.documents.open(rootGuid);
    await handle.whenLoaded;
    if (!this.#socket || this.#providers.has(rootGuid)) return void handle.close();
    this.#provide(handle);
    await this.#openAndProvide(guids.mentor(projectId));
    const scenes = handle.doc.getMap(names.scenes);
    const provideScene = (sceneId: string) => {
      void this.#openAndProvide(guids.scene(projectId, sceneId));
      void this.#openAndProvide(guids.sceneHistory(projectId, sceneId));
    };
    for (const sceneId of scenes.keys()) provideScene(sceneId);
    const onScenes = (event: Y.YMapEvent<unknown>) => {
      for (const key of event.keysChanged) if (scenes.has(key)) provideScene(key);
    };
    scenes.observe(onScenes);
    this.#stops.push(() => scenes.unobserve(onScenes));
  }

  #reconciling: Promise<void> | null = null;

  /**
   * Brings the browser's library and the account's together, as on the
   * desktop: the newer side wins, each project is synced.
   */
  reconcile(): Promise<void> {
    const run = async () => {
      const libraryDoc = this.#libraryDoc;
      // Nothing goes to the account before its library is heard.
      if (!libraryDoc || !this.#librarySynced) return;
      const projects = libraryDoc.getMap<LibraryRecord>(PROJECTS);
      const local = new Map((await this.deps.library.all()).map((p) => [p.id, p]));
      const accountHasProjects = [...projects.values()].some((p) => !p.trashedAt);
      this.#withheld.clear();
      for (const p of local.values())
        if (!projects.has(p.id) && accountHasProjects && (await this.#pristine(p.id)))
          this.#withheld.add(p.id);
      const newer = (a: LibraryRecord, b: LibraryRecord | undefined) =>
        !b || a.updatedAt > b.updatedAt || (a.trashedAt ?? '') > (b.trashedAt ?? '');
      const record = (p: LibraryRecord): LibraryRecord => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        ...(p.trashedAt && { trashedAt: p.trashedAt }),
      });
      libraryDoc.transact(() => {
        for (const p of local.values())
          if (!this.#withheld.has(p.id) && newer(p, projects.get(p.id)))
            projects.set(p.id, record(p));
      });
      for (const [id, remote] of projects)
        if (newer(remote, local.get(id))) await this.deps.library.adopt(remote);
      if (this.#libraryDoc !== libraryDoc) return;
      for (const id of new Set([...local.keys(), ...projects.keys()]))
        if (!this.#withheld.has(id)) await this.#syncProject(id);
      this.#refreshStatus();
    };
    const previous = this.#reconciling ?? Promise.resolve();
    const next = previous.then(run, run);
    this.#reconciling = next.finally(() => {
      if (this.#reconciling === next) this.#reconciling = null;
    });
    return next;
  }

  async devices(): Promise<readonly SyncDevice[] | null> {
    if (!this.#stored()) return [];
    try {
      const response = await this.#fetch('/api/devices');
      if (!response.ok) return null;
      const body = (await response.json()) as { devices?: SyncDevice[] };
      return (body.devices ?? []).map(({ id, device, lastSeenAt, current }) => ({
        id,
        device,
        lastSeenAt,
        current,
      }));
    } catch {
      return null;
    }
  }

  async revokeDevice(id: string): Promise<boolean> {
    try {
      const response = await this.#fetch(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * The administration page in a new tab, for an administrator, where it
   * answers. The tab opens at once (a browser lets a page open one only on
   * the author's gesture), then goes to the page, or closes.
   */
  async openAdmin(): Promise<AdminOpening> {
    const tab = this.deps.openTab?.() ?? null;
    const done = (result: AdminOpening, url?: string) => {
      if (tab && url) {
        tab.opener = null;
        tab.location.href = url;
      } else tab?.close();
      return result;
    };
    if (!this.#stored()) return done('not-admin');
    try {
      const response = await this.#fetch('/api/account');
      if (!response.ok) return done('unreachable');
      const body = (await response.json()) as { admin?: unknown };
      if (body.admin !== true) return done('not-admin');
      const page = await this.#fetch('/admin/connexion', { redirect: 'manual' });
      if (page.status !== 200) return done('out-of-reach');
      return done('opened', `${this.deps.origin}/admin`);
    } catch {
      return done('unreachable');
    }
  }

  /** Waits until everything is sent and received (signing out, tests). */
  async idle(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.#reconciling;
      if (this.#status === 'synced') return true;
      if (this.#status === 'off') return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }
}
