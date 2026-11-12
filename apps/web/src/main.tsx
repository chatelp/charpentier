import { App, createI18n } from '@charpentier/core';
import '@charpentier/core/styles.css';
import { createWebPlatform } from '@charpentier/platform-web';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const i18n = await createI18n('fr');
document.documentElement.lang = i18n.language;

createRoot(container).render(
  <StrictMode>
    <App platform={createWebPlatform()} i18n={i18n} />
  </StrictMode>,
);
