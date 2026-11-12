import { App, createI18n } from '@charpentier/core';
import '@charpentier/core/styles.css';
import { createDesktopPlatform, type DesktopBridge } from '@charpentier/platform-desktop/renderer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    readonly charpentier: DesktopBridge;
  }
}

const i18n = await createI18n('fr');
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App platform={createDesktopPlatform(window.charpentier)} i18n={i18n} />
  </StrictMode>,
);
