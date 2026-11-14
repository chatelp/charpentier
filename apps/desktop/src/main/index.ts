import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  powerMonitor,
  safeStorage,
  shell,
  type WebContents,
} from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DocStore,
  documentLocator,
  FolderLibrary,
  PreferencesFile,
  ProjectMirror,
  AgentHost,
  AnthropicLlmService,
  API_KEY_SECRET,
  HAIKU,
  OPUS,
  RendererSession,
  SecretStore,
  SyncEngine,
  type SyncAccount,
  SpellClient,
  type MirrorStrings,
  createLinuxSystem,
  type LinuxSystem,
  exportTexts,
  nodeTools,
} from '@charpentier/platform-desktop/main';
import {
  createSimulatedSystem,
  type AppProcessKind,
  type PrintJob,
  type SystemService,
} from '@charpentier/platform';
import {
  IPC_INVOKE,
  IPC_MESSAGE,
  type Message,
  type Request,
} from '@charpentier/platform-desktop/shared';
import { appMenu, commandMenu } from './menu';
import spellWorkerPath from '@charpentier/platform-desktop/main/spell-worker?modulePath';

/** The library folder: `CHARPENTIER_LIBRARY` (tests), the saved choice, or ~/Documents/Charpentier. */
const LIBRARY_PREF = 'desktop.libraryFolder';

if (process.env['CHARPENTIER_USER_DATA'])
  app.setPath('userData', process.env['CHARPENTIER_USER_DATA']);

if (!app.requestSingleInstanceLock()) app.quit();

/**
 * `--appliance` (docs/PLAN.md phase 5.2): the app is the whole screen of a
 * writing device (the X250): full screen, no frame, no menu bar.
 */
const appliance = process.argv.includes('--appliance');
/** `--simulate-system`: the X250's system simulated, to develop it on the Mac (phase 5.3). */
const simulateSystem = process.argv.includes('--simulate-system');

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The manuscript's page (docs/DESIGN.md §4.12): A4, margins of 2.5 cm, the
 * running title and the folio at the top right.
 */
function printOptions(title: string): Electron.PrintToPDFOptions {
  const cm = 1 / 2.54;
  return {
    pageSize: 'A4',
    printBackground: false,
    margins: { top: 2.5 * cm, bottom: 2.5 * cm, left: 2.5 * cm, right: 2.5 * cm },
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;margin:0 2.5cm;text-align:right;font:9pt Georgia,serif;color:#555">${escapeHtml(title)} · <span class="pageNumber"></span></div>`,
    footerTemplate: '<div></div>',
  };
}

const PROCESS_KINDS: Partial<Record<string, AppProcessKind>> = {
  Browser: 'main',
  Tab: 'interface',
  GPU: 'graphics',
};

