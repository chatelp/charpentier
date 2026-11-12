import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  safeStorage,
  shell,
  type WebContents,
} from 'electron';
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
  SpellClient,
  type MirrorStrings,
} from '@charpentier/platform-desktop/main';
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
      { store, library, preferences, spell, agents },
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
      if (process.platform === 'darwin')
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
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#e3e7ed',
    webPreferences: {
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

void app.whenReady().then(() => {
  Menu.setApplicationMenu(appMenu());
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
  for (const mirror of mirrors.values()) mirror.stop();
  mirrors.clear();
  store.closeAll();
  void spell.close();
});
