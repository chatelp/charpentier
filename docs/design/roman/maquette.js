// Mock (DESIGN §4.8 « Le titre du roman », 1.19): the novel's title as a visible entry point,
// top left of the writing page, and the sheet it opens: rename, the other novels, the library.
// Injected into the real app, whose project is first renamed « Avant Nantes ».
// window.ROMAN = { screen: 'repos' | 'mac' | 'feuille' | 'renommer' | 'ensemble' | 'tiroir' | 'x250' }.
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
  const apply = () => {
    if (S.screen === 'ensemble') overview();
    else if (S.screen === 'tiroir') {
      drawer();
      write();
    } else write();
  };
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
})();
