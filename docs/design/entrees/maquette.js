/* Maquette : les points d'entrée du manuscrit et du Compagnon sans les poignées de bord
   (DESIGN §4.8). À injecter dans la page d'écriture : window.ENTREES = { variante, sombre }.
   variante = « entete » (dans l'en-tête, du côté où s'ouvre le panneau) ou « pied » (dans le pied,
   avec les compteurs). Les poignées .ch-edge sont masquées, rien d'autre ne bouge. */
(() => {
  const o = window.ENTREES || {};
  const css = document.createElement('style');
  css.textContent = `
    .ch-edge { display: none !important; }
    .mk-entry { position: absolute; z-index: 4; display: inline-flex; align-items: center; gap: 7px;
      padding: 4px 10px; border: 0; border-radius: var(--ch-radius-sm); background: transparent;
      color: var(--ch-muted); font: 13px var(--ch-font-ui); white-space: nowrap; }
    .mk-entry svg { width: 15px; height: 15px; flex: none; }
    .mk-entry kbd { color: var(--ch-faint); font: 11px var(--ch-font-ui); }
    .mk-entry .mk-count { color: var(--ch-mentor); font-variant-numeric: tabular-nums; }
    .mk-entry.is-hover { color: var(--ch-ink); box-shadow: var(--ch-raise-s); }
    .mk-entry.is-mentor svg { color: var(--ch-mentor); }
    .mk-sep { position: absolute; z-index: 4; width: 1px; height: 14px; background: var(--ch-shade);
      box-shadow: 1px 0 0 var(--ch-highlight); }
  `;
  document.head.appendChild(css);
  const BOOK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5c3-1 6-.8 8 1 2-1.8 5-2 8-1V18c-3-1-6-.8-8 1-2-1.8-5-2-8-1zM12 6.5V19"/></svg>';
  const COMPASS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.7"/><path d="M11.3 6.6 6 20M12.7 6.6 18 20M8.3 14.5h7.4"/></svg>';
  const add = (html, style, cls = '') => {
    const b = document.createElement('button');
    b.className = `mk-entry ${cls}`;
    b.innerHTML = html;
    Object.assign(b.style, style);
    document.body.appendChild(b);
    return b;
  };
  const sep = (style) => {
    const s = document.createElement('span');
    s.className = 'mk-sep';
    Object.assign(s.style, style);
    document.body.appendChild(s);
  };
  const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
  const novel = rect('.ch-novel');
  const modes = rect('.ch-modes');
  const words = document.querySelector('.ch-footer-words');
  const right = document.querySelector('.ch-footer-right');
  const count = o.count ?? 5;

  if (o.variante === 'entete') {
    // À gauche, le roman et son manuscrit ; à droite, le Compagnon puis les deux modes.
    const top = novel.top + 'px';
    sep({ left: novel.right + 8 + 'px', top: novel.top + 6 + 'px' });
    add(
      `${BOOK}Manuscrit<kbd>⌘J</kbd>`,
      { left: novel.right + 16 + 'px', top },
      o.hover === 'm' ? 'is-hover' : '',
    );
    const c = add(
      `${COMPASS}Compagnon${count ? `<span class="mk-count">${count}</span>` : ''}<kbd>⌘L</kbd>`,
      { top: modes.top + 'px' },
      `is-mentor ${o.hover === 'c' ? 'is-hover' : ''}`,
    );
    c.style.left = modes.left - c.offsetWidth - 16 + 'px';
    sep({ left: modes.left - 9 + 'px', top: modes.top + 6 + 'px' });
  } else if (o.variante === 'pied') {
    // Dans le pied : le manuscrit avant les mots, le Compagnon avant « Aa », avec ses remarques.
    const w = words.getBoundingClientRect();
    words.style.paddingLeft = '132px';
    add(`${BOOK}Manuscrit<kbd>⌘J</kbd>`, { left: w.left - 10 + 'px', top: w.top - 6 + 'px' });
    [...right.children].forEach((e) => {
      if (/remarque|Compagnon/.test(e.textContent || '')) e.style.display = 'none';
    });
    const firstShown = [...right.children].find(
      (e) => e.offsetWidth > 0 && getComputedStyle(e).display !== 'none',
    );
    const r = (firstShown || document.querySelector('.ch-display-toggle')).getBoundingClientRect();
    const c = add(
      `${COMPASS}Compagnon${count ? `<span class="mk-count">${count}</span>` : ''}<kbd>⌘L</kbd>`,
      { top: rect('.ch-display-toggle').top + 'px' },
      'is-mentor',
    );
    c.style.left = r.left - c.offsetWidth - 14 + 'px';
  }
})();