function installedKeyboard(): 'azerty' | 'bepo' | 'qwerty' | undefined {
  try {
    const value = fs.readFileSync('/etc/charpentier/keyboard', 'utf8').trim();
    return value === 'azerty' || value === 'bepo' || value === 'qwerty' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The device's system (docs/PLAN.md phase 5.4): the X250's on Linux as a
 * device, a simulated one on request, none otherwise.
 */
function deviceSystem(): (SystemService & { dispose?(): void }) | null {
  if (simulateSystem) return createSimulatedSystem();
  if (process.platform !== 'linux' || !appliance) return null;
  const linux = createLinuxSystem({
    tools: nodeTools(),
    appVersion: app.getVersion(),
    hostname: os.hostname(),
    settingsFile: path.join(app.getPath('userData'), 'system.json'),
    // The keyboard chosen at installation (charpentier-os, hosts/x250).
    keyboard: installedKeyboard(),
    // The USB key's copy: every project, in Markdown.
    exportTexts: (folder) => exportTexts(store, library, folder, mirrorStrings),
    // The monitor's « charpentier » dial: Electron's processes (the speller is a
    // thread of the main one) and the documents held.
    app: () => ({
      processes: app.getAppMetrics().flatMap((p) => {
        const kind = PROCESS_KINDS[p.type];
        return kind
          ? [
              {
                kind,
                cpu: Math.round(p.cpu.percentCPUUsage),
                memory: p.memory.workingSetSize * 1024,
              },
            ]
          : [];
      }),
      documents: store.openGuids().length,
    }),
  });
  void linux.start();
  // Waking up (lid opened): everything may have changed meanwhile.
  // With a code, it locks before sleeping, so nothing shows at waking (phase 5.6).
  void app.whenReady().then(() => {
    powerMonitor.on('suspend', () => linux.sleeping());
    powerMonitor.on('resume', () => void linux.woke());
  });
  return linux;
}

const preferences = new PreferencesFile(path.join(app.getPath('userData'), 'preferences.json'));
const libraryFolder =
  process.env['CHARPENTIER_LIBRARY'] ??
  (preferences.get(LIBRARY_PREF) as string | undefined) ??
  path.join(app.getPath('documents') || path.join(os.homedir(), 'Documents'), 'Charpentier');
const library = new FolderLibrary(libraryFolder);
const store = new DocStore(documentLocator(library));
const sessions = new Map<WebContents, RendererSession>();

// Hunspell French dictionary (MPL 2.0, resources/dictionaries/fr), loaded in a worker on first use.
const dictionaryDir = app.isPackaged
  ? path.join(process.resourcesPath, 'dictionaries', 'fr')
  : path.join(app.getAppPath(), 'resources', 'dictionaries', 'fr');
const spell = new SpellClient(spellWorkerPath, {
  aff: path.join(dictionaryDir, 'fr.aff'),
  dic: path.join(dictionaryDir, 'fr.dic'),
});

// ─── Markdown mirror: runs while a window has the project open (docs/SPEC.md §17) ───

// The main process has no i18n catalogue yet: the two texts it writes into a project.
const mirrorStrings: MirrorStrings = {
  externalVariant: (date) =>
    `Modif. externe du ${new Intl.DateTimeFormat('fr', { dateStyle: 'short', timeStyle: 'short' }).format(date)}`,
  externalSignal: (name) =>
    `Le fichier de cette scène a été modifié hors de l’app au même endroit que le texte : sa version est conservée dans la variante « ${name} ».`,
};
const system = deviceSystem();
const mirrors = new Map<string, ProjectMirror>();

// ─── The Compagnon (step 3): the author's key in the keychain, Claude via the official SDK ───

/** D-20: Opus 5.5 everywhere; Haiku 5.5 for light remarks only if the author chose it. */
const LIGHT_MODEL_PREF = 'mentor.lightModel';
const secrets = new SecretStore(path.join(app.getPath('userData'), 'secrets.json'), safeStorage);
const llm = new AnthropicLlmService({
  apiKey: () => process.env['CHARPENTIER_ANTHROPIC_API_KEY'] ?? secrets.get(API_KEY_SECRET),
  models: () => ({
    deep: OPUS,
    fast: preferences.get(LIGHT_MODEL_PREF) === 'haiku' ? HAIKU : OPUS,
  }),
});
const agents = new AgentHost(llm, secrets, store, {
  get: () => (preferences.get(LIGHT_MODEL_PREF) === 'haiku' ? 'haiku' : 'opus'),
  set: (model) => preferences.set(LIGHT_MODEL_PREF, model),
});
// ─── Sync with the author's server (step 4.3); signing in comes with phase 4.4 ───

const SYNC_ACCOUNT_SECRET = 'sync.account';
const sync = new SyncEngine({
  store,
  library,
  credentials: {
    load: () => {
      const stored = secrets.get(SYNC_ACCOUNT_SECRET);
      if (!stored) return null;
      try {
        return JSON.parse(stored) as SyncAccount;
      } catch {
        return null;
      }
    },
    save: (account) => {
      if (account) return secrets.set(SYNC_ACCOUNT_SECRET, JSON.stringify(account));
      secrets.delete(SYNC_ACCOUNT_SECRET);
      return true;
    },
  },
  stateDir: path.join(app.getPath('userData'), 'sync'),
  device: os.hostname(),
});
// Projects that came from another device get their Markdown mirror too; every window hears the status.
sync.onStatusChange((status) => {
  syncMirrors();
  for (const contents of sessions.keys())
    if (!contents.isDestroyed()) contents.send(IPC_MESSAGE, { type: 'sync.status', status });
});

llm.onStatusChange((status) => {
  for (const contents of sessions.keys())
    if (!contents.isDestroyed()) contents.send(IPC_MESSAGE, { type: 'agents.status', status });
});
// The network comes and goes: the Compagnon says so discreetly, writing goes on.
setInterval(() => llm.setOnline(net.isOnline()), 15_000).unref();

/** Starts the mirror of every project a window holds, stops the others. */
function syncMirrors() {
  const wanted = new Set<string>();
  for (const guid of store.openGuids()) {
    const projectId = /^project:([^/]+)$/.exec(guid)?.[1];
    if (!projectId) continue;
    const others = [...store.holders(guid)].filter((h) => !(h instanceof ProjectMirror));
    if (others.length > 0) wanted.add(projectId);
  }
  for (const [projectId, mirror] of mirrors) {
    if (wanted.has(projectId)) continue;
    mirror.stop();
    mirrors.delete(projectId);
  }
  for (const projectId of wanted) {
    if (mirrors.has(projectId)) continue;
    const folder = library.folderOf(projectId);
    if (!folder) continue;
    const mirror = new ProjectMirror(store, projectId, folder, {
      strings: mirrorStrings,
      watch: true,
    });
    mirrors.set(projectId, mirror);
    mirror.start();
  }
}

function sessionOf(contents: WebContents): RendererSession {
  let session = sessions.get(contents);
  if (!session) {
    const created = new RendererSession(
      {
        store,
        library,
        preferences,
        spell,
        agents,
        onLibraryChange: () => void sync.reconcile(),
        sync,
        system,
      },
      (message) => {
        if (!contents.isDestroyed()) contents.send(IPC_MESSAGE, message);
      },
    );
    sessions.set(contents, created);
    const dispose = () => {
      created.dispose();
      sessions.delete(contents);
      syncMirrors();
    };
    contents.once('destroyed', dispose);
    // A reload starts a new renderer: its documents are opened again.
    contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        created.dispose();
        syncMirrors();
      }
    });
    session = created;
  }
  return session;
}

