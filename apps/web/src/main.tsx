import { App, createI18n, createSystemFeature } from '@charpentier/core';
import '@charpentier/core/styles.css';
import { createWebPlatform } from '@charpentier/platform-web';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const i18n = await createI18n('fr');

// `?x250`: the device's system, simulated (to see and review it in a browser);
// `?x250=premier`: a device just installed, its first start ahead;
// `?x250=maj`: an update ready, waiting for the next start.
const x250Param = new URLSearchParams(location.search).get('x250');
const x250 =
  x250Param === null
    ? false
    : x250Param === 'premier'
      ? 'first-start'
      : x250Param === 'maj'
        ? 'update'
        : true;
const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
// ⌘ is the app's key on a Mac: Ctrl stands in for Super there.
const features = [createSystemFeature({ modifier: apple ? 'Control' : 'Meta' })];
document.documentElement.lang = i18n.language;

createRoot(container).render(
  <StrictMode>
    <App platform={createWebPlatform({ simulateSystem: x250 })} i18n={i18n} features={features} />
  </StrictMode>,
);
