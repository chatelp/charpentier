import { BrowserWindow } from 'electron';

/**
 * The server's administration page in a window of the app (phase 4.6), on
 * the Mac and the X250 alike: a window of its own, with its own cookies
 * (`persist:admin`), sandboxed, without the app's preload, that never
 * leaves `<server>/admin` (any other address is refused). Full screen on the
 * X250, closed by Escape there as everywhere in the app. One at a time.
 */
let current: BrowserWindow | null = null;

export function openAdminWindow(url: string, appliance: boolean): void {
  if (current && !current.isDestroyed()) {
    current.show();
    current.focus();
    return;
  }
  const base = new URL(url);
  const allowed = (target: string) => {
    try {
      const next = new URL(target);
      return next.origin === base.origin && next.pathname.startsWith('/admin');
    } catch {
      return false;
    }
  };
  const window = new BrowserWindow({
    width: 1100,
    height: 820,
    fullscreen: appliance,
    autoHideMenuBar: true,
    title: 'Charpentier · administration',
    webPreferences: {
      partition: 'persist:admin',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  current = window;
  window.on('closed', () => {
    if (current === window) current = null;
  });
  const { webContents } = window;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, target) => {
    if (!allowed(target)) event.preventDefault();
  });
  webContents.on('will-redirect', (event, target) => {
    if (!allowed(target)) event.preventDefault();
  });
  webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      window.close();
    }
  });
  void window.loadURL(url);
}
