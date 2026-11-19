import fs from 'node:fs';
import path from 'node:path';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { SignInResult, SyncDevice, SyncStatus } from '@charpentier/platform';
import { guids, isPristineProject, listAllScenes, names } from '@charpentier/schema';
import * as Y from 'yjs';
import { DocFile } from './doc-file';
import type { DocStore } from './doc-store';
import type { FolderLibrary, ProjectRecord } from './projects';

/** The account a device is signed in to (D-21); the token is kept by `safeStorage`. */
export interface SyncAccount {
  /** The server's address, as the author typed it (`https://…`). */
  readonly server: string;
  readonly email: string;
  readonly userId: string;
  readonly token: string;
}

export interface SyncCredentials {
  load(): SyncAccount | null;
  /** False when it could not be kept (no keychain): the device stays signed out. */
  save(account: SyncAccount | null): boolean;
}

/** The account's library: one entry per project, last change wins. */
const PROJECTS = 'projects';

const wsUrl = (server: string) => server.replace(/\/+$/, '').replace(/^http/, 'ws');
const httpUrl = (server: string) => server.replace(/\/+$/, '');

/**
 * The sync of the desktop app (step 4.3, docs/PLAN.md): the documents of the
 * main process (DocStore) are relayed to the server by one Hocuspocus
 * provider each, over one WebSocket. The local journal stays the device's
 * persistence: writing never waits for the network, and edits made offline
 * merge when the connection comes back (Yjs). The account's library
 * (`library:<userId>`) tells each device the projects to fetch.
 */
export class SyncEngine {
  #account: SyncAccount | null = null;
  #socket: HocuspocusProviderWebsocket | null = null;
  readonly #providers = new Map<string, HocuspocusProvider>();
  #libraryDoc: Y.Doc | null = null;
  #libraryFile: DocFile | null = null;
  #status: SyncStatus = 'off';
  #connected = false;
  /** The account's library heard from the server at least once since starting. */
  #librarySynced = false;
  /** This device's untouched starters, kept off an account that has projects. */
  readonly #withheld = new Set<string>();
  readonly #listeners = new Set<(status: SyncStatus) => void>();
  readonly #stopObservers: (() => void)[] = [];

  constructor(
    private readonly deps: {
      readonly store: DocStore;
      readonly library: FolderLibrary;
      readonly credentials: SyncCredentials;
      /** Where the account's library is kept on this device. */
      readonly stateDir: string;
      /** Name of this device, shown in the account's list of devices. */
      readonly device: string;
      /** For Node without a global WebSocket (tests). */
      readonly WebSocket?: unknown;
      readonly fetch?: typeof fetch;
    },
  ) {}

