import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type WebContents } from 'electron';
import os from 'node:os';
import path from 'node:path';
import {
  DocStore,
  documentLocator,
  FolderLibrary,
  PreferencesFile,
  RendererSession,
} from '@charpentier/platform-desktop/main';
import {
  IPC_INVOKE,
  IPC_MESSAGE,
  type Message,
  type Request,
} from '@charpentier/platform-desktop/shared';
import { appMenu } from './menu';

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

function sessionOf(contents: WebContents): RendererSession {
  let session = sessions.get(contents);
  if (!session) {
    const created = new RendererSession({ store, library, preferences }, (message) => {
      if (!contents.isDestroyed()) contents.send(IPC_MESSAGE, message);
    });
    sessions.set(contents, created);
    const dispose = () => {
      created.dispose();
      sessions.delete(contents);
    };
    contents.once('destroyed', dispose);
    // A reload starts a new renderer: its documents are opened again.
    contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) created.dispose();
    });
    session = created;
  }
  return session;
}

ipcMain.handle(IPC_INVOKE, async (event, request: Request) => {
  switch (request.type) {
    case 'host.libraryFolder':
      return libraryFolder;
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
    default:
      return sessionOf(event.sender).handle(request);
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
app.on('will-quit', () => store.closeAll());