ipcMain.handle(IPC_INVOKE, async (event, request: Request) => {
  switch (request.type) {
    case 'host.libraryFolder':
      return libraryFolder;
    case 'host.setMenu':
      // The menu bar is macOS's; elsewhere the command zone stands in for it.
      if (process.platform === 'darwin' && !appliance)
        Menu.setApplicationMenu(
          commandMenu(request.model, (id) =>
            (
              BrowserWindow.getFocusedWindow() ?? BrowserWindow.fromWebContents(event.sender)
            )?.webContents.send(IPC_MESSAGE, {
              type: 'host.menuCommand',
              id,
            } satisfies Message),
          ),
        );
      return null;
    case 'system.call':
      // Printing (phase 5.7): the window's print page as a PDF, then CUPS.
      if (request.method === 'print' && system && 'printPdf' in system) {
        const job = request.args[0] as PrintJob;
        const pdf = await event.sender.printToPDF(printOptions(job.title));
        return (system as LinuxSystem).printPdf(pdf, job);
      }
      return sessionOf(event.sender).handle(request);
    case 'host.revealLibraryFolder':
      await shell.openPath(libraryFolder);
      return null;
    case 'host.chooseLibraryFolder': {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: libraryFolder,
        properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const chosen = result.filePaths[0];
      if (result.canceled || !chosen || chosen === libraryFolder) return false;
      preferences.set(LIBRARY_PREF, chosen);
      // Documents are compacted on quit; the app starts again on the new folder.
      app.relaunch();
      app.quit();
      return true;
    }
    default: {
      const response = await sessionOf(event.sender).handle(request);
      if (request.type === 'doc.open' || request.type === 'doc.close') syncMirrors();
      return response;
    }
  }
});
ipcMain.on(IPC_MESSAGE, (event, message: Message) => sessionOf(event.sender).receive(message));

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    ...(appliance
      ? { kiosk: true, fullscreen: true, frame: false, autoHideMenuBar: true }
      : { titleBarStyle: 'hiddenInset' as const }),
    backgroundColor: '#e3e7ed',
    webPreferences: {
      additionalArguments: [...(appliance ? ['--charpentier-appliance'] : [])],
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  // docs/DESIGN.md §4.1: no title bar in full screen.
  const sendFullScreen = () =>
    window.webContents.send(IPC_MESSAGE, {
      type: 'host.fullScreen',
      fullScreen: window.isFullScreen(),
    } satisfies Message);
  window.on('enter-full-screen', sendFullScreen);
  window.on('leave-full-screen', sendFullScreen);
  window.webContents.on('did-finish-load', sendFullScreen);
  // Links never open inside the app; nothing navigates away from it.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) void window.loadURL(devServer);
  else void window.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
}

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

/**
 * Secrets without a keychain (D-25): the X250 has none (its session opens
 * by itself, a keychain there would be open all the time), so its secrets
 * are kept like its texts, on the disk LUKS encrypts. Elsewhere on Linux
 * without a keychain, nothing is kept (the app says so), but for the
 * end-to-end tests (CHARPENTIER_TEST_PLAIN_SECRETS).
 */
function secretsWithoutKeychain() {
  if (process.platform !== 'linux' || safeStorage.isEncryptionAvailable()) return;
  if (appliance || process.env['CHARPENTIER_TEST_PLAIN_SECRETS'] === '1')
    safeStorage.setUsePlainTextEncryption(true);
}

void app.whenReady().then(() => {
  secretsWithoutKeychain();
  // A device has no menu bar (on the Mac, the hidden one keeps ⌘Q for development).
  Menu.setApplicationMenu(appliance && process.platform !== 'darwin' ? null : appMenu());
  sync.start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Every document is compacted on the way out (the journal already holds everything).
app.on('will-quit', () => {
  sync.stop();
  system?.dispose?.();
  for (const mirror of mirrors.values()) mirror.stop();
  mirrors.clear();
  store.closeAll();
  void spell.close();
});