  status(): SyncStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  account(): Omit<SyncAccount, 'token'> | null {
    const account = this.deps.credentials.load();
    return account
      ? { server: account.server, email: account.email, userId: account.userId }
      : null;
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
    const pending = [...this.#providers.values()].some((p) => !p.isSynced || p.hasUnsyncedChanges);
    this.#setStatus(pending ? 'syncing' : 'synced');
  }

  /** Signs this device in and starts syncing. */
  async signIn(server: string, email: string, password: string): Promise<SignInResult> {
    const fetchImpl = this.deps.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${httpUrl(server)}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, device: this.deps.device }),
      });
    } catch {
      return 'unreachable';
    }
    if (response.status === 401) return 'invalid';
    if (response.status === 429) return 'too-many-attempts';
    if (!response.ok) return 'unreachable';
    const body = (await response.json()) as { token?: unknown; userId?: unknown };
    if (typeof body.token !== 'string' || typeof body.userId !== 'string') return 'unreachable';
    this.stop();
    const kept = this.deps.credentials.save({
      server: httpUrl(server),
      email: email.trim(),
      userId: body.userId,
      token: body.token,
    });
    this.start();
    // Said, not hidden: without a keychain the sync would stay off in silence.
    return kept ? 'ok' : 'no-keychain';
  }

  /** Signs this device out: the sync stops, the projects stay on the device. */
  async signOut(): Promise<void> {
    const account = this.deps.credentials.load();
    this.stop();
    this.deps.credentials.save(null);
    this.#setStatus('off');
    if (!account) return;
    try {
      await (this.deps.fetch ?? fetch)(`${account.server}/api/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.token}` },
      });
    } catch {
      // Offline: the session stays valid on the server until revoked from another device.
    }
  }

  /** Starts syncing if the device is signed in. */
  start(): void {
    if (this.#socket) return;
    const account = this.deps.credentials.load();
    this.#account = account;
    if (!account) return this.#setStatus('off');
    this.#setStatus('connecting');

    // The account's library, kept on the device too.
    const libraryDoc = new Y.Doc({ guid: `library:${account.userId}` });
    const dir = path.join(this.deps.stateDir, `library-${account.userId}`);
    fs.mkdirSync(dir, { recursive: true });
    const file = new DocFile(dir);
    file.load(libraryDoc, this);
    libraryDoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== this) file.append(update);
    });
    this.#libraryDoc = libraryDoc;
    this.#libraryFile = file;

    const socket = new HocuspocusProviderWebsocket({
      url: wsUrl(account.server),
      ...(this.deps.WebSocket !== undefined && { WebSocketPolyfill: this.deps.WebSocket }),
    });
    socket.on('status', ({ status }: { status: string }) => {
      this.#connected = status === 'connected';
      this.#refreshStatus();
    });
    this.#socket = socket;

    const libraryProvider = this.#provide(libraryDoc.guid, libraryDoc);
    libraryProvider.on('synced', () => {
      this.#librarySynced = true;
      void this.reconcile();
    });
    const projects = libraryDoc.getMap(PROJECTS);
    const onRemote = (_event: unknown, transaction: Y.Transaction) => {
      if (transaction.origin !== null && !transaction.local) void this.reconcile();
    };
    projects.observe(onRemote);
    this.#stopObservers.push(() => projects.unobserve(onRemote));
    void this.reconcile();
  }

  /** Stops syncing (quitting, signing out); what was written stays on the device. */
  stop(): void {
    for (const stop of this.#stopObservers.splice(0)) stop();
    for (const [guid, provider] of this.#providers) {
      provider.destroy();
      if (!guid.startsWith('library:')) this.deps.store.release(guid, this);
    }
    this.#providers.clear();
    this.#socket?.destroy();
    this.#socket = null;
    this.#connected = false;
    if (this.#libraryDoc && this.#libraryFile) this.#libraryFile.close(this.#libraryDoc);
    this.#libraryDoc?.destroy();
    this.#libraryDoc = null;
    this.#libraryFile = null;
    this.#account = null;
    this.#librarySynced = false;
    this.#withheld.clear();
    if (this.#status !== 'unauthorized') this.#setStatus('off');
  }

  #provide(guid: string, doc: Y.Doc): HocuspocusProvider {
    const existing = this.#providers.get(guid);
    if (existing) return existing;
    const socket = this.#socket;
    const account = this.#account;
    if (!socket || !account) throw new Error('Sync is not started');
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: guid,
      document: doc,
      token: account.token,
      // No presence shared between devices: a writer works alone.
      awareness: null,
    });
    provider.on('synced', () => this.#refreshStatus());
    provider.on('unsyncedChanges', () => this.#refreshStatus());
    provider.on('authenticationFailed', () => {
      // A refused library or project: the session is no longer valid.
      this.#setStatus('unauthorized');
    });
    provider.attach();
    this.#providers.set(guid, provider);
    return provider;
  }

  /** A project this device made at its first start, still untouched (not for the account). */
  #pristine(projectId: string): boolean {
    const { store } = this.deps;
    const held: string[] = [];
    const doc = (guid: string) => {
      held.push(guid);
      return store.acquire(guid, this);
    };
    try {
      const root = doc(guids.project(projectId));
      const scenes = new Map(
        listAllScenes(root).map((s) => [s.id, doc(guids.scene(projectId, s.id))] as const),
      );
      return isPristineProject({ root, mentor: doc(guids.mentor(projectId)), scenes });
    } finally {
      for (const guid of held) if (!this.#providers.has(guid)) store.release(guid, this);
    }
  }

  /** The device's projects kept off the account (untouched starters). */
  withheld(): readonly string[] {
    return [...this.#withheld];
  }

  /** Syncs a project's documents: root, mentor, and each scene with its history. */
  #syncProject(projectId: string) {
    const rootGuid = guids.project(projectId);
    if (this.#providers.has(rootGuid)) return;
    const { store } = this.deps;
    const root = store.acquire(rootGuid, this);
    this.#provide(rootGuid, root);
    this.#provide(guids.mentor(projectId), store.acquire(guids.mentor(projectId), this));
    const scenes = root.getMap(names.scenes);
    const provideScene = (sceneId: string) => {
      for (const guid of [guids.scene(projectId, sceneId), guids.sceneHistory(projectId, sceneId)])
        if (!this.#providers.has(guid)) this.#provide(guid, store.acquire(guid, this));
    };
    for (const sceneId of scenes.keys()) provideScene(sceneId);
    const onScenes = (event: Y.YMapEvent<unknown>) => {
      for (const key of event.keysChanged) if (scenes.has(key)) provideScene(key);
    };
    scenes.observe(onScenes);
    this.#stopObservers.push(() => scenes.unobserve(onScenes));
  }

  #reconciling: Promise<void> | null = null;

  /**
   * Brings the device's library and the account's together: a project
   * changed here goes to the account, a project changed or created elsewhere
   * comes here (with exactly its dates, so that it is not sent back), and
   * every project is synced. Call it when the local library changes.
   */
  reconcile(): Promise<void> {
    const run = async () => {
      const libraryDoc = this.#libraryDoc;
      if (!libraryDoc) return;
      const projects = libraryDoc.getMap<ProjectRecord>(PROJECTS);
      // Nothing goes to the account before its library is heard: an empty
      // copy on the device would look like an account without projects.
      if (!this.#librarySynced) return;
      const local = new Map((await this.deps.library.all()).map((p) => [p.id, p]));
      // Each part by its own date: the dates by the latest, the title by its
      // own (an opening moves `updatedAt`, never the title), the trash by its
      // own (a project restored here must not be trashed again by the account).
      const trashDate = (p: ProjectRecord) => p.trashAt ?? p.trashedAt ?? '';
      const merged = (a: ProjectRecord, b: ProjectRecord | undefined): ProjectRecord => {
        if (!b) return a;
        const latest = a.updatedAt >= b.updatedAt ? a : b;
        const titled = (a.titleAt ?? a.createdAt) >= (b.titleAt ?? b.createdAt) ? a : b;
        // The trash by the date it was last entered or left; at the same date, the trash keeps it.
        const trashed =
          trashDate(a) === trashDate(b)
            ? a.trashedAt
              ? a
              : b
            : trashDate(a) > trashDate(b)
              ? a
              : b;
        return {
          id: latest.id,
          kind: latest.kind,
          createdAt: latest.createdAt,
          updatedAt: latest.updatedAt,
          title: titled.title,
          ...(titled.titleAt && { titleAt: titled.titleAt }),
          ...(trashed.trashedAt && { trashedAt: trashed.trashedAt }),
          ...(trashed.trashAt && { trashAt: trashed.trashAt }),
        };
      };
      const same = (a: ProjectRecord, b: ProjectRecord | undefined) =>
        !!b &&
        a.title === b.title &&
        a.updatedAt === b.updatedAt &&
        (a.titleAt ?? '') === (b.titleAt ?? '') &&
        (a.trashedAt ?? '') === (b.trashedAt ?? '') &&
        (a.trashAt ?? '') === (b.trashAt ?? '');
      const newer = (a: ProjectRecord, b: ProjectRecord | undefined) => !same(merged(a, b), b);
      const accountHasProjects = [...projects.values()].some((p) => !p.trashedAt);
      this.#withheld.clear();
      for (const record of local.values())
        if (!projects.has(record.id) && accountHasProjects && this.#pristine(record.id))
          this.#withheld.add(record.id);
      libraryDoc.transact(() => {
        for (const record of local.values())
          if (!this.#withheld.has(record.id) && newer(record, projects.get(record.id)))
            projects.set(record.id, { ...merged(record, projects.get(record.id)) });
      });
      for (const [id, remote] of projects)
        if (newer(remote, local.get(id)))
          await this.deps.library.adopt(merged(remote, local.get(id)));
      if (this.#libraryDoc !== libraryDoc) return;
      for (const id of new Set([...local.keys(), ...projects.keys()]))
        if (!this.#withheld.has(id)) this.#syncProject(id);
      this.#refreshStatus();
    };
    // One at a time: a reconcile asked meanwhile runs after.
    const previous = this.#reconciling ?? Promise.resolve();
    const next = previous.then(run, run);
    this.#reconciling = next.finally(() => {
      if (this.#reconciling === next) this.#reconciling = null;
    });
    return next;
  }

  /** The devices signed in to the account, or null when the server cannot be reached. */
  async devices(): Promise<SyncDevice[] | null> {
    const account = this.deps.credentials.load();
    if (!account) return [];
    try {
      const response = await (this.deps.fetch ?? fetch)(`${account.server}/api/devices`, {
        headers: { Authorization: `Bearer ${account.token}` },
      });
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

  /** Signs another device of the account out. */
  async revokeDevice(id: string): Promise<boolean> {
    const account = this.deps.credentials.load();
    if (!account) return false;
    try {
      const response = await (this.deps.fetch ?? fetch)(
        `${account.server}/api/devices/${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${account.token}` } },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * The administration page, when the account administers the server and
   * the page answers from here (the server hides it elsewhere: 404).
   */
  async adminPage(): Promise<
    { readonly url: string } | { readonly refused: 'not-admin' | 'out-of-reach' | 'unreachable' }
  > {
    const account = this.deps.credentials.load();
    if (!account) return { refused: 'not-admin' };
    const fetchImpl = this.deps.fetch ?? fetch;
    try {
      const response = await fetchImpl(`${account.server}/api/account`, {
        headers: { Authorization: `Bearer ${account.token}` },
      });
      if (!response.ok) return { refused: 'unreachable' };
      const body = (await response.json()) as { admin?: unknown };
      if (body.admin !== true) return { refused: 'not-admin' };
      const page = await fetchImpl(`${account.server}/admin/connexion`, { redirect: 'manual' });
      return page.status === 200 ? { url: `${account.server}/admin` } : { refused: 'out-of-reach' };
    } catch {
      return { refused: 'unreachable' };
    }
  }

  /** Waits until everything is sent and received (tests, quitting). */
  async idle(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.#reconciling;
      if (this.#status === 'synced') return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }
}
