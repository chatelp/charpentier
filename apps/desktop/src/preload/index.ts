import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC_INVOKE,
  IPC_MESSAGE,
  type DesktopBridge,
  type Message,
} from '@charpentier/platform-desktop/shared';

/**
 * The only door between the interface and the system (contextIsolation,
 * sandbox): typed requests and messages, nothing else.
 */
const APPLIANCE_ARG = '--charpentier-appliance';
/** The app's version and commit, given by the main process the same way. */
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--charpentier-${name}=`))?.split('=')[1];
const version = arg('version');
const commit = arg('commit');

const bridge: DesktopBridge = {
  platform: process.platform,
  // Passed by the main process to this window (webPreferences.additionalArguments).
  appliance: process.argv.includes(APPLIANCE_ARG),
  ...(version && { about: { version, ...(commit && { commit }) } }),
  invoke: (request) => ipcRenderer.invoke(IPC_INVOKE, request),
  send: (message) => ipcRenderer.send(IPC_MESSAGE, message),
  onMessage: (listener) => {
    const handler = (_event: IpcRendererEvent, message: Message) => listener(message);
    ipcRenderer.on(IPC_MESSAGE, handler);
    return () => ipcRenderer.off(IPC_MESSAGE, handler);
  },
};

contextBridge.exposeInMainWorld('charpentier', bridge);
