import { App, createI18n, createSystemFeature } from '@charpentier/core';
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
// The system of the X250 (D-24): active only with a System service. Super is its
// key; on the Mac, where ⌘ is the app's, Ctrl stands in for it.
const features = [
  createSystemFeature({ modifier: window.charpentier.platform === 'darwin' ? 'Control' : 'Meta' }),
];
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App platform={createDesktopPlatform(window.charpentier)} i18n={i18n} features={features} />
  </StrictMode>,
);
