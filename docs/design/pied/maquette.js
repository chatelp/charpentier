// Mockup of the state line above the foot (DESIGN 1.43), injected in the running app:
//   window.PIED = { etat: 'confirmer' | 'annuler' | null, quoi: [before, name, after], ligne };
// `quoi` gives the phrase in three parts: only the middle one, the name, may be cut. `ligne: false`: asked from the command line, no drawer line armed.
(() => {
  const css = `
  .pied-line{position:absolute;right:0;bottom:calc(100% + 6px);max-width:100%;box-sizing:border-box;
    display:flex;align-items:center;gap:8px;height:30px;padding:0 4px 0 12px;border-radius:var(--ch-radius-sm);
    background:var(--ch-bg);box-shadow:var(--ch-raise-s);color:var(--ch-ink-2);white-space:nowrap;
    font:400 var(--ch-ui-xs)/1 var(--ch-font-ui);pointer-events:auto}
  .pied-line.is-ask{padding:0 12px;border:0;background:var(--ch-lit-bg);box-shadow:var(--ch-lit),var(--ch-raise-s);
    color:var(--ch-ink);font-weight:500}
  .pied-phrase{display:flex;min-width:0;white-space:pre}
  .pied-phrase>b:empty{display:none}
  .pied-phrase>b{font-weight:inherit;min-width:4ch;overflow:hidden;text-overflow:ellipsis}
  .pied-line kbd,.pied-left{font:inherit;font-weight:400;color:var(--ch-faint);font-variant-numeric:tabular-nums;flex:none}
  .pied-line .ch-footer-button{flex:none;color:var(--ch-ink)}
  .pied-row{color:var(--ch-ink);font-variant-numeric:tabular-nums}
  .pied-row kbd{font:inherit;color:var(--ch-muted);margin-right:4px}
  .ch-app[data-view='write'] .ch-footer{grid-template-columns:minmax(4.5rem,1fr) minmax(11rem,calc(min(30rem,38vw) + 6.5rem)) minmax(9rem,1fr)!important}
  @media (max-width:1300px){.ch-app[data-mentor-panel][data-navigator] .ch-cmdzone-text{visibility:hidden}}`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.append(s);
  const { etat, quoi, ligne = true } = window.PIED;
  document
    .querySelectorAll('.ch-footer-confirm,.ch-footer-undo')
    .forEach((e) => (e.style.display = 'none'));
  const el = document.createElement(etat === 'confirmer' ? 'button' : 'div');
  el.className = 'pied-line' + (etat === 'confirmer' ? ' is-ask' : '');
  const p = `<span class="pied-phrase"><span>${quoi[0]}</span><b>${quoi[1]}</b><span>${quoi[2]}</span></span>`;
  el.innerHTML =
    etat === 'confirmer'
      ? `${p}<kbd>⌫</kbd><span class="pied-left">3 s</span>`
      : `${p}<button class="ch-footer-button">Annuler <kbd>⌘Z</kbd></button>`;
  document.querySelector('.ch-footer').append(el);
  // In the drawer, the armed line shows the key and the seconds instead of its words.
  if (etat === 'confirmer' && ligne) {
    const row = document.querySelector('[role=treeitem]:focus');
    const n =
      row &&
      [...row.querySelectorAll('*')].find(
        (e) => !e.children.length && /^\d+$/.test(e.textContent.trim()),
      );
    if (n) {
      n.classList.add('pied-row');
      n.style.color = 'var(--ch-ink)';
      n.innerHTML = '<kbd>⌫</kbd>3 s';
    }
  }
})();
