/* Maquette : la punaise des panneaux (règle 12 de DESIGN §5.0, D-46), à trancher par l'auteur.
   À injecter dans la page d'écriture, tiroir et panneau du Compagnon ouverts :
   window.PUNAISE = { variante, tiroir, compagnon }.
   variante = « punaise » : une punaise dans la ligne de titre de chaque panneau, avant la croix ;
     tiroir / compagnon = true quand elle est enfoncée (le panneau reste ouvert au retour au texte).
   variante = « tient » : pas de punaise ; le tiroir reste ouvert comme le panneau du Compagnon.
   Un panneau qui tient n'estompe plus la scène : le texte se recentre entre les panneaux. */
(() => {
  const o = window.PUNAISE || {};
  const css = document.createElement('style');
  css.textContent = `
    .mk-pin { display: grid; place-items: center; width: 26px; height: 26px; margin-right: 2px; border: 0;
      border-radius: 50%; background: transparent; color: var(--ch-muted); padding: 0; flex: none; }
    .mk-pin svg { width: 15px; height: 15px; transform: rotate(45deg); transition: transform 0.35s; }
    .mk-pin.is-hover { color: var(--ch-ink); box-shadow: var(--ch-raise-s); }
    .mk-pin.is-on { box-shadow: var(--ch-inset); color: var(--ch-ink); }
    .mk-pin.is-on svg { transform: none; }
    .mk-tip { position: absolute; z-index: 30; padding: 5px 9px; border-radius: 7px; background: #1b1e24;
      color: #dfe3ea; font: 12px var(--ch-font-ui); white-space: nowrap; box-shadow: 0 4px 14px rgb(0 0 0 / 0.25); }
  `;
  document.head.appendChild(css);
  const PIN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5h6M10 3.5v6l-3.2 3.4h10.4L14 9.5v-6M12 12.9V20.5"/></svg>';
  const holds = (name) => (o.variante === 'tient' ? true : !!o[name]);
  const panels = { tiroir: '.ch-navigator', compagnon: '.ch-mentor-panel' };
  if (o.variante === 'punaise') {
    for (const [name, sel] of Object.entries(panels)) {
      const title = document.querySelector(`${sel} .ch-panel-title`);
      const close = title?.querySelector('.ch-close');
      if (!close) continue;
      const b = document.createElement('button');
      b.className = `mk-pin ${o[name] ? 'is-on' : ''} ${o.hover === name ? 'is-hover' : ''}`;
      b.innerHTML = PIN;
      close.before(b);
      if (o.tip === name) {
        const r = b.getBoundingClientRect();
        const t = document.createElement('div');
        t.className = 'mk-tip';
        t.textContent = o[name]
          ? 'Épinglé : reste ouvert quand vous revenez au texte (⇧⌘J)'
          : 'Épingler : garder ouvert quand vous revenez au texte (⇧⌘J)';
        document.body.appendChild(t);
        t.style.top = r.bottom + 8 + 'px';
        t.style.left = Math.max(12, r.left - t.offsetWidth / 2 + 13) + 'px';
      }
    }
  }
  // A drawer that holds no longer dims the scene: the text recentres between the panels.
  if (holds('tiroir')) {
    const write = document.querySelector('.ch-write');
    const nav = document.querySelector('.ch-navigator')?.getBoundingClientRect();
    if (write && nav) {
      write.classList.remove('is-behind');
      write.style.opacity = '1';
      write.style.paddingLeft = nav.right + 12 + 'px';
    }
  }
})();
