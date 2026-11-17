/* Maquette des Réglages de l'app (⌘,), DESIGN §4.8 « Réglages » (1.22, D-36, PLAN 7.3).
   À injecter dans l'app ouverte sur la vue des réglages (?x250 puis :reglages, qui fournit
   la vue plein cadre) : window.REGLAGES = { section, x250 } ; section = apparence | ecriture |
   sons | compagnon | synchronisation | bibliotheque | apropos. Sans x250, la ligne système est
   masquée (Mac, web). Les classes sont celles de l'app : ch-settings-*, ch-set-*, ch-keys, ch-btn. */
(() => {
  const opts = window.REGLAGES || {};
  const x250 = !!opts.x250;
  const current = opts.section || 'apparence';

  const css = document.createElement('style');
  css.textContent = `
    .mk-hide { display: none !important; }
    .ch-settings-rail.mk-tool .ch-settings-title { display: flex; align-items: center; gap: 10px; color: var(--ch-ink-2); }
    .mk-medal { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; box-shadow: var(--ch-raise-s); color: var(--ch-ink-2); }
    .mk-medal svg { width: 15px; height: 15px; }
    .mk-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
    .mk-sys-link { display: flex; align-items: baseline; gap: 8px; padding: 7px 10px; border-top: 1px solid var(--ch-shade); box-shadow: 0 -1px 0 var(--ch-highlight); color: var(--ch-ink-2); font: var(--ch-ui-sm) var(--ch-font-ui); }
    .mk-sys-link span:first-child { flex: 1; display: flex; gap: 8px; align-items: center; }
    .mk-sys-link kbd, .mk-hint kbd { color: var(--ch-faint); font: inherit; }
    .mk-hint { color: var(--ch-faint); font: 11px/1.6 var(--ch-font-ui); }
    .mk-step { display: inline-flex; align-items: center; gap: 10px; }
    .mk-step b { min-width: 4.5em; text-align: center; color: var(--ch-ink); font: 400 15px var(--ch-font-text); }
    .mk-step .ch-btn { width: 30px; padding: 4px 0; justify-content: center; }
    .mk-key { font: 13px var(--ch-font-sys); color: var(--ch-ink); }
    .mk-ctl { display: flex; gap: 8px; align-items: center; }
    .ch-set-help kbd { font: inherit; color: var(--ch-faint); }
    .mk-quote { margin: 4px 0 0; color: var(--ch-muted); font: italic 400 14px/1.5 var(--ch-font-text); }
  `;
  document.head.appendChild(css);

  if (!x250) {
    document.querySelectorAll('.ch-sysline, .ch-top-zones, [class*="ch-top-zone"]').forEach((e) => e.classList.add('mk-hide'));
    document.documentElement.style.setProperty('--ch-top-offset', '0px');
    document.documentElement.style.setProperty('--ch-titlebar-offset', '0px');
  }

  const SECTIONS = [
    ['apparence', 'Apparence', 'Système'],
    ['ecriture', 'Écriture', '19 px'],
    ['sons', 'Sons', 'non'],
    ['compagnon', 'Compagnon', 'Opus 5.5'],
    ['synchronisation', 'Synchronisation', 'à jour'],
    ['bibliotheque', 'Bibliothèque', '3 romans'],
    ...(x250 ? [] : [['apropos', 'À propos', '0.1.1']]),
  ];

  const keys = (list, on) =>
    `<span class="ch-keys" role="radiogroup">${list
      .map((o) => `<button type="button" role="radio" aria-checked="${o === on}" class="${o === on ? 'is-on' : ''}">${o}</button>`)
      .join('')}</span>`;
  const row = (label, help, control, chosen = false) =>
    `<div class="ch-set-row${chosen ? ' is-chosen' : ''}"><div class="ch-set-text"><p class="ch-set-label">${label}</p>${help ? `<p class="ch-set-help">${help}</p>` : ''}</div><div class="ch-set-control">${control}</div></div>`;
  const group = (title, rows) => `<section class="ch-set-group"><h4 class="ch-label ch-set-title">${title}</h4>${rows}</section>`;
  const btn = (t, k = '') => `<button type="button" class="ch-btn">${t}${k ? ` <kbd style="color:var(--ch-faint);font:inherit">${k}</kbd>` : ''}</button>`;
  const step = (v) => `<span class="mk-step">${btn('−')}<b>${v}</b>${btn('+')}</span>`;

  const PAGES = {
    apparence: {
      title: 'Apparence',
      intro: 'Le thème, le mouvement, la page. Les mêmes réglages sont à portée de main dans la feuille Aa, en bas à droite.',
      body:
        group('Thème', row('Thème', 'Système suit le réglage de l’appareil, clair le jour, sombre le soir.', keys(['Système', 'Clair', 'Sombre'], 'Système'))) +
        group('Mouvement', row('Réduire les animations', 'Les panneaux et les notes apparaissent sans glisser.', keys(['oui', 'non'], 'non'))) +
        group(
          'La page',
          row('Taille du texte', 'De 15 à 26 px. <kbd>⌘+</kbd> <kbd>⌘−</kbd> partout, <kbd>⌘0</kbd> revient à 19 px.', step('19 px')) +
            row('Largeur de la colonne', 'Environ 66 signes par ligne, la mesure d’un livre.', step('38 rem')),
        ),
    },
    ecriture: {
      title: 'Écriture',
      intro: 'Ce qui aide à rester dans le texte.',
      body:
        group(
          'Pendant la frappe',
          row('Mode focus', 'Tout pâlit, sauf le paragraphe en cours.', keys(['oui', 'non'], 'non')) +
            row('Défilement machine à écrire', 'La ligne en cours reste aux deux cinquièmes de la hauteur.', keys(['oui', 'non'], 'oui')),
        ) +
        group('Atelier', row('Afficher les rejets', 'Les propositions que vous avez écartées restent visibles, estompées.', keys(['oui', 'non'], 'non'))),
    },
    sons: {
      title: 'Sons',
      intro: 'Tous coupés par défaut. Le volume se règle sur l’appareil.',
      body: group(
        'Sons de l’app',
        row('Sons de l’interface', 'Un déclic à l’ouverture d’un panneau, une note quand le Compagnon a fini.', `<span class="mk-ctl">${btn('Écouter')}${keys(['oui', 'non'], 'non')}</span>`) +
          row('Son de frappe', 'Une frappe de machine, très bas.', `<span class="mk-ctl">${btn('Écouter')}${keys(['oui', 'non'], 'non')}</span>`) +
          (x250 ? row('Son d’allumage', 'Une cloche de machine à écrire, à la fin du démarrage.', `<span class="mk-ctl">${btn('Écouter')}${keys(['oui', 'non'], 'non')}</span>`) : ''),
      ),
    },
    compagnon: {
      title: 'Compagnon',
      intro: 'Il lit par-dessus votre épaule avec votre propre clé : vous payez Anthropic directement, à l’usage.',
      body:
        group(
          'Clé d’API',
          row('Clé Anthropic', 'Gardée dans le trousseau de l’appareil ; elle ne part que vers Anthropic.', `<span class="mk-ctl"><span class="mk-key">sk-ant-…4f2a</span>${btn('Changer…')}${btn('Oublier')}</span>`, true),
        ) +
        group(
          'Modèles',
          row(
            'Remarques légères et grammaire',
            'Opus 5.5 partout par défaut. Haiku 5.5 coûte bien moins cher pour les remarques pendant l’écriture ; les analyses et la conversation restent sur Opus.',
            keys(['Opus 5.5', 'Haiku 5.5'], 'Opus 5.5'),
          ),
        ) +
        group('Entretien', row('Façon de mener l’entretien', 'Libre : vous parlez de ce que vous voulez. Dirigé : il suit les modules dans l’ordre.', keys(['Libre', 'Dirigé'], 'Libre'))),
    },
    synchronisation: {
      title: 'Synchronisation',
      intro: 'Vos romans, sur tous vos appareils, par votre serveur.',
      body:
        group(
          'Compte',
          row('pierre@exemple.org', 'sur sync.exemple.org · à jour, il y a 2 min', `<span class="mk-ctl">${btn('Synchroniser maintenant')}</span>`, true) +
            row('Appareils connectés', 'Ce Mac, le X250, le web.', btn('Voir…')) +
            row('Administrer le serveur', 'Comptes, appareils, sauvegardes : la page d’administration.', btn('Ouvrir…')),
        ) + group('Quitter', row('Se déconnecter', 'Vos romans restent sur cet appareil ; ils ne se synchronisent plus.', btn('Se déconnecter'))),
    },
    bibliotheque: {
      title: 'Bibliothèque',
      intro: 'Où vivent vos romans sur cet appareil.',
      body:
        group(
          'Dossier',
          row('~/Documents/Charpentier', 'Un dossier par roman, et une copie en Markdown de chaque scène.', `<span class="mk-ctl">${btn('Changer…')}${btn('Afficher dans le Finder')}</span>`, true),
        ) + group('Corbeille', row('2 romans à la corbeille', 'Rien n’est effacé : ils reviennent quand vous les restaurez.', btn('Ouvrir la corbeille…'))),
    },
    apropos: {
      title: 'À propos',
      intro: '',
      body:
        group('Charpentier', row('Version 0.1.1', 'Installée le 14 novembre 2026.', btn('Nouveautés…'))) +
        group('Polices et logiciels', row('Licences', 'Literata, Inter et JetBrains Mono (SIL OFL 1.1), et les bibliothèques libres de l’app.', btn('Voir…'))),
    },
  };

  const view = document.querySelector('.ch-settings');
  const rail = view.querySelector('.ch-settings-rail');
  rail.className = 'ch-settings-rail ch-tool ch-raised mk-tool';
  const GEAR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
  const SQ = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M3 2h6v13h13v6H3z" fill="currentColor"/><circle cx="17" cy="8" r="3" fill="#e0a040"/></svg>';
  rail.innerHTML = `
    <h2 class="ch-settings-title"><span class="mk-medal">${GEAR}</span>Réglages</h2>
    <ul class="ch-settings-sections" role="listbox">${SECTIONS.map(
      ([id, name, value]) =>
        `<li role="option" class="ch-settings-section" aria-selected="${id === current}"><span class="ch-settings-section-name">${name}</span><span class="ch-settings-section-value">${value}</span></li>`,
    ).join('')}</ul>
    <div class="mk-foot">
      ${x250 ? `<div class="mk-sys-link"><span>${SQ}Réglages du système</span><kbd>⊞,</kbd></div>` : ''}
      <p class="mk-hint">↑↓ choisir · ⏎ ouvrir · Échap revenir au texte</p>
    </div>`;
  const page = view.querySelector('.ch-settings-page');
  const p = PAGES[current];
  page.innerHTML = `<h3 class="ch-settings-page-title">${p.title}</h3>${p.intro ? `<p class="ch-settings-intro">${p.intro}</p>` : ''}${p.body}`;
})();
