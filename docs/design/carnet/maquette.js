// Mock (DESIGN §4.5 « Carnet du Compagnon », phase 6.5): the Compagnon's notebook page in
// the Atelier, a note being corrected, the empty page, the quiet line under a reply in the
// Entretien and the way back to a note's message. Injected into the real app.
// window.CARNET = { screen: 'page' | 'corriger' | 'vide' | 'entretien' | 'origine' | 'fil' |
// 'fil-panneau' }: the last two show the single thread (1.18), the Entretien and the
// conversation as two views of it, each folding what was said in the other mode.
(() => {
  const S = Object.assign({ screen: 'page' }, window.CARNET);
  const css = `
  .mk-hide{display:none!important}
  .mk-cn{flex:1;min-height:0;overflow-y:auto;padding:4px 10px 18px}
  .mk-cn-tools{display:flex;align-items:center;gap:10px;margin:2px 0 4px}
  .mk-cn-tools .ch-filter{flex:1}
  .mk-new{flex:none;padding:6px 11px}
  .mk-new kbd,.mk-note-actions kbd,.mk-edit-actions kbd,.mk-empty kbd{margin-left:4px;color:var(--ch-faint);font:inherit}
  .mk-book{display:flex;align-items:baseline;gap:10px;margin:22px 0 2px}
  .mk-book:first-child{margin-top:8px}
  .mk-book h3{margin:0;color:var(--ch-ink-2);font:500 19px/1.3 var(--ch-font-text);font-variant-caps:all-small-caps;letter-spacing:.04em}
  .mk-book h3 cite{font-style:italic;font-variant-caps:normal;letter-spacing:0;font-weight:400;font-size:16px}
  .mk-book span{flex:1;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-kind{display:flex;align-items:center;gap:10px;margin:14px 2px 6px;color:var(--ch-muted)}
  .mk-kind::after{content:'';flex:1;height:0;border-top:1px solid var(--ch-shade);border-bottom:1px solid var(--ch-highlight)}
  .mk-note{position:relative;display:grid;grid-template-columns:1fr auto;gap:2px 14px;margin:0 0 6px;padding:10px 14px;border-radius:var(--ch-radius-md)}
  .mk-note h4{margin:0;color:var(--ch-mentor);font:400 16px/1.35 var(--ch-font-text)}
  .mk-note p{grid-column:1;margin:0;color:var(--ch-ink-2);font:13.5px/1.55 var(--ch-font-ui)}
  .mk-note .mk-meta{margin-top:4px;color:var(--ch-faint);font:11px/1.4 var(--ch-font-ui)}
  .mk-meta .ch-link{color:var(--ch-muted);font:inherit;text-decoration:underline;text-decoration-color:var(--ch-shade);text-underline-offset:2px}
  .mk-meta q{quotes:'«\\00a0' '\\00a0»'}
  .mk-note.is-new h4::before{content:'';display:inline-block;width:6px;height:6px;margin:0 8px 2px 0;border-radius:50%;background:var(--ch-mentor);vertical-align:middle}
  .mk-note.is-new .mk-fresh{color:var(--ch-mentor)}
  .mk-note.is-mine{box-shadow:var(--ch-inset),inset 2px 0 0 color-mix(in srgb,var(--ch-author) 70%,transparent)}
  .mk-note.is-mine h4{color:var(--ch-ink)}
  .mk-note.is-focus{box-shadow:var(--ch-raise-s);background:var(--ch-bg)}
  .mk-note.is-mine.is-focus{box-shadow:var(--ch-raise-s),inset 2px 0 0 color-mix(in srgb,var(--ch-author) 70%,transparent)}
  .mk-note.is-reply{margin-left:2.2rem}
  .mk-note-actions{grid-column:2;grid-row:1 / span 3;display:flex;flex-direction:column;align-items:stretch;gap:4px;align-self:start}
  .mk-note-actions .ch-btn{justify-content:space-between;padding:4px 9px;font-size:12px}
  .mk-trash{margin:22px 2px 0;padding-top:10px;border-top:1px solid var(--ch-shade);color:var(--ch-muted);font:11.5px var(--ch-font-ui)}
  .mk-trash .ch-link{color:var(--ch-muted);font:inherit}
  /* Correcting a note */
  .mk-edit{display:flex;flex-direction:column;gap:8px;margin:0 0 6px;padding:12px 14px;border-radius:var(--ch-radius-md);box-shadow:var(--ch-raise-s);background:var(--ch-bg)}
  .mk-edit-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .mk-edit-row .ch-label{color:var(--ch-muted);min-width:4.6rem}
  .mk-edit .ch-seg button{flex:none;padding:3px 9px;font-size:12px}
  .mk-edit input,.mk-edit textarea{width:100%;box-sizing:border-box;border:0;border-radius:var(--ch-radius-sm);background:var(--ch-bg);box-shadow:var(--ch-inset),inset 2px 0 0 var(--ch-author);color:var(--ch-ink);padding:7px 10px;resize:none}
  .mk-edit input{font:400 16px/1.35 var(--ch-font-text)}
  .mk-edit textarea{font:13.5px/1.55 var(--ch-font-ui);min-height:4.4em}
  .mk-edit-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .mk-edit-foot small{flex:1;color:var(--ch-muted);font:11px/1.4 var(--ch-font-ui)}
  .mk-edit-actions .ch-btn{padding:4px 10px}
  .mk-edit-actions .is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  /* Empty page */
  .mk-empty{margin:26px 0 0;max-width:36rem}
  .mk-empty p{margin:0 0 8px;color:var(--ch-ink-2);font:14px/1.6 var(--ch-font-ui)}
  .mk-empty p.mk-quiet{color:var(--ch-muted);font-size:12.5px}
  .mk-empty-actions{display:flex;gap:8px;margin-top:14px}
  .mk-empty-actions .ch-btn{padding:6px 12px}
  .mk-empty-actions .is-lit{background:var(--ch-lit-bg);box-shadow:var(--ch-lit)}
  /* Under a reply: the quiet line */
  .mk-noted{display:flex;align-items:center;gap:6px;margin:6px 0 0;color:var(--ch-faint);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-noted svg{flex:none;color:var(--ch-faint)}
  .mk-noted .ch-link{color:var(--ch-muted);font:inherit;text-decoration:underline;text-decoration-color:var(--ch-shade);text-underline-offset:2px}
  .mk-log{flex:1;min-height:0;overflow-y:auto;padding:4px 10px 10px}
  .mk-origin{box-shadow:var(--ch-inset),0 0 0 2px var(--ch-mentor-soft)!important;background:var(--ch-mentor-soft)}
  .mk-back{display:flex;align-items:center;gap:10px;margin:0 0 4px;padding:7px 12px;border-radius:var(--ch-radius-md);box-shadow:var(--ch-raise-s);color:var(--ch-ink-2);font:12px/1.4 var(--ch-font-ui)}
  .mk-back span{flex:1}
  .mk-back b{color:var(--ch-mentor);font-weight:500}
  .mk-back .ch-btn{padding:3px 9px;font-size:12px}
  .mk-back kbd{margin-left:4px;color:var(--ch-faint);font:inherit}

  /* The single thread (1.18): what was said in the other mode, folded */
  .mk-fold{display:flex;align-items:center;gap:8px;width:100%;margin:18px 0;padding:5px 8px;border:0;border-radius:var(--ch-radius-sm);background:transparent;color:var(--ch-muted);font:12px/1.4 var(--ch-font-ui);text-align:left;cursor:pointer}
  .mk-fold:hover{box-shadow:var(--ch-raise-s)}
  .mk-fold svg{flex:none;color:var(--ch-faint)}
  .mk-fold small{color:var(--ch-faint);font:inherit}
  .mk-fold::after{content:'';flex:1;height:0;margin-left:6px;border-top:1px solid var(--ch-shade);border-bottom:1px solid var(--ch-highlight)}
  .mk-fold .mk-chev{color:var(--ch-faint)}
  .mk-open{margin:18px 0}
  .mk-open .mk-fold{margin:0 0 8px}
  .mk-open .mk-fold::after{display:none}
  .mk-open .mk-fold .mk-go{margin-left:auto;color:var(--ch-ink-2)}
  .mk-open .mk-fold .mk-go kbd{margin-left:4px;color:var(--ch-faint);font:inherit}
  .mk-open-body{margin-left:15px;padding:2px 0 2px 16px;border-left:1px solid var(--ch-shade);box-shadow:-1px 0 0 var(--ch-highlight)}
  .mk-open-body .ch-turn-text{color:var(--ch-ink-2)}
  .mk-open-body .mk-cond{margin:2px 0 0;color:var(--ch-muted);font:11.5px/1.4 var(--ch-font-ui)}
  .mk-go-line{margin:0 0 4px!important}
  .mk-go-line .ch-link{color:var(--ch-ink-2);font:inherit}
  .mk-go-line kbd{color:var(--ch-faint);font:inherit}
  .ch-transcript .mk-fold{margin:12px 0;font-size:11.5px}
  .ch-transcript .mk-open{margin:12px 0}
  .ch-transcript .mk-open-body{margin-left:12px;padding-left:12px}
  .ch-transcript .mk-open-body .ch-turn-text{font-size:13px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const svg = (d, size) =>
    `<svg class="ch-picto" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // The pictogram: a notebook held shut by its elastic band (docs/design/pictos/carnet.svg).
  const CARNET =
    '<path d="M6.5 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5zM15 3.5v17M8 8.5h4M8 11.5h4"/>';
  const med = (size, mentor = true) =>
    `<span class="ch-medallion${mentor ? ' is-mentor' : ''}" style="width:${size}px;height:${size}px">${svg(CARNET, size === 46 ? 24 : 17)}</span>`;

  // ───── The notes ─────
  const who = (n) =>
    n.mine === 'corrected'
      ? `Corrigée par vous · ${n.when}`
      : n.mine === 'written'
        ? `Écrite par vous · ${n.when}`
        : `Le Compagnon · ${n.when}`;
  const from = (n) =>
    !n.from
      ? ''
      : n.elsewhere
        ? ` · d’après ${n.from} de <cite>${n.elsewhere}</cite>`
        : ` · d’après <button type="button" class="ch-link">${n.from}</button>`;
  const PROJECT = [
    {
      kind: 'À reprendre',
      notes: [
        {
          id: 'nantes',
          title: 'Ce qui attend Hélène à Nantes',
          text: 'Vous n’avez pas encore décidé : un acheteur pour le bateau, ou son frère Paul. Vous voulez y revenir en écrivant le troisième acte.',
          when: 'aujourd’hui à 14:32',
          from: 'l’entretien',
          fresh: true,
        },
      ],
    },
    {
      kind: 'Décisions',
      notes: [
        {
          title: 'La fin reste ouverte',
          text: 'Le roman s’arrête quand Hélène aperçoit Nantes. On ne saura pas si elle vend le bateau.',
          when: 'hier à 18:05',
          from: 'l’entretien',
          mine: 'corrected',
        },
        {
          title: 'Une arrivée à Nantes ?',
          text: 'Vous avez envisagé une dernière scène sur le quai de la Fosse, Hélène face à l’acheteur.',
          when: 'hier à 21:40',
          from: 'la conversation',
          reply: 'La fin reste ouverte',
        },
        {
          title: 'Le présent, du côté d’Hélène',
          text: 'Tout est raconté au présent, au plus près d’Hélène, sans narrateur plus âgé qui se souvient.',
          when: 'le 12 nov.',
          from: 'la conversation',
        },
      ],
    },
    {
      kind: 'Histoire',
      notes: [
        {
          id: 'grand-pere',
          title: 'Le grand-père batelier',
          text: 'Le roman vient de votre grand-père, marinier de Loire jusqu’en 1930 ; vous gardez son livret. Hélène lui doit son métier, pas sa vie.',
          when: 'le 14 nov.',
          from: 'l’entretien',
        },
      ],
    },
    {
      kind: 'Doutes',
      notes: [
        {
          title: 'Le père prend trop de place',
          text: 'Vous craignez que les souvenirs du père ralentissent le voyage. Vous les voulez courts, jamais plus d’une page.',
          when: 'le 15 nov.',
          from: 'Faire le point · Hélène',
        },
      ],
    },
  ];
  const AUTHOR = [
    {
      kind: 'Accompagnement',
      notes: [
        {
          title: 'Une question à la fois',
          text: 'Vous préférez des remarques courtes, et une seule question à la fin d’une réponse.',
          when: 'le 3 nov.',
          from: 'l’entretien',
          elsewhere: 'Le Phare des Sept-Îles',
        },
        {
          title: 'Pas d’exemple avant le premier jet',
          text: 'Pas de phrase d’exemple tant que je n’ai pas fini le premier jet d’une scène.',
          when: 'le 9 nov.',
          mine: 'written',
        },
      ],
    },
    {
      kind: 'Façon d’écrire',
      notes: [
        {
          title: 'Le matin, par scènes courtes',
          text: 'Vous écrivez le matin, une scène à la fois, et revenez à la structure le soir.',
          when: 'le 10 nov.',
          from: 'la conversation',
          elsewhere: 'Le Phare des Sept-Îles',
        },
      ],
    },
  ];

  const actions = (n) =>
    `<span class="mk-note-actions"><button type="button" class="ch-btn">Corriger <kbd>⏎</kbd></button>${
      n.mine ? '' : '<button type="button" class="ch-btn">Garder <kbd>V</kbd></button>'
    }<button type="button" class="ch-btn">Corbeille <kbd>⌫</kbd></button></span>`;
  const note = (n, focus) => {
    const cls = `mk-note${n.mine ? ' is-mine' : ''}${n.fresh ? ' is-new' : ''}${focus ? ' is-focus' : ''}${n.reply ? ' is-reply' : ''}`;
    const reply = n.reply ? ` · revient sur votre note <q>${n.reply}</q>` : '';
    const fresh = n.fresh ? ' · <span class="mk-fresh">nouvelle</span>' : '';
    return `<article class="${cls}" tabindex="-1" aria-label="${n.mine ? 'Votre note' : 'Note du Compagnon'} : ${n.title}"><h4>${n.title}</h4>${
      focus ? actions(n) : ''
    }<p>${n.text}</p><p class="mk-meta">${who(n)}${from(n)}${reply}${fresh}</p></article>`;
  };
  const edit = (n) => `
    <div class="mk-edit" role="group" aria-label="Corriger la note">
      <input value="${n.title}" aria-label="Titre de la note" />
      <textarea rows="2" aria-label="Texte de la note">Vous n’avez pas encore décidé : un acheteur pour le bateau, ou son frère Paul. Plutôt Paul, je crois. J’y reviendrai en écrivant le troisième acte.</textarea>
      <div class="mk-edit-row"><span class="ch-label">Nature</span><div class="ch-seg" role="group">${[
        'Histoire',
        'Intention',
        'Décision',
        'Doute',
        'À reprendre',
        'Accompagnement',
        'Façon d’écrire',
      ]
        .map(
          (k) =>
            `<button type="button"${k === 'À reprendre' ? ' class="is-on"' : ''}>${k}</button>`,
        )
        .join('')}</div></div>
      <div class="mk-edit-row"><span class="ch-label">Carnet</span><div class="ch-seg" role="group"><button type="button" class="is-on">Ce roman</button><button type="button">Vous</button></div></div>
      <div class="mk-edit-foot"><small>Corrigée, cette note devient la vôtre : le Compagnon la lit, il ne la réécrit plus.</small>
      <span class="mk-edit-actions"><button type="button" class="ch-btn is-author is-lit">Enregistrer <kbd>⌘⏎</kbd></button> <button type="button" class="ch-btn">Annuler <kbd>Échap</kbd></button></span></div>
    </div>`;
  const book = (title, sub, groups, opts = {}) => {
    const count = groups.reduce((s, g) => s + g.notes.length, 0);
    return `<div class="mk-book"><h3>${title}</h3><span>${count} notes · ${sub}</span></div>${groups
      .map(
        (g) =>
          `<p class="mk-kind ch-label">${g.kind}</p>${g.notes
            .map((n) =>
              opts.edit && opts.edit === n.id
                ? edit(n)
                : note(n, !!opts.focus && opts.focus === n.id),
            )
            .join('')}`,
      )
      .join('')}`;
  };
  const carnet = () => {
    const page = document.querySelector('.ch-interview');
    if (!page || page.querySelector('.mk-cn')) return;
    // Header: medallion, title, line, then « + Nouvelle note » in place of Libre | Dirigé.
    page.querySelector('.ch-interview-head .ch-medallion').outerHTML = med(46);
    page.querySelector('.ch-interview-title h2').textContent = 'Carnet';
    page.querySelector('.ch-interview-title p').textContent =
      'Ce que le Compagnon retient de vos échanges. Il le relit avant chaque réponse.';
    const modes = page.querySelector('.ch-interview-modes');
    modes.classList.add('mk-hide');
    modes.insertAdjacentHTML(
      'afterend',
      '<button type="button" class="ch-btn mk-new">+ Nouvelle note <kbd>N</kbd></button>',
    );
    page.querySelector('.ch-interview-log').classList.add('mk-hide');
    page.querySelector('.ch-interview-entry').classList.add('mk-hide');
    const hint = page.querySelector('.ch-interview-hint');
    if (hint) hint.classList.add('mk-hide');
    const box = document.createElement('div');
    box.className = 'mk-cn';
    if (S.screen === 'vide') {
      box.innerHTML = `<div class="mk-empty">
        <p>Le Compagnon note ici ce qu’il retient de vos échanges : votre histoire, vos décisions, vos doutes, ce qu’il faudra reprendre, la façon dont vous aimez être accompagné. Il relit ce carnet avant chaque réponse, dans l’entretien comme dans la conversation.</p>
        <p class="mk-quiet">Corrigez ou mettez à la corbeille ce qui ne vous ressemble pas : une note que vous corrigez devient la vôtre, et il ne la réécrit plus. Ce qui vous suit d’un roman à l’autre va dans le carnet «&nbsp;Vous&nbsp;».</p>
        <div class="mk-empty-actions"><button type="button" class="ch-btn is-mentor is-lit">Ouvrir l’entretien <kbd>⌘0</kbd></button><button type="button" class="ch-btn">+ Nouvelle note <kbd>N</kbd></button></div></div>`;
    } else {
      const editing = S.screen === 'corriger';
      box.innerHTML = `
        <div class="mk-cn-tools"><div class="ch-filter"><input class="ch-field" placeholder="Chercher dans le carnet…" aria-label="Chercher dans le carnet" /><kbd class="ch-filter-key">/</kbd></div></div>
        ${book('Ce roman', 'relu dans <cite>Avant Nantes</cite>', PROJECT, editing ? { edit: 'nantes' } : { focus: 'grand-pere' })}
        ${book('Vous', 'relu dans tous vos romans', AUTHOR)}
        <p class="mk-trash"><button type="button" class="ch-link">Corbeille (2)</button> · notes que le Compagnon ne relit plus et ne réécrira pas</p>`;
    }
    page.querySelector('.ch-interview-log').after(box);
    const foot = document.createElement('p');
    foot.className = 'ch-interview-hint';
    foot.textContent = editing()
      ? '⌘↵ enregistrer · Échap annuler'
      : 'J K parcourir · ↵ corriger · V garder telle quelle · ⌫ corbeille · O voir l’échange · N nouvelle note · / chercher · Échap revenir au texte';
    if (S.screen !== 'vide') box.after(foot);
  };
  const editing = () => S.screen === 'corriger';

  // ───── Rail: « Carnet » under the Entretien, before the rule ─────
  const rail = () => {
    const first = document.querySelector('.ch-atl-module.is-interview');
    if (!first || document.querySelector('.mk-rail')) return;
    const li = first.cloneNode(true);
    li.classList.add('mk-rail');
    li.querySelector('.ch-medallion').outerHTML = med(30);
    li.querySelector('.ch-atl-module-name').textContent = 'Carnet';
    const onCarnet = !['entretien', 'origine', 'fil'].includes(S.screen);
    li.setAttribute('aria-selected', String(onCarnet));
    first.setAttribute('aria-selected', String(!onCarnet));
    first.after(li);
    const hint = document.querySelector('.ch-atl-rail .ch-atl-hint');
    if (hint)
      hint.textContent =
        '⌘E écrire · ⌘0 entretien · ⌥⌘7 carnet · ⌥⌘1…6 modules · Échap revenir au texte';
  };

  // ───── Entretien: the line under a reply, and the way back from a note ─────
  const whoLabel = `<p class="ch-label ch-interview-who">Le Compagnon</p>`;
  const noted = (titles) =>
    `<p class="mk-noted">${svg(CARNET, 13)}<span>Noté au carnet : ${titles
      .map((t) => `<button type="button" class="ch-link">${t}</button>`)
      .join(', ')}</span></p>`;
  const entretien = () => {
    const page = document.querySelector('.ch-interview');
    if (!page || page.querySelector('.mk-log')) return;
    const log = page.querySelector('.ch-interview-log');
    log.classList.add('mk-hide');
    page.querySelector('.ch-interview-field').disabled = false;
    for (const b of page.querySelectorAll('.ch-interview-modes button')) b.disabled = false;
    const origin = S.screen === 'origine';
    const mine = document.createElement('div');
    mine.className = 'mk-log';
    mine.innerHTML = `
      ${origin ? '<div class="mk-back"><span>La note <b>Le grand-père batelier</b> vient de ce message, le 14 nov.</span><button type="button" class="ch-btn">Revenir au carnet <kbd>Échap</kbd></button></div>' : ''}
      <p class="ch-interview-author${origin ? ' mk-origin' : ''}">L’idée vient de mon grand-père. Il a été marinier sur la Loire jusqu’en 1930, j’ai encore son livret. Mais Hélène n’est pas lui : je lui prête son métier, pas sa vie.</p>
      <div class="ch-interview-turn is-compagnon">${whoLabel}<p class="ch-interview-say">Je range le métier de marinier dans Personnages, sur la fiche d’Hélène. Et d’elle-même, qu’a-t-elle gardé de son père ?</p>${origin ? noted(['Le grand-père batelier']) : ''}</div>
      ${
        origin
          ? ''
          : `<p class="ch-interview-author">Je ne sais pas encore ce qui l’attend à Nantes. Un acheteur pour le bateau, ou son frère Paul. J’y reviendrai en écrivant le troisième acte.</p>
      <div class="ch-interview-turn is-compagnon">${whoLabel}<p class="ch-interview-say">C’est une vraie question, et elle peut attendre : je la note pour la reprendre avec vous au troisième acte. En attendant, le voyage n’en dépend pas. Qu’est-ce qui pourrait l’arrêter avant Nantes ?</p>${noted(['Ce qui attend Hélène à Nantes'])}</div>`
      }`;
    log.after(mine);
  };

  // ───── The single thread: each view folds the other mode's exchanges ─────
  const COMPAS =
    '<circle cx="12" cy="5" r="1.7"/><path d="M11.3 6.6 6 20M12.7 6.6 18 20M8.3 14.5h7.4"/>';
  const BULLE = '<path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>';
  const fold = (picto, label, when, open = false, go = '') =>
    `<button type="button" class="mk-fold" aria-expanded="${open}">${svg(picto, 14)}<span>${label} <small>· ${when}</small></span><span class="mk-chev" aria-hidden="true">${open ? '⌄' : '›'}</span>${go}</button>`;
  const turn = (me, text, extra = '') =>
    `<div class="ch-turn${me ? '' : ' is-compagnon'}"><p class="ch-turn-who ch-label">${me ? 'Vous' : 'Le Compagnon'}</p><p class="ch-turn-text">${text}</p>${extra}</div>`;
  const fil = () => {
    const page = document.querySelector('.ch-interview');
    if (!page || page.querySelector('.mk-log')) return;
    const log = page.querySelector('.ch-interview-log');
    log.classList.add('mk-hide');
    page.querySelector('.ch-interview-field').disabled = false;
    for (const b of page.querySelectorAll('.ch-interview-modes button')) b.disabled = false;
    const mine = document.createElement('div');
    mine.className = 'mk-log';
    mine.innerHTML = `
      <p class="ch-interview-author">L’idée vient de mon grand-père. Il a été marinier sur la Loire jusqu’en 1930, j’ai encore son livret. Mais Hélène n’est pas lui : je lui prête son métier, pas sa vie.</p>
      <div class="ch-interview-turn is-compagnon">${whoLabel}<p class="ch-interview-say">Je range le métier de marinier dans Personnages, sur la fiche d’Hélène. Et d’elle-même, qu’a-t-elle gardé de son père ?</p></div>
      ${fold(COMPAS, '5 échanges dans la conversation', 'le 15 nov., scènes II.1 et II.2')}
      ${fold(COMPAS, 'Bilan de la structure', 'hier à 17:10')}
      <div class="mk-open">${fold(COMPAS, '2 échanges dans la conversation', 'hier, scène III.1', true, '<span class="mk-go">Ouvrir dans la conversation <kbd>⌘L</kbd></span>')}
        <div class="mk-open-body">
          ${turn(true, 'Je me demande si elle ne devrait pas arriver à Nantes, finalement. Une dernière scène sur le quai de la Fosse, face à l’acheteur.')}
          ${turn(false, 'C’est possible, mais vous m’aviez dit vouloir une fin ouverte : on ne saura pas si elle vend le bateau. Une arrivée sur le quai trancherait la question. Voulez-vous la trancher ?', noted(['Une arrivée à Nantes ?']))}
        </div></div>
      <p class="ch-interview-author">Je garde la fin ouverte. Mais je ne sais pas encore ce qui l’attend à Nantes : un acheteur, ou son frère Paul.</p>
      <div class="ch-interview-turn is-compagnon">${whoLabel}<p class="ch-interview-say">Alors la question peut attendre le troisième acte, et la fin reste ouverte comme vous le disiez hier dans la conversation. Qu’est-ce qui pourrait arrêter Hélène avant Nantes ?</p>${noted(['Ce qui attend Hélène à Nantes'])}</div>`;
    log.after(mine);
    mine.scrollTop = mine.scrollHeight;
  };
  const filPanneau = () => {
    const tr = document.querySelector('.ch-transcript');
    if (!tr || tr.querySelector('.mk-fold')) return;
    tr.querySelector('.ch-transcript-empty')?.classList.add('mk-hide');
    const field = document.querySelector('.ch-chat-field');
    if (field) field.disabled = false;
    tr.insertAdjacentHTML(
      'beforeend',
      `${fold(BULLE, '9 échanges dans l’entretien', 'du 12 au 14 nov.')}
      <div class="mk-open">${fold(BULLE, '2 échanges dans l’entretien', 'aujourd’hui', true)}
        <div class="mk-open-body">
          ${turn(true, 'Je garde la fin ouverte. Mais je ne sais pas encore ce qui l’attend à Nantes : un acheteur, ou son frère Paul.')}
          ${turn(false, 'Alors la question peut attendre le troisième acte, et la fin reste ouverte comme vous le disiez hier dans la conversation. Qu’est-ce qui pourrait arrêter Hélène avant Nantes ?', '<p class="mk-cond">1 proposition rangée dans Structure ›</p>')}
          <p class="mk-cond mk-go-line"><button type="button" class="ch-link">Ouvrir dans l’entretien</button> <kbd>⌘0</kbd></p>
        </div></div>
      ${turn(true, 'Et ici, la scène de l’écluse : elle peut l’arrêter ?')}
      ${turn(false, 'Oui, et c’est ce que vous cherchiez tout à l’heure dans l’entretien : un obstacle avant Nantes. L’éclusier fermé par la crue l’arrête une nuit entière ; la scène peut porter ce retard.')}`,
    );
    tr.scrollTop = tr.scrollHeight;
  };

  const apply = () => {
    rail();
    if (S.screen === 'fil') fil();
    else if (S.screen === 'fil-panneau') filPanneau();
    else if (['entretien', 'origine'].includes(S.screen)) entretien();
    else carnet();
  };
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
})();
