// Mock (DESIGN §4.8 « Le titre du roman », 1.19): the novel's title as a visible entry point,
// top left of the writing page, and the sheet it opens: rename, the other novels, the library.
// Injected into the real app, whose project is first renamed « Avant Nantes ».
// window.ROMAN = { screen: 'repos' | 'mac' | 'feuille' | 'renommer' | 'ensemble' | 'tiroir' | 'x250' }.
// Working versions of the novel (1.20, rendered in docs/design/versions/): 'versions' |
// 'nouvelle-version' | 'en-version' | 'tiroir-version'.
(() => {
  const S = Object.assign({ screen: 'repos' }, window.ROMAN);
  const TITLE = 'Avant Nantes';
  const css = `
  .mk-hide{display:none!important}
  .mk-title{position:absolute;left:14px;top:11px;z-index:30;display:inline-flex;align-items:baseline;gap:7px;max-width:16rem;padding:4px 10px;border:0;border-radius:var(--ch-radius-sm);background:transparent;color:var(--ch-muted);font:400 14px/1.3 var(--ch-font-text);cursor:pointer;white-space:nowrap}
  .mk-title span{overflow:hidden;text-overflow:ellipsis}
  .mk-title i{font-style:normal;color:var(--ch-faint);font:11px var(--ch-font-ui)}
  .mk-title:hover,.mk-title.is-open{color:var(--ch-ink);box-shadow:var(--ch-raise-s)}
  .mk-title.is-open{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-mac .mk-title{left:84px;top:11px}
  .mk-lights{position:fixed;left:14px;top:14px;z-index:40;display:flex;gap:8px}
  .mk-lights i{width:12px;height:12px;border-radius:50%;background:#ec6a5e;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15)}
  .mk-lights i:nth-child(2){background:#f4bf4f}.mk-lights i:nth-child(3){background:#61c554}
  .mk-sheet{position:absolute;left:14px;top:44px;z-index:31;width:21rem;padding:14px 16px 12px;border-radius:var(--ch-radius-lg,14px);background:var(--ch-bg);box-shadow:var(--ch-raise);font:12.5px/1.45 var(--ch-font-ui);color:var(--ch-ink-2);animation:ch-rise var(--ch-dur-note) var(--ch-ease) both}
  .mk-mac .mk-sheet{left:84px}
  .mk-sheet-head{display:flex;align-items:flex-start;gap:8px}
  .mk-sheet-head h2{flex:1;margin:0;color:var(--ch-ink);font:400 21px/1.25 var(--ch-font-text)}
  .mk-sheet-head .ch-btn{padding:3px 8px;font-size:12px;color:var(--ch-ink-2)}
  .mk-sheet kbd{margin-left:4px;color:var(--ch-faint);font:inherit}
  .mk-x{flex:none;display:grid;place-items:center;width:26px;height:26px;margin:-3px -6px 0 0;border:0;border-radius:50%;background:transparent;color:var(--ch-faint)}
  .mk-stats{margin:3px 0 0;color:var(--ch-muted);font-size:12px}
  .mk-rename{display:flex;flex-direction:column;gap:7px}
  .mk-rename input{width:100%;box-sizing:border-box;border:0;border-radius:var(--ch-radius-sm);padding:6px 10px;background:var(--ch-bg);box-shadow:var(--ch-inset),inset 2px 0 0 var(--ch-author);color:var(--ch-ink);font:400 21px/1.25 var(--ch-font-text)}
  .mk-rename-foot{display:flex;align-items:center;gap:6px}
  .mk-rename-foot small{flex:1;color:var(--ch-muted);font-size:11px}
  .mk-rename-foot .ch-btn{padding:4px 9px}
  .mk-rename-foot .is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-rule{height:0;margin:12px -2px 8px;border-top:1px solid var(--ch-shade);border-bottom:1px solid var(--ch-highlight)}
  .mk-sheet .ch-label{margin:0 0 4px;color:var(--ch-muted)}
  .mk-novel{display:flex;align-items:baseline;gap:10px;width:100%;padding:6px 8px;margin:0 -8px;border:0;border-radius:var(--ch-radius-sm);background:transparent;text-align:left;cursor:pointer}
  .mk-novel b{flex:1;color:var(--ch-ink);font:400 15px/1.3 var(--ch-font-text)}
  .mk-novel small{color:var(--ch-faint);font:11px var(--ch-font-ui)}
  .mk-novel.is-focus{box-shadow:var(--ch-raise-s)}
  .mk-sheet-actions{display:flex;gap:6px;margin-top:8px}
  .mk-sheet-actions .ch-btn{padding:5px 10px}
  .mk-sheet-hint{margin:10px 0 0;color:var(--ch-faint);font-size:11px}
  /* Overview: the title renames in place; the library one click away */
  .mk-ov-tools{display:inline-flex;gap:6px;margin-left:12px;vertical-align:middle}
  .mk-ov-tools .ch-btn{padding:3px 9px;font:12px var(--ch-font-ui);color:var(--ch-ink-2)}
  .mk-ov-tools kbd{margin-left:4px;color:var(--ch-faint);font:inherit}
  /* Drawer: the title in the context line is a button */
  .mk-drawer-title{padding:1px 4px;margin:-1px -4px;border:0;border-radius:var(--ch-radius-sm);background:transparent;color:var(--ch-ink);font:inherit;text-decoration:underline;text-decoration-color:var(--ch-faint);text-underline-offset:2px;cursor:pointer}

  /* Working versions (1.20) */
  .mk-title b{font-weight:400;font-style:italic;color:var(--ch-author)}
  .mk-ver{display:flex;align-items:baseline;gap:10px;width:100%;padding:6px 8px;margin:0 -8px 2px;border:0;border-radius:var(--ch-radius-sm);background:transparent;text-align:left;cursor:pointer}
  .mk-ver b{flex:1;color:var(--ch-ink-2);font:400 15px/1.3 var(--ch-font-text)}
  .mk-ver small{color:var(--ch-faint);font:11px var(--ch-font-ui)}
  .mk-ver.is-on{background:var(--ch-bg);box-shadow:var(--ch-inset),inset 2px 0 0 var(--ch-author)}
  .mk-ver.is-on b{color:var(--ch-ink)}
  .mk-ver.is-focus{box-shadow:var(--ch-raise-s)}
  .mk-new-ver{display:flex;flex-direction:column;gap:7px;margin-top:6px}
  .mk-new-ver input{width:100%;box-sizing:border-box;border:0;border-radius:var(--ch-radius-sm);padding:6px 10px;background:var(--ch-bg);box-shadow:var(--ch-inset),inset 2px 0 0 var(--ch-author);color:var(--ch-ink);font:400 15px/1.3 var(--ch-font-text)}
  .mk-new-ver p{margin:0;color:var(--ch-muted);font-size:11.5px;line-height:1.5}
  .mk-new-ver .mk-rename-foot{justify-content:flex-end}
  .ch-crumb.mk-var{font:500 12px/1 var(--ch-font-text);font-variant-caps:all-small-caps;letter-spacing:.06em;color:var(--ch-faint)}
  .ch-crumb.mk-var.is-own{color:var(--ch-author);opacity:.8}
  .mk-nav-own{margin-left:6px;color:var(--ch-author);font:italic 11px var(--ch-font-text);opacity:.85}
  .mk-nav-out{margin:10px 14px 0;padding-top:8px;border-top:1px solid var(--ch-shade);color:var(--ch-muted);font:11.5px var(--ch-font-ui)}
  .mk-nav-out .ch-link{color:var(--ch-ink-2);font:inherit;text-decoration:underline;text-decoration-color:var(--ch-faint)}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const X =
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const OTHERS = [
    ['Le Phare des Sept-Îles', 'hier'],
    ['La Saison des cerises', 'le 2 nov.'],
    ['Nouvelles de l’estuaire', 'le 18 oct.'],
  ];
  const sheet = (renaming) => `
    <div class="mk-sheet" role="dialog" aria-label="Le roman">
      ${
        renaming
          ? `<div class="mk-rename"><input value="Avant Nantes, 1910" aria-label="Titre du roman" />
             <div class="mk-rename-foot"><small></small><button type="button" class="ch-btn is-author is-lit">Renommer <kbd>⏎</kbd></button><button type="button" class="ch-btn">Annuler <kbd>Échap</kbd></button></div></div>`
          : `<div class="mk-sheet-head"><h2>${TITLE}</h2><button type="button" class="ch-btn">Renommer <kbd>R</kbd></button><button type="button" class="mk-x" aria-label="Fermer">${X}</button></div>
             <p class="mk-stats">Roman · 1 chapitre · 1 scène · 16 mots</p>`
      }
      <div class="mk-rule"></div>
      <p class="ch-label">Vos autres romans</p>
      ${OTHERS.map(
        ([t, w], i) =>
          `<button type="button" class="mk-novel${i === 0 && !renaming ? ' is-focus' : ''}"><b>${t}</b><small>${w}</small></button>`,
      ).join('')}
      <div class="mk-sheet-actions"><button type="button" class="ch-btn">Tous les romans… <kbd>⌘O</kbd></button><button type="button" class="ch-btn">+ Nouveau roman</button></div>
      ${renaming ? '' : '<p class="mk-sheet-hint">↑↓ choisir · ↵ ouvrir · R renommer · Échap fermer</p>'}
    </div>`;

  const write = () => {
    const header = document.querySelector('.ch-scene-header');
    if (!header || document.querySelector('.mk-title')) return;
    const host = header.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const open = ['feuille', 'renommer'].includes(S.screen);
    host.insertAdjacentHTML(
      'afterbegin',
      `<button type="button" class="mk-title${open ? ' is-open' : ''}" title="Le roman : renommer, changer de roman" aria-haspopup="dialog" aria-expanded="${open}"><span>${TITLE}</span><i aria-hidden="true">⌄</i></button>${open ? sheet(S.screen === 'renommer') : ''}`,
    );
    if (S.screen === 'mac' || S.screen === 'feuille' || S.screen === 'renommer') {
      document.body.classList.add('mk-mac');
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div class="mk-lights"><i></i><i></i><i></i></div>',
      );
    }
  };
  const overview = () => {
    const h = [...document.querySelectorAll('h1,h2')].find((e) => e.textContent.trim() === TITLE);
    if (!h || h.querySelector('.mk-ov-tools')) return;

    h.insertAdjacentHTML(
      'beforeend',
      '<span class="mk-ov-tools"><button type="button" class="ch-btn">Renommer <kbd>R</kbd></button><button type="button" class="ch-btn">Tous les romans… <kbd>⌘O</kbd></button></span>',
    );
  };
  const drawer = () => {
    const ctx = [...document.querySelectorAll('.ch-panel-title-context')].find((e) =>
      e.textContent.includes(TITLE),
    );
    if (!ctx || ctx.querySelector('.mk-drawer-title')) return;
    ctx.innerHTML = ctx.innerHTML.replace(
      TITLE,
      `<button type="button" class="mk-drawer-title" title="Le roman : renommer, changer de roman">${TITLE}</button>`,
    );
  };
  // ───── Working versions (1.20) ─────
  const VERSION = 'Fin à Nantes';
  const versionsBlock = (creating) => `
      <div class="mk-rule"></div>
      <p class="ch-label">Versions de travail</p>
      <button type="button" class="mk-ver${creating ? '' : ''}"><b>Principale</b><small>14 scènes</small></button>
      <button type="button" class="mk-ver is-on"><b>${VERSION}</b><small>3 scènes à elle · hier</small></button>
      ${
        creating
          ? `<div class="mk-new-ver"><input value="Hélène reste à Orléans" aria-label="Nom de la version" />
             <p>Elle part de « ${VERSION} », telle qu’elle est. Rien n’est copié : chaque scène reste commune, jusqu’à ce que vous lui donniez une variante pour cette version, par « Nouvelle variante » ⇧⌘N.</p>
             <div class="mk-rename-foot"><button type="button" class="ch-btn is-author is-lit">Créer <kbd>⏎</kbd></button><button type="button" class="ch-btn">Annuler <kbd>Échap</kbd></button></div></div>`
          : '<div class="mk-sheet-actions"><button type="button" class="ch-btn">+ Nouvelle version…</button></div>'
      }`;
  const versionSheet = (creating) => `
    <div class="mk-sheet" role="dialog" aria-label="Le roman">
      <div class="mk-sheet-head"><h2>${TITLE}</h2><button type="button" class="ch-btn">Renommer <kbd>R</kbd></button><button type="button" class="mk-x" aria-label="Fermer">${X}</button></div>
      <p class="mk-stats">Version « ${VERSION} » · 15 scènes · 22 080 mots</p>
      ${versionsBlock(creating)}
      <div class="mk-rule"></div>
      <p class="ch-label">Vos autres romans</p>
      ${OTHERS.slice(0, 2)
        .map(
          ([t, w]) =>
            `<button type="button" class="mk-novel"><b>${t}</b><small>${w}</small></button>`,
        )
        .join('')}
      <div class="mk-sheet-actions"><button type="button" class="ch-btn">Tous les romans… <kbd>⌘O</kbd></button><button type="button" class="ch-btn">+ Nouveau roman</button></div>
      ${creating ? '' : '<p class="mk-sheet-hint">↑↓ choisir · ↵ ouvrir ou passer à la version · R renommer · Échap fermer</p>'}
    </div>`;
  const versionWrite = () => {
    const header = document.querySelector('.ch-scene-header');
    if (!header || document.querySelector('.mk-title')) return;
    const host = header.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const open = ['versions', 'nouvelle-version'].includes(S.screen);
    host.insertAdjacentHTML(
      'afterbegin',
      `<button type="button" class="mk-title${open ? ' is-open' : ''}" title="Le roman : renommer, changer de version ou de roman" aria-haspopup="dialog" aria-expanded="${open}"><span>${TITLE} · <b>${VERSION}</b></span><i aria-hidden="true">⌄</i></button>${open ? versionSheet(S.screen === 'nouvelle-version') : ''}`,
    );
    const crumbs = header.querySelectorAll('.ch-crumb');
    if (crumbs[0]) crumbs[0].textContent = 'III · Le fleuve';
    if (crumbs[1]) crumbs[1].textContent = '4 · Le quai de la Fosse';
    const op = document.querySelector('.ch-opener');
    if (op) {
      op.querySelector('.ch-opener-numeral').textContent = 'III';
      op.querySelector('.ch-opener-chapter').textContent = 'Le fleuve';
      op.querySelector('.ch-opener-scene').textContent = 'Le quai de la Fosse';
    }
    const prose = document.querySelector('.ch-prose p');
    if (prose)
      prose.textContent =
        'Le quai de la Fosse est noir de monde. Hélène amarre le bateau entre deux gabares et cherche, parmi les hommes en casquette, celui qui a écrit la lettre.';
    header.insertAdjacentHTML(
      'beforeend',
      `<span class="ch-crumb-sep" aria-hidden="true">·</span><button type="button" tabindex="-1" class="ch-crumb mk-var is-own" title="Variante de cette scène pour la version ${VERSION}">${VERSION}</button>`,
    );
  };
  const versionDrawer = () => {
    const tree = document.querySelector('.ch-nav-tree');
    if (!tree || tree.dataset.mk) return;
    tree.dataset.mk = '1';
    const ctx = document.querySelector('.ch-panel-title-context');
    if (ctx) ctx.innerHTML = `${TITLE} · <i>${VERSION}</i>`;
    const chap = (n, t, w) =>
      `<li role="treeitem" class="ch-nav-item ch-nav-chapter"><span class="ch-nav-name"><span class="ch-nav-fleuron" aria-hidden="true">⁂</span>${n} · ${t}</span><span class="ch-nav-meta"><span>${w}</span></span></li>`;
    const scene = (n, t, w, own, cur) =>
      `<li role="treeitem" class="ch-nav-item ch-nav-scene${cur ? ' is-current' : ''}"${cur ? ' aria-current="true"' : ''}><span class="ch-nav-name">${n} · ${t}${own ? `<span class="mk-nav-own">${VERSION}</span>` : ''}</span><span class="ch-nav-meta"><span>${w}</span></span></li>`;
    tree.innerHTML =
      chap('I', 'La crue', '6 240') +
      scene(1, 'Les amarres', '1 410') +
      scene(2, 'Le livret', '1 620') +
      chap('II', 'Orléans', '7 880') +
      scene(1, 'L’écluse fermée', '1 950') +
      scene(2, 'Paul', '2 120', true) +
      chap('III', 'Le fleuve', '7 960') +
      scene(1, 'La nuit sur l’eau', '1 870') +
      scene(2, 'Le pont de Saumur', '1 640') +
      scene(3, 'L’estuaire', '1 720', true) +
      scene(4, 'Le quai de la Fosse', '1 480', true, true);
    tree.insertAdjacentHTML(
      'afterend',
      `<p class="mk-nav-out">1 scène hors de cette version · <button type="button" class="ch-link">afficher</button></p>`,
    );
  };

  const apply = () => {
    if (S.screen === 'tiroir-version') {
      versionDrawer();
      versionWrite();
    } else if (['versions', 'nouvelle-version', 'en-version'].includes(S.screen)) versionWrite();
    else if (S.screen === 'ensemble') overview();
    else if (S.screen === 'tiroir') {
      drawer();
      write();
    } else write();
  };
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
})();
