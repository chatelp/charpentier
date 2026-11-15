// Mock (DESIGN §4.5 « Travaux de fond du Compagnon »): the specialised agents' entry point,
// cost, progress and result, injected into the real app's Atelier.
// window.WORK = { task: 'structure' | 'clues' | 'character', state: 'repos' | 'confirmer' |
// 'encours' | 'fini' | 'occupe' | 'sansclef', bilan: true (the bilan in the conversation) }.
(() => {
  const W = Object.assign({ task: 'structure', state: 'repos' }, window.WORK);
  const css = `
  .mk-work{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:10px}
  .mk-work + .ch-atl-hint{margin-top:10px}
  .mk-work-label{margin:0;padding-left:6px;color:var(--ch-mentor)}
  .mk-work-btn{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;text-align:left;border-radius:var(--ch-radius-md)}
  .mk-work-btn .ch-medallion{width:30px;height:30px;color:var(--ch-mentor)}
  .mk-work-btn b{display:block;color:var(--ch-mentor);font:500 12.5px/1.3 var(--ch-font-ui)}
  .mk-work-btn small{display:block;margin-top:2px;color:var(--ch-muted);font:11px/1.35 var(--ch-font-ui)}
  .mk-work-btn[aria-disabled=true]{box-shadow:none;background:transparent;cursor:default}
  .mk-work-btn[aria-disabled=true] b,.mk-work-btn[aria-disabled=true] .ch-medallion{color:var(--ch-faint)}
  .mk-work-btn[aria-disabled=true] .ch-medallion{box-shadow:none}
  .mk-work-btn.is-hover{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-work-note{margin:0 2px;color:var(--ch-muted);font:11px/1.5 var(--ch-font-ui)}
  .mk-work-note .ch-link{color:var(--ch-ink-2)}
  .mk-work-note b{font-weight:500;color:var(--ch-ink-2)}
  .mk-work-card{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:var(--ch-radius-md);box-shadow:var(--ch-raise);background:var(--ch-bg)}
  .mk-work-card.is-flat{box-shadow:none;background:transparent;padding:4px 2px}
  .mk-work-head{display:flex;align-items:center;gap:10px}
  .mk-work-head .ch-medallion{width:30px;height:30px;color:var(--ch-mentor)}
  .mk-work-head b{color:var(--ch-mentor);font:500 12.5px/1.3 var(--ch-font-ui)}
  .mk-work-what{margin:0;color:var(--ch-ink-2);font:11.5px/1.5 var(--ch-font-ui)}
  .mk-work-cost{display:flex;flex-direction:column;gap:2px;padding-top:8px;border-top:1px solid var(--ch-shade)}
  .mk-work-cost .ch-label{margin:0;color:var(--ch-muted)}
  .mk-work-cost strong{color:var(--ch-ink);font:400 19px/1.25 var(--ch-font-text)}
  .mk-work-cost span{color:var(--ch-faint);font:11px/1.4 var(--ch-font-ui)}
  .mk-work-actions{display:flex;gap:6px;flex-wrap:wrap}
  .mk-work-actions .ch-btn{padding:5px 9px}
  .mk-work-actions kbd{color:var(--ch-faint);font:inherit}
  .mk-work-actions .is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-work-doing{margin:0;color:var(--ch-mentor);font:italic 400 14px/1.35 var(--ch-font-text)}
  .mk-work-rail{height:6px;border-radius:3px;box-shadow:var(--ch-inset);overflow:hidden}
  .mk-work-rail i{display:block;height:100%;width:var(--p);border-radius:3px;background:var(--ch-mentor);opacity:.8}
  .mk-work-count{display:flex;justify-content:space-between;color:var(--ch-muted);font:11px/1.4 var(--ch-font-ui);font-variant-numeric:tabular-nums}
  .mk-bilan-head{margin:18px 0 6px;color:var(--ch-mentor)}
  .mk-bilan-head small{color:var(--ch-faint);font:11px var(--ch-font-ui);letter-spacing:0;text-transform:none;font-variant-caps:normal}
  .mk-bilan-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .mk-bilan-links .ch-btn{color:var(--ch-mentor)}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const picto = `<svg class="ch-picto" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><path d="M11.3 6.6 6 20M12.7 6.6 18 20M8.3 14.5h7.4"/></svg>`;
  const med = `<span class="ch-medallion is-mentor">${picto}</span>`;
  const T = {
    structure: {
      name: 'Vérifier la structure',
      sub: 'Actes, arcs et tension',
      what: 'Le Compagnon relit tout le manuscrit (42 scènes, 38 200 mots) pour voir ses actes, ses arcs et sa tension. Il propose, vous décidez.',
      cost: 'environ 30 centimes',
      max: 'au plus 45 centimes · 1 à 2 minutes',
      doing: 'Le Compagnon vérifie la structure…',
      where: 'Structure',
      done: 'Vérifiée aujourd’hui à 14:32',
      found:
        '<button type="button" class="ch-link">2 propositions</button> · <button type="button" class="ch-link">1 signalement</button>',
    },
    clues: {
      name: 'Suivre les indices',
      sub: 'Posés, exploités, révélations préparées',
      what: 'Le Compagnon relit tout le manuscrit (42 scènes, 38 200 mots) pour suivre chaque indice : où il est posé, où il resservira, si les révélations sont préparées. Il propose, vous décidez.',
      cost: 'environ 35 centimes',
      max: 'au plus 50 centimes · 1 à 2 minutes',
      doing: 'Le Compagnon suit les indices…',
      where: 'Indices et révélations',
      done: 'Suivis aujourd’hui à 14:32',
      found:
        '<button type="button" class="ch-link">3 propositions</button> · <button type="button" class="ch-link">2 signalements</button>',
    },
    character: {
      name: 'Faire le point',
      full: 'Faire le point sur Hélène Varenne',
      sub: 'sur Hélène Varenne, scène par scène',
      what: 'Le Compagnon relit tout le manuscrit (42 scènes, 38 200 mots) pour suivre Hélène Varenne scène par scène : ce que ce personnage veut, ce qu’il sait, comment il change. Il propose, vous décidez.',
      cost: 'environ 25 centimes',
      max: 'au plus 40 centimes · 1 minute environ',
      doing: 'Le Compagnon fait le point sur Hélène Varenne…',
      where: 'sa fiche',
      done: 'Point fait hier à 18:05',
      found: '<button type="button" class="ch-link">4 propositions</button>',
    },
  }[W.task];

  const block = () => {
    const el = document.createElement('div');
    el.className = 'mk-work';
    const label = `<p class="mk-work-label ch-label ch-engraved">Le Compagnon</p>`;
    const button = (extra = '') =>
      `<button type="button" class="ch-btn mk-work-btn${W.hover ? ' is-hover' : ''}" ${extra}>${med}<span><b>${T.name}</b><small>${T.sub}</small></span></button>`;
    const last = (txt) => `<p class="mk-work-note">${txt}</p>`;
    if (W.state === 'repos') el.innerHTML = label + button() + last('Dernière fois : jamais');
    if (W.state === 'fini')
      el.innerHTML =
        label +
        button() +
        last(
          `${T.done}<br>${T.found} · <button type="button" class="ch-link">le bilan</button> <kbd>⌘L</kbd>`,
        );
    if (W.state === 'confirmer')
      el.innerHTML =
        label +
        `<div class="mk-work-card" role="group" aria-label="${T.name}">
          <div class="mk-work-head">${med}<b>${T.full || T.name}</b></div>
          <p class="mk-work-what">${T.what}</p>
          <div class="mk-work-cost"><p class="ch-label">Coût estimé</p><strong>${T.cost}</strong><span>${T.max}</span></div>
          <div class="mk-work-actions"><button type="button" class="ch-btn is-mentor is-lit">Lancer <kbd>⏎</kbd></button><button type="button" class="ch-btn">Annuler <kbd>Échap</kbd></button></div>
        </div>`;
    if (W.state === 'encours')
      el.innerHTML =
        label +
        `<div class="mk-work-card is-flat" role="status">
          <p class="mk-work-doing">${T.doing}</p>
          <div class="mk-work-rail" style="--p:29%"><i></i></div>
          <div class="mk-work-count"><span>12 scènes lues sur 42</span><span>0:42</span></div>
          <div class="mk-work-actions"><button type="button" class="ch-btn">Arrêter</button></div>
        </div>`;
    if (W.state === 'occupe')
      el.innerHTML =
        label +
        button('aria-disabled="true"') +
        last('Un travail à la fois : le Compagnon vérifie la structure (0:42).');
    if (W.state === 'sansclef')
      el.innerHTML =
        label +
        button('aria-disabled="true"') +
        last(
          'Le Compagnon a besoin de votre clé d’API. <button type="button" class="ch-link">Saisir la clé</button>',
        );
    return el;
  };

  const place = () => {
    const list = document.querySelector('.ch-atl-list');
    if (!list || list.querySelector('.mk-work')) return;
    list.querySelector('.ch-atl-hint').before(block());
    if (W.state === 'fini' && W.task === 'structure') {
      const entries = list.querySelectorAll('.ch-atl-entry');
      const act = [...entries].find((e) => /La crue/.test(e.textContent));
      if (act) {
        const li = act.cloneNode(true);
        li.classList.remove('is-selected', 'is-active');
        li.classList.add('is-proposed');
        li.querySelector('.ch-atl-entry-title').textContent = 'Le retour à Nantes';
        const m = li.querySelector('.ch-monogram');
        if (m) {
          m.textContent = 'R';
          m.className = 'ch-monogram is-proposed';
        }
        act.after(li);
      }
    }
    for (const f of document.querySelectorAll('.ch-footer-fit, .ch-footer-right span'))
      if (/pas disponible/.test(f.textContent)) {
        if (W.state === 'encours') f.textContent = 'Le Compagnon vérifie la structure… 12 / 42';
        if (W.state === 'fini')
          f.textContent =
            'Le bilan de la structure est dans la conversation avec le Compagnon (⌘L).';
        if (W.state !== 'encours' && W.state !== 'fini') f.textContent = '';
      }
    const tr = document.querySelector('.ch-transcript');
    if (W.bilan && tr && !tr.querySelector('.mk-bilan-head')) {
      tr.querySelector('.ch-transcript-empty')?.remove();
      tr.insertAdjacentHTML(
        'beforeend',
        `<p class="mk-bilan-head ch-label ch-engraved">Bilan de la structure <small>aujourd’hui 14:32</small></p>
        <div class="ch-turn is-compagnon"><p class="ch-turn-who ch-label">Le Compagnon</p>
        <p class="ch-turn-text">J’ai relu vos 42 scènes. La crue monte très bien : chaque scène y ajoute un danger, la tension ne retombe pas.

Deux choses m’arrêtent. L’arc de la dette de Martin s’interrompt à la scène II.4 : on n’en entend plus parler ensuite. Est-ce voulu, ou attend-il sa fin ? Et votre récit a deux actes ; il manque peut-être celui du retour, que je vous propose dans Structure.</p>
        <div class="mk-bilan-links"><button type="button" class="ch-btn">2 propositions dans Structure ›</button><button type="button" class="ch-btn">1 signalement · II.4 ›</button></div></div>`,
      );
    }
  };
  place();
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
})();
