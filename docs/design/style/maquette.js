// Mock (DESIGN §4.5 « Textes de référence et Style et voix », phase 6.4): the reference
// text's import in the Entretien, its confirmation, work and result, the « Style et voix »
// page and the sign of a validated choice in a remark. Injected into the real app.
// window.STYLE = { screen: 'entretien' | 'confirmer' | 'lecture' | 'encours' | 'fini' |
// 'erreur' | 'page' | 'page-valide' | 'vide' | 'remarque' }.
(() => {
  const S = Object.assign({ screen: 'entretien' }, window.STYLE);
  const css = `
  .mk-hide{display:none!important}
  .mk-log{flex:1;min-height:0;overflow-y:auto;padding:4px 10px 10px}
  .mk-input{display:flex;align-items:flex-end;gap:10px}
  .mk-input .ch-field{flex:1}
  .mk-import{flex:none;padding:8px 12px;white-space:nowrap;color:var(--ch-mentor)}
  .mk-import kbd{margin-left:6px;color:var(--ch-faint);font:inherit}
  .mk-file{margin:var(--ch-space-4) 0 var(--ch-space-4) 4rem;padding:11px 16px;border-radius:var(--ch-radius-md);box-shadow:var(--ch-inset)}
  .mk-file .ch-label{margin:0 0 3px;color:var(--ch-muted);font-size:10.5px}
  .mk-file b{display:block;color:var(--ch-ink);font:400 17px/1.35 var(--ch-font-text)}
  .mk-file small{display:block;margin-top:2px;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-card{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:var(--ch-radius-md);box-shadow:var(--ch-raise);background:var(--ch-bg)}
  .mk-card.is-flat{box-shadow:none;background:transparent;padding:2px 0}
  .mk-card-head{display:flex;align-items:center;gap:10px}
  .mk-card-head b{color:var(--ch-mentor);font:500 13.5px/1.3 var(--ch-font-ui)}
  .mk-what{margin:0;color:var(--ch-ink-2);font:13px/1.55 var(--ch-font-ui)}
  .mk-kept{margin:0;color:var(--ch-ink-2);font:13px/1.55 var(--ch-font-ui)}
  .mk-cost{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;padding-top:9px;border-top:1px solid var(--ch-shade)}
  .mk-cost .ch-label{margin:0;color:var(--ch-muted)}
  .mk-cost strong{color:var(--ch-ink);font:400 19px/1.25 var(--ch-font-text)}
  .mk-cost span{color:var(--ch-faint);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-actions{display:flex;gap:6px;flex-wrap:wrap}
  .mk-actions .ch-btn{padding:5px 10px}
  .mk-actions kbd{color:var(--ch-faint);font:inherit}
  .mk-actions .is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  .mk-doing{margin:0;color:var(--ch-mentor);font:italic 400 16px/1.4 var(--ch-font-text)}
  .mk-count{display:flex;justify-content:space-between;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui);font-variant-numeric:tabular-nums}
  .mk-problem{margin:0;color:var(--ch-ink);font:13px/1.55 var(--ch-font-ui)}
  .mk-problem + .mk-what{color:var(--ch-muted)}
  .mk-head{display:flex;align-items:baseline;gap:8px;margin:26px 0 8px;color:var(--ch-mentor)}
  .mk-head small{color:var(--ch-faint);font:11px var(--ch-font-ui);letter-spacing:0;text-transform:none;font-variant-caps:normal}
  .mk-measure{margin:3px 0 0;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui);font-variant-numeric:tabular-nums}
  .mk-already{margin:3px 0 0;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-already q{color:var(--ch-ink-2);quotes:'« ' ' »'}
  .ch-interview-proposal .mk-measure{font-style:normal}
  .mk-log cite,.mk-sheet cite,.mk-work cite{font-style:italic}
  .mk-doing cite{font-style:normal}
  /* The Style et voix page */
  .mk-entries{flex:1;padding:2px 2px 10px;margin:0;list-style:none;overflow-y:auto}
  .mk-entries .ch-atl-entry-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4}
  .mk-entries .ch-atl-entry{padding:9px 12px}
  .mk-entries .ch-atl-group:first-child{margin-top:6px}
  .mk-work{display:flex;flex-direction:column;gap:8px;margin-top:auto;padding-top:10px}
  .mk-work-label{margin:0;padding-left:6px;color:var(--ch-mentor)}
  .mk-work-btn{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;text-align:left;border-radius:var(--ch-radius-md)}
  .mk-work-btn .ch-medallion{color:var(--ch-mentor)}
  .mk-work-btn b{display:block;color:var(--ch-mentor);font:500 12.5px/1.3 var(--ch-font-ui)}
  .mk-work-btn small{display:block;margin-top:2px;color:var(--ch-muted);font:11px/1.35 var(--ch-font-ui)}
  .mk-work-note{margin:0 2px;color:var(--ch-muted);font:11px/1.5 var(--ch-font-ui)}
  .mk-work-note .ch-link{color:var(--ch-ink-2)}
  .mk-work-note kbd{color:var(--ch-faint);font:inherit}
  .mk-sheet .ch-sheet-title{font-size:27px;line-height:1.3}
  .mk-sheet .ch-sheet-head{align-items:flex-start}
  .mk-sheet .ch-sheet-head .ch-medallion{flex:none;margin-top:2px}
  .mk-sheet .ch-sheet-head.is-proposed .ch-sheet-title{color:var(--ch-mentor);font-style:italic}
  .mk-empty{max-width:34rem;padding:64px 8px 0}
  .mk-empty .ch-medallion{margin-bottom:18px}
  .mk-empty h2{margin:0 0 10px;color:var(--ch-ink);font:400 30px/1.2 var(--ch-font-text)}
  .mk-empty p{margin:0 0 12px;color:var(--ch-ink-2);font:14px/1.6 var(--ch-font-ui)}
  .mk-empty p.mk-small{color:var(--ch-muted);font-size:12.5px}
  .mk-empty .mk-actions{margin-top:20px}
  /* The sign of a validated choice in a remark */
  .mk-note{position:absolute;width:var(--ch-note-w,19rem);padding:14px 16px;border-radius:var(--ch-radius-md);z-index:5}
  .mk-choice{display:flex;flex-direction:column;gap:1px;margin-top:10px!important;padding:7px 10px;border-radius:var(--ch-radius-sm,6px);box-shadow:var(--ch-inset),inset 2px 0 0 var(--ch-author);text-align:left;width:100%;cursor:pointer;background:transparent;border:0}
  .mk-choice .ch-label{color:var(--ch-muted);font-size:10px}
  .mk-choice span:last-child{color:var(--ch-ink);font:13.5px/1.4 var(--ch-font-text)}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const svg = (d, size = 17) =>
    `<svg class="ch-picto" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const COMPAS =
    '<circle cx="12" cy="5" r="1.7"/><path d="M11.3 6.6 6 20M12.7 6.6 18 20M8.3 14.5h7.4"/>';
  // The tuning fork: « donner le ton ». The ninth engraved pictogram.
  const DIAPASON = '<path d="M8.5 3v6.5a3.5 3.5 0 0 0 7 0V3M12 13v8M10 21h4"/>';
  const med = (d, size = 30, cls = '') =>
    `<span class="ch-medallion ${cls}" style="width:${size}px;height:${size}px">${svg(d, size === 46 ? 24 : size === 34 ? 19 : 17)}</span>`;
  const compas = (size = 30) => med(COMPAS, size, 'is-mentor');

  const BOOK = {
    title: '<cite>Les Eaux basses</cite>',
    plain: 'Les Eaux basses',
    author: 'Marthe Delorme',
    format: 'EPUB',
    words: '84 300',
  };
  const CHOICES = [
    {
      cat: 'Point de vue',
      text: 'Troisième personne, au plus près d’un seul personnage par chapitre',
      measure: '« il » ou « elle » dans 94 % du récit',
    },
    {
      cat: 'Temps',
      text: 'Le passé simple pour le récit, le présent pour les souvenirs',
      measure: 'passé simple : 81 % des verbes du récit',
      already: 'le présent de narration',
    },
    {
      cat: 'Phrases',
      text: 'Phrases courtes, souvent sans verbe, dans les scènes d’action',
      measure: '11 mots par phrase en moyenne, de 2 à 40',
    },
    {
      cat: 'Dialogue',
      text: 'Beaucoup de dialogue, presque sans « dit-il » : on sait qui parle',
      measure: '38 % du texte en dialogue',
    },
    {
      cat: 'Descriptions',
      text: 'Peu de description, toujours par un détail concret que voit le personnage',
    },
    {
      cat: 'Registre',
      text: 'Une langue simple et parlée dans les dialogues, plus tenue dans le récit',
    },
    {
      cat: 'Ouvertures et fins de chapitre',
      text: 'Des chapitres qui s’ouvrent en pleine action et se ferment sur une question',
      measure: '3 500 mots par chapitre en moyenne',
    },
  ];
  const CATS = [
    'Point de vue',
    'Temps',
    'Phrases',
    'Dialogue',
    'Descriptions',
    'Registre',
    'Ouvertures et fins de chapitre',
    'Autre',
  ];

  // ───── Entretien ─────
  const fileTurn = (pdf = false) =>
    `<div class="mk-file"><p class="ch-label">Texte de référence</p><b>${BOOK.plain}</b><small>${pdf ? 'les-eaux-basses.pdf · PDF · 212 pages' : `${BOOK.author} · ${BOOK.format} · ${BOOK.words} mots`}</small></div>`;
  const who = `<p class="ch-label ch-interview-who">Le Compagnon</p>`;
  const earlier = `
    <p class="ch-interview-author">Mon roman se passe sur la Loire en 1910, pendant la crue. Hélène est batelière, elle doit ramener le bateau de son père à Nantes.</p>
    <div class="ch-interview-turn is-compagnon">${who}<p class="ch-interview-say">Je range la crue et le voyage vers Nantes dans Le projet, et Hélène dans Personnages, avec son métier. Qu’est-ce qui l’attend à Nantes, si elle arrive ?</p></div>`;
  const card = (body, flat = false) =>
    `<div class="ch-interview-turn is-compagnon">${who}<div class="mk-card${flat ? ' is-flat' : ''}" role="${flat ? 'status' : 'group'}" aria-label="Dégager les choix de style">${body}</div></div>`;
  const WHAT =
    'Le Compagnon mesure tout le livre sur cet appareil (longueur des phrases, part du dialogue, temps, personne), puis lit 12 passages tirés au hasard pour le registre, les descriptions, les débuts et les fins de chapitre. Il propose, vous décidez.';
  const KEPT =
    'Seuls ces 12 passages partent vers le Compagnon. Le livre n’est pas gardé dans votre projet, et rien n’en sera cité : il ne reste que des choix, dits avec ses mots.';
  const confirmCard = (estimating = false) =>
    card(`
      <div class="mk-card-head">${compas()}<b>Dégager les choix de style</b></div>
      ${
        estimating
          ? '<p class="mk-what">Lecture du fichier…</p>'
          : `<p class="mk-what">${WHAT}</p><p class="mk-kept">${KEPT}</p>
      <div class="mk-cost"><p class="ch-label">Coût estimé</p><strong>environ 3 centimes</strong><span>au plus 5 centimes · moins d’une minute</span></div>`
      }
      <div class="mk-actions">${estimating ? '' : '<button type="button" class="ch-btn is-mentor is-lit">Lancer <kbd>⏎</kbd></button>'}<button type="button" class="ch-btn">Annuler <kbd>Échap</kbd></button></div>`);
  const errorCard = () =>
    card(`
      <div class="mk-card-head">${compas()}<b>Dégager les choix de style</b></div>
      <p class="mk-problem">Ce PDF ne contient que des images de pages : il n’y a pas de texte à lire.</p>
      <p class="mk-what">C’est le cas d’un livre scanné. Essayez plutôt l’EPUB, ou un PDF dont on peut sélectionner le texte.</p>
      <div class="mk-actions"><button type="button" class="ch-btn is-lit">Autre fichier… <kbd>⏎</kbd></button><button type="button" class="ch-btn">Fermer <kbd>Échap</kbd></button></div>`);
  const doingCard = () =>
    card(
      `<p class="mk-doing">Le Compagnon lit ${BOOK.title}…</p>
      <div class="mk-count"><span>Mesures faites · 12 passages en lecture</span><span aria-hidden="true">0:14</span></div>
      <div class="mk-actions"><button type="button" class="ch-btn">Arrêter</button></div>`,
      true,
    );
  const proposals = (states = {}) =>
    `<div class="ch-interview-proposals"><p class="ch-label ch-interview-proposals-title">7 propositions</p>${CHOICES.map(
      (c, i) => {
        const st = states[i] || 'pending';
        return `<div class="ch-interview-proposal is-${st}" tabindex="-1">${med(DIAPASON)}<div class="ch-interview-proposal-body">
        <p class="ch-interview-path"><button type="button">Style et voix</button> › <button type="button">${c.cat}</button></p>
        <p class="ch-interview-value">${c.text}</p>
        ${c.measure ? `<p class="mk-measure">${c.measure}</p>` : ''}
        ${c.already && st === 'pending' ? `<p class="mk-already">Vous aviez choisi : <q>${c.already}</q></p>` : ''}
        </div>${
          st === 'pending'
            ? '<span class="ch-interview-proposal-actions"><button type="button" class="ch-btn is-mentor">Valider <kbd>V</kbd></button><button type="button" class="ch-btn">Rejeter <kbd>X</kbd></button></span>'
            : `<span class="ch-interview-proposal-state">${st === 'validated' ? 'validée' : 'rejetée'}</span>`
        }</div>`;
      },
    ).join('')}</div>`;
  const result = () => `
    <p class="mk-head ch-label ch-engraved">Style · d’après ${BOOK.plain} <small>aujourd’hui 14:32</small></p>
    <div class="ch-interview-turn is-compagnon">${who}<p class="ch-interview-say">J’ai mesuré tout le livre et lu 12 passages. Voici sept choix que j’y vois. Gardez ceux qui vous ressemblent : ils deviendront vos choix, et je m’en servirai pour vous relire.</p>${proposals({ 0: 'validated' })}</div>`;

  const entretien = () => {
    const page = document.querySelector('.ch-interview');
    if (!page || page.querySelector('.mk-log')) return;
    const log = page.querySelector('.ch-interview-log');
    const field = page.querySelector('.ch-interview-field');
    log.classList.add('mk-hide');
    field.classList.add('mk-hide');
    for (const b of page.querySelectorAll('.ch-interview-modes button')) b.disabled = false;
    const mine = document.createElement('div');
    mine.className = 'mk-log';
    const sc = S.screen;
    mine.innerHTML =
      earlier +
      (sc === 'entretien' ? '' : fileTurn(sc === 'erreur')) +
      (sc === 'confirmer' ? confirmCard() : '') +
      (sc === 'lecture' ? confirmCard(true) : '') +
      (sc === 'erreur' ? errorCard() : '') +
      (sc === 'encours' ? doingCard() : '') +
      (sc === 'fini' ? result() : '');
    log.after(mine);
    const row = document.createElement('div');
    row.className = 'mk-input';
    const inert =
      sc === 'encours' ? ' aria-disabled="true" style="color:var(--ch-faint);box-shadow:none"' : '';
    row.innerHTML = `<button type="button" class="ch-btn mk-import" title="Importer un texte de référence…"${inert}>Texte de référence…</button><textarea class="ch-field ch-interview-field" rows="1" placeholder="Parlez de votre roman…"></textarea>`;
    field.after(row);
    const hint = document.createElement('p');
    hint.className = 'ch-interview-hint';
    hint.textContent =
      '↵ envoyer · ⇧↵ à la ligne · V X valider, rejeter la dernière proposition · ⇧⌘M libre / dirigé · Échap revenir au texte';
    row.after(hint);
    if (sc === 'fini') mine.scrollTop = mine.scrollHeight - mine.clientHeight - 150;
    else mine.scrollTop = mine.scrollHeight;
  };

  // ───── Style et voix ─────
  const STYLE_STATES = {
    // index → state on the page (after the import, before the author has sorted them)
    0: 'validated',
  };
  const workBlock = (empty) => `
    <div class="mk-work"><p class="mk-work-label ch-label ch-engraved">Le Compagnon</p>
      <button type="button" class="ch-btn mk-work-btn">${compas()}<span><b>Importer un texte…</b><small>Un livre que vous admirez, ou un des vôtres</small></span></button>
      <p class="mk-work-note">${
        empty
          ? 'Aucun texte lu pour l’instant.'
          : `Lu aujourd’hui à 14:32 : ${BOOK.title}<br><button type="button" class="ch-link">6 propositions</button> · <button type="button" class="ch-link">dans l’entretien</button> <kbd>⌘0</kbd>`
      }</p></div>`;
  const entries = (selected) => {
    const items = [
      { cat: 'Point de vue', text: CHOICES[0].text, st: 'validated' },
      { cat: 'Temps', text: 'Le présent de narration', st: 'validated' },
      ...CHOICES.slice(1).map((c) => ({ ...c, st: 'proposed' })),
    ];
    let html = '';
    for (const cat of CATS) {
      const inCat = items.filter((x) => x.cat === cat);
      if (!inCat.length) continue;
      html += `<li role="presentation" class="ch-atl-group ch-label">${cat}</li>`;
      for (const x of inCat) {
        const sel = x.text === selected;
        html += `<li role="option" aria-selected="${sel}" class="ch-atl-entry${x.st === 'proposed' ? ' is-proposed' : ''}"><span class="ch-atl-entry-text"><span class="ch-atl-entry-title">${x.text}</span></span></li>`;
      }
    }
    return html;
  };
  const fld = (label, value, status, meta = true) => {
    const m =
      status === 'proposed' && meta
        ? `<span>Proposée · d’après ${BOOK.title}</span><button type="button" class="ch-btn is-mentor">Valider <kbd>V</kbd></button><button type="button" class="ch-btn">Rejeter <kbd>X</kbd></button>`
        : '';
    return `<div class="ch-fld" data-status="${status}"><div class="ch-fl">${label}</div><div class="ch-fv" role="button" tabindex="0">${value}</div><div class="ch-fm">${m}</div></div>`;
  };
  const LEGEND = `<p class="ch-legend"><span aria-hidden="true"><i class="is-proposed"></i>en relief : proposée</span><span aria-hidden="true"><i class="is-validated"></i>gravée : validée</span><span aria-hidden="true"><i class="is-rejected"></i>estompée : rejetée</span><span aria-hidden="true"><i class="is-contradicted"></i>contredite</span></p>`;
  const USE =
    '<p class="ch-section-note">Le Compagnon s’en sert pour vous relire : il vous dit quand une scène s’en écarte, sans jamais vous corriger d’office.</p>';
  const sheet = (validated) => {
    if (validated)
      return `<article class="ch-sheet-body mk-sheet"><div class="ch-sheet-head">${med(DIAPASON, 46)}<h2 class="ch-sheet-title">${CHOICES[0].text}</h2></div>
        <p class="ch-sheet-lead">Point de vue · d’après ${BOOK.title}, ${BOOK.author}</p>${LEGEND}
        <div class="ch-sections"><section class="ch-section is-wide"><h3 class="ch-label ch-engraved">Le choix</h3>${USE}
        ${fld('Catégorie', 'Point de vue', 'validated')}${fld('Le choix', CHOICES[0].text, 'validated')}${fld('Mesure', CHOICES[0].measure, 'validated')}</section></div></article>`;
    const c = CHOICES[2];
    return `<article class="ch-sheet-body mk-sheet"><div class="ch-sheet-head is-proposed">${med(DIAPASON, 46, 'is-mentor')}<h2 class="ch-sheet-title">${c.text}</h2></div>
      <p class="ch-sheet-lead">Phrases · d’après ${BOOK.title}, ${BOOK.author}</p>${LEGEND}
      <div class="ch-sections"><section class="ch-section is-wide"><h3 class="ch-label ch-engraved">Le choix</h3>${USE}
      ${fld('Catégorie', 'Phrases', 'proposed', false)}${fld('Le choix', c.text, 'proposed')}${fld('Mesure', c.measure, 'proposed', false)}</section></div></article>`;
  };
  const empty = () => `<div class="mk-empty">${med(DIAPASON, 46)}<h2>Style et voix</h2>
    <p>Ici vivent vos choix d’écriture : le point de vue, le temps, la longueur des phrases, la part du dialogue, la façon d’ouvrir et de clore un chapitre.</p>
    <p>Importez un texte que vous admirez : le Compagnon en dégage les choix de style, et vous gardez ceux qui vous ressemblent. Vous pouvez aussi écrire les vôtres.</p>
    <p class="mk-small">Le texte importé n’est pas gardé, et rien n’en est cité.</p>
    <div class="mk-actions"><button type="button" class="ch-btn is-mentor is-lit">Importer un texte de référence…</button><button type="button" class="ch-btn">+ Nouveau choix <kbd>N</kbd></button></div></div>`;

  const page = () => {
    const rail = document.querySelector('.ch-atl-modules');
    const list = document.querySelector('.ch-atl-list');
    if (!rail || !list || list.querySelector('.mk-entries, .mk-work')) return;
    const mods = rail.querySelectorAll('.ch-atl-module');
    const last = mods[mods.length - 1];
    last.setAttribute('aria-selected', 'false');
    last.querySelector('.ch-medallion').classList.remove('is-active');
    const li = document.createElement('li');
    li.className = 'ch-atl-module';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'true');
    const isEmpty = S.screen === 'vide';
    li.innerHTML = `${med(DIAPASON, 30, 'is-active')}<span class="ch-atl-module-name">Style et voix</span>${isEmpty ? '' : '<span class="ch-atl-count">6</span>'}`;
    last.after(li);
    const hint = document.querySelector('.ch-atl-rail .ch-atl-hint');
    if (hint)
      hint.textContent = '⌘E écrire · ⌘0 entretien · ⌥⌘1…6 modules · Échap revenir au texte';
    list.querySelector('.ch-atl-new').textContent = '+ Nouveau choix';
    list.querySelector('.ch-atl-new').classList.add('mk-new');
    const ul = list.querySelector('.ch-atl-entries');
    ul.classList.add('mk-hide');
    const mine = document.createElement('ul');
    mine.className = 'mk-entries';
    mine.setAttribute('role', 'listbox');
    if (!isEmpty)
      mine.innerHTML = entries(S.screen === 'page-valide' ? CHOICES[0].text : CHOICES[2].text);
    ul.after(mine);
    mine.insertAdjacentHTML('afterend', workBlock(isEmpty));
    const body = document.querySelector('.ch-sheet-body');
    if (body) {
      body.classList.add('mk-hide');
      body.insertAdjacentHTML('afterend', isEmpty ? empty() : sheet(S.screen === 'page-valide'));
    }
    for (const f of document.querySelectorAll('.ch-footer-fit, .ch-footer-right span'))
      if (/pas disponible/.test(f.textContent)) f.textContent = '';
  };

  // ───── A remark that leans on a validated choice ─────
  const remark = () => {
    const prose = document.querySelector('.ch-prose');
    if (!prose || document.querySelector('.mk-note')) return;
    const paras = prose.querySelectorAll('p');
    const p = paras[Math.min(1, paras.length - 1)];
    const host = prose.closest('.ch-page, .ch-editor, .ch-write') || prose.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const top = p.getBoundingClientRect().top - host.getBoundingClientRect().top;
    const left = prose.getBoundingClientRect().right - host.getBoundingClientRect().left + 56;
    host.insertAdjacentHTML(
      'beforeend',
      `<aside class="ch-note ch-raised mk-note" style="top:${top}px;left:${left}px;animation:none" aria-label="Style">
        <p class="ch-note-head"><span class="ch-label">Style</span><span class="ch-note-signature">Le Compagnon</span></p>
        <p class="ch-note-title">Ce paragraphe passe au passé simple</p>
        <p class="ch-note-message">Le reste de la scène est au présent. Si le passage est un souvenir, le changement de temps le dit bien ; sinon, le lecteur risque de trébucher.</p>
        <button type="button" class="mk-choice" title="Ouvrir la fiche (Style et voix)"><span class="ch-label">Votre choix · Temps</span><span>Le présent de narration</span></button>
        <p class="ch-note-actions"><button type="button" class="ch-btn">Compris <kbd>⏎</kbd></button><button type="button" class="ch-btn">Ignorer <kbd>I</kbd></button></p>
      </aside>`,
    );
  };

  const place = () => {
    if (['entretien', 'confirmer', 'lecture', 'encours', 'fini', 'erreur'].includes(S.screen)) {
      entretien();
      for (const f of document.querySelectorAll('.ch-footer-fit, .ch-footer-right span'))
        if (/pas disponible/.test(f.textContent))
          f.textContent = S.screen === 'encours' ? `Le Compagnon lit ${BOOK.plain}… 0:14` : '';
    }
    if (['page', 'page-valide', 'vide'].includes(S.screen)) page();
    if (S.screen === 'remarque') remark();
  };
  place();
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
})();
