import { App, createI18n, createSystemFeature } from '@charpentier/core';
import '@charpentier/core/styles.css';
import { createWebPlatform } from '@charpentier/platform-web';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const i18n = await createI18n('fr');

// `?x250`: the device's system, simulated (to see and review it in a browser).
const x250 = new URLSearchParams(location.search).has('x250');
const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
// ⌘ is the app's key on a Mac: Ctrl stands in for Super there.
const features = [createSystemFeature({ modifier: apple ? 'Control' : 'Meta' })];
document.documentElement.lang = i18n.language;

createRoot(container).render(
  <StrictMode>
    <App platform={createWebPlatform({ simulateSystem: x250 })} i18n={i18n} features={features} />
  </StrictMode>,
);
