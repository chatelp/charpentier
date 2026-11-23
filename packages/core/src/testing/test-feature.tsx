import type { Feature } from '../features/feature';

/**
 * A feature that uses every contribution point (docs/PLAN.md phase 5.1), for
 * the tests: what it brings must appear without touching the core, and
 * nothing of it must remain once it is gone.
 */
export const probeFeature: Feature = {
  id: 'probe',
  texts: {
    fr: {
      commands: {
        probePing: 'Sonder la machine',
        probeOpenView: 'Ouvrir la vue de la sonde',
        probeSettings: 'Réglages de la sonde',
      },
      probe: {
        menu: 'Sonde',
        section: 'Sonde',
        otherSection: 'Autre sonde',
        view: 'Vue de la sonde',
        prefix: 'Sonde',
      },
    },
  },
  commands: [
    { id: 'probePing', scope: 'global', run: (ctx) => ctx.notify('sonde : ping') },
    { id: 'probeOpenView', scope: 'global', run: (ctx) => ctx.openView('probe') },
    // The machine's settings: their own view (D-36), apart from the app's.
    {
      id: 'probeSettings',
      scope: 'global',
      keybinding: 'Mod-Alt-Shift-,',
      run: (ctx) => ctx.openSystemSettings(),
    },
  ],
  menu: [{ menu: 'probe', label: 'probe.menu', items: ['probePing', '-', 'probeOpenView'] }],
  topZone: {
    height: 24,
    component: ({ ctx }) => (
      <div role="region" aria-label="Bande de la sonde">
        {ctx ? `projet ${ctx.view}` : 'bibliothèque'}
      </div>
    ),
  },
  footer: [{ id: 'probeState', component: () => <span>sonde ok</span> }],
  settings: [
    {
      id: 'probe',
      label: 'probe.section',
      value: () => <>42</>,
      component: () => <button type="button">Régler la sonde</button>,
    },
    { id: 'probeOther', label: 'probe.otherSection', component: () => <p>Rien ici</p> },
  ],
  views: [
    {
      id: 'probe',
      label: 'probe.view',
      component: ({ onClose }) => (
        <button type="button" onClick={onClose}>
          Fermer la sonde
        </button>
      ),
    },
  ],
  prefixes: [
    {
      prefix: '!',
      label: 'probe.prefix',
      search: (_ctx, query) => [{ id: 'echo', label: `écho ${query.trim()}` }],
      onPick: (ctx, _id, query) => ctx.notify(`écho ${query.trim()}`),
    },
  ],
};
