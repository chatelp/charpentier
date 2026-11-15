// Mock (DESIGN §4.8 « Sortie à la souris »): a discreet close control wherever Échap leaves today. Inject into the app (?x250) after setting window.CLOSE_FORM = "C" (chosen), "A" or "B".
(() => {
  const FORM = window.CLOSE_FORM || 'C';
  const css = `
  .mk-close{display:inline-flex;align-items:center;gap:6px;flex:none;height:26px;padding:0;border:0;background:transparent;
    color:var(--ch-faint);font:500 11px/1 var(--ch-font-ui);cursor:pointer;border-radius:13px;transition:color .2s,box-shadow .2s,background-color .2s}
  .mk-close svg{display:block}
  .mk-close .x{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;transition:box-shadow .2s, background-color .2s}
  .mk-close kbd{color:inherit;font:500 10.5px/1.5 var(--ch-font-ui);opacity:.9}
  .mk-close.is-sys{font-family:var(--ch-font-sys)}
  .mk-close.is-sys kbd{font-family:var(--ch-font-sys)}
  /* A: the glyph alone */
  .mk-A kbd,.mk-A .w{display:none}
  .mk-A:hover,.mk-A.is-hover{color:var(--ch-ink)}
  .mk-A:hover .x,.mk-A.is-hover .x{box-shadow:var(--ch-raise-s)}
  /* B: the word and its key, no glyph */
  .mk-B .x{display:none}
  .mk-B{padding:0 9px}
  .mk-B .w{color:inherit}
  .mk-B:hover,.mk-B.is-hover{color:var(--ch-ink);box-shadow:var(--ch-raise-s)}
  /* C: the glyph; its key comes out on hover or focus */
  .mk-C .w{display:none}
  .mk-C kbd{max-width:0;overflow:hidden;opacity:0;transition:max-width .2s,opacity .2s}
  .mk-C:hover kbd,.mk-C.is-hover kbd{max-width:4em;opacity:1}
  .mk-C:hover,.mk-C.is-hover{color:var(--ch-ink)}
  .mk-C:hover .x,.mk-C.is-hover .x{box-shadow:var(--ch-raise-s)}
  .mk-close.is-lit .x,.mk-B.is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-corner{position:absolute;top:12px;right:14px;z-index:5}
  .ch-panel-title{position:relative}
  .ch-panel-title-name{flex:none;white-space:nowrap}
  .ch-panel-title-context{flex:1 1 auto;min-width:0;max-width:none;text-align:right}
  .ch-panel-title .mk-close{margin-left:6px;margin-right:-6px}
  .ch-sys-head .mk-close{height:20px;margin:-3px -6px -3px 6px}
  .ch-sys-head .mk-close .x{width:20px;height:20px}
  .ch-cmd-field .mk-close{margin-left:8px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const X = (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const make = (label, sys) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mk-close mk-${FORM}${sys ? ' is-sys' : ''}`;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-keyshortcuts', 'Escape');
    b.title = `${label} (Échap)`;
    b.innerHTML = `<kbd>${sys ? 'échap' : 'Échap'}</kbd><span class="w">${sys ? 'fermer' : 'Fermer'}</span><span class="x">${X(sys ? 9 : 10)}</span>`;
    if (FORM === 'B')
      b.innerHTML = `<span class="w">${sys ? 'fermer' : 'Fermer'}</span><kbd>${sys ? 'échap' : 'Échap'}</kbd>`;
    return b;
  };
  const place = () => {
    for (const t of document.querySelectorAll('.ch-panel-title:not([data-mk])')) {
      t.dataset.mk = '1';
      t.append(make('Fermer le panneau'));
    }
    for (const sel of ['.ch-overview', '.ch-settings', '.ch-library']) {
      const v = document.querySelector(`${sel}:not([data-mk])`);
      if (v) {
        v.dataset.mk = '1';
        if (getComputedStyle(v).position === 'static') v.style.position = 'relative';
        const b = make('Revenir au texte');
        b.classList.add('mk-corner');
        v.append(b);
      }
    }
    const top = document.querySelector('.ch-mon-top:not([data-mk])');
    if (top) {
      top.dataset.mk = '1';
      for (const el of top.querySelectorAll('*'))
        if (/revenir au texte/.test(el.textContent) && el.children.length === 0)
          el.style.display = 'none';
      for (const el of top.children)
        if (/revenir au texte/.test(el.textContent)) el.style.display = 'none';
      top.append(make('Revenir au texte', true));
    }
    for (const h of document.querySelectorAll('.ch-sys-panel .ch-sys-head:not([data-mk])')) {
      h.dataset.mk = '1';
      const end = document.createElement('span');
      end.style.cssText = 'display:inline-flex;align-items:center';
      const aside = h.querySelector('.ch-sys-head-aside');
      if (aside) end.append(aside);
      end.append(make('Fermer', true));
      h.append(end);
    }
    const f = document.querySelector('.ch-cmd-field:not([data-mk])');
    if (f) {
      f.dataset.mk = '1';
      f.append(make('Fermer la ligne de commande'));
    }
  };
  place();
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
  window.mkHover = (on) =>
    document.querySelectorAll('.mk-close').forEach((b) => b.classList.toggle('is-hover', on));
})();
