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

const bridge: DesktopBridge = {
  platform: process.platform,
  // Passed by the main process to this window (webPreferences.additionalArguments).
  appliance: process.argv.includes(APPLIANCE_ARG),
  simulateSystem: process.argv.includes('--charpentier-simulate-system'),
  invoke: (request) => ipcRenderer.invoke(IPC_INVOKE, request),
  send: (message) => ipcRenderer.send(IPC_MESSAGE, message),
  onMessage: (listener) => {
    const handler = (_event: IpcRendererEvent, message: Message) => listener(message);
    ipcRenderer.on(IPC_MESSAGE, handler);
    return () => ipcRenderer.off(IPC_MESSAGE, handler);
  },
};

contextBridge.exposeInMainWorld('charpentier', bridge);
