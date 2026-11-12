# Charpentier : design language

- **Version** : 1.1 (12 novembre 2026). 1.1 : tout devient découvrable sans raccourci (§4.8, §5.1), après essai de l'app par l'auteur ; inventaire et directions comparées dans [design/decouverte.md](design/decouverte.md).
- **Direction retenue** : **Perle**, avec **Deux encres** et **Signature** ; manuscrit en **tiroir + vue d'ensemble** ; points d'entrée en **poignées** sur les bords et **zone de commande** en pied.
- **Sources** : brief de l'auteur ([design/brief.md](design/brief.md)), maquettes ([design/mockups/](design/mockups/), ouvrir `index.html`), tokens CSS proposés ([design/tokens.css](design/tokens.css)).
- Complète la [SPEC](SPEC.md) (§6 mentor, §7.1 statuts, §19 exigences transverses) sans la contredire.

---

## 1. Principes

1. **La page est plate, les outils sont en relief.** Le texte n'est jamais dans une boîte : il est posé sur le fond. Tout ce qui sert à travailler (panneaux, notes, fiches, boutons, ligne de commande) est sculpté dans la même matière, en neumorphisme doux.
2. **Deux voix, deux encres.** Le **vermillon** (crayon de charpentier) marque ce qui est à l'auteur : curseur, sélection, élément actif, décisions validées. Le **bleu de Prusse** marque tout ce qui vient du Compagnon. Aucune autre couleur porteuse de sens.
3. **Le relief dit le statut.** En relief = proposé, à prendre ; gravé = validé, acquis ; estompé = rejeté ; gravé + médaillon « ! » = contredit. Le statut ne dépend jamais de la seule couleur.
4. **Le Compagnon respire dans la marge.** Ses remarques apparaissent quand vous marquez une pause, se déplient à côté du passage, se replient quand vous repartez. Rien ne recouvre le texte, rien ne clignote, aucune notification.
5. **Une typographie d'éditeur.** Literata pour le roman et pour tout ce qui « parle livre » (titres, libellés en petites capitales, ouverture de scène) ; Inter, petite et discrète, pour l'outillage.
6. **Clavier d'abord, rien de caché.** Tout outil a un point d'entrée visible (poignée, bouton, menu) qui affiche son raccourci : on le trouve à la souris, on l'apprend en passant, on finit au clavier. Ces points d'entrée sont discrets au repos et s'effacent pendant la frappe ; `Échap` ramène toujours au texte.
7. **Esthétique d'abord, lisibilité préservée.** Contrastes doux assumés pour l'outillage (choix de l'auteur), mais le texte du roman, l'encre de l'auteur et l'accent du Compagnon restent au-dessus de 4,5:1.
8. **Hors ligne, toujours.** Polices embarquées, sons synthétisés ou embarqués, aucune ressource réseau.

Anti-références : look « tableau de bord », surcharge à la Scrivener, chatbot qui se rappelle à vous, skeuomorphisme de cuir et de bois.

## 2. Le Compagnon

- **Nom** : le Compagnon (le compagnon charpentier qui transmet le métier). Réponse à la question ouverte n°4 de la SPEC §22, à reporter au journal des décisions.
- **Voix** : vouvoie l'auteur ; exigeant mais bienveillant ; pose des questions plutôt que de trancher (pédagogie socratique, SPEC §6.5) ; chaque remarque a son « pourquoi » (principe n°5). Sait aussi signaler ce qui fonctionne.
- **Signature visuelle** : son nom, en italique Literata, en tête de chaque note ; son encre, le bleu de Prusse.
- **Refus d'écrire** : formulé sans sécheresse (« Je n'écrirai pas votre scène : c'est votre voix qui compte »), suivi d'une piste et, au plus, d'**une phrase d'exemple** dans un bloc gravé étiqueté « Exemple · une phrase », insérable seulement par action explicite (`⌘⏎`, [D-11]).

## 3. Tokens

Valeurs normatives dans [design/tokens.css](design/tokens.css) (préfixe `--ch-`, cohérent avec `packages/core/src/styles/base.css`).

### 3.1 Couleurs

| Rôle | Token | Clair | Sombre | Contraste sur le fond (clair / sombre) |
|---|---|---|---|---|
| Fond, matière unique | `--ch-bg` | `#e3e7ed` | `#262a31` | – |
| Texte du roman, titres | `--ch-ink` | `#22262d` | `#dfe3ea` | 12,2 / 11,2 |
| Texte d'interface | `--ch-ink-2` | `#474d57` | `#b9c0ca` | 6,9 / 7,9 |
| Méta, libellés discrets | `--ch-muted` | `#7a828e` | `#8a929e` | 3,1 / 4,6 |
| Indications de raccourcis, vides | `--ch-faint` | `#a6adb8` | `#5d6470` | 1,8 / 2,4 (décoratif) |
| Lumière du relief | `--ch-highlight` | `#ffffff` | `#323740` | – |
| Ombre du relief | `--ch-shade` | `#b3becc` | `#1a1d22` | – |
| Encre du Compagnon (bleu de Prusse) | `--ch-mentor` | `#1f4f7c` | `#86aedb` | 6,9 / 6,2 |
| Lavis du Compagnon (passage ancré) | `--ch-mentor-soft` | 10 % | 13 % | – |
| Encre de l'auteur (vermillon) | `--ch-author` | `#b2432a` | `#e3876a` | 4,5 / 5,5 |
| Sélection | `--ch-author-soft` | 22 % | 24 % | – |

Thème : suit le système par défaut, forçable (`data-theme` sur la racine) et basculable au clavier. Le sombre est un vrai neumorphisme sombre (lumière `#323740`, ombre `#1a1d22`), jamais un noir pur.

### 3.2 Typographie

| Usage | Famille | Taille | Détails |
|---|---|---|---|
| Texte de scène | Literata | 19 px (réglable 15–26) | interlignage 1,68 ; mesure 38 rem ≈ 66 signes (réglable 30–48) ; alinéa 1,6 em sauf premier paragraphe ; césure automatique ; aligné à gauche |
| Ouverture de scène | Literata | chiffre romain 2,6 rem en vermillon ; chapitre en petites capitales espacées ; fleuron `⁂` ; titre de scène en italique | visible en haut de scène, défile avec le texte |
| En-tête de scène (fixe) | Literata | 14,5 px | chapitre en petites capitales, scène en italique vermillon, variante en petites capitales pâles |
| Libellés (sections, types de remarque, groupes) | Literata | 13,5 px | `all-small-caps`, interlettrage 0,08 em, graisse 500 (classe `.ch-label`) |
| Titres de fiche | Literata | 30 px (24 px en volet) | graisse 500 |
| Valeurs de fiche | Literata | 15,5 px | italique si proposée |
| Interface courante | Inter | 13 px (méta 12, accent 14, ligne de commande 15) | graisse 400/500, jamais de capitales |
| Raccourcis | Inter | 10,5–11 px | `--ch-faint`, après le libellé de l'action |

Polices : **Literata** (TypeTogether, SIL OFL 1.1, variable `opsz` + `wght`, build complet avec petites capitales `smcp`/`c2sc`) et **Inter** (SIL OFL 1.1, variable). Embarquées en WOFF2, sous-ensemble latin + latin étendu, en vérifiant la présence de U+00A0, U+202F, « », —, ’, `⁂`. L'OFL n'est pas dans la liste blanche de `CLAUDE.md` : à ajouter comme licence acceptée (ou exception documentée dans `licenses.exceptions.json`) au moment de l'intégration.

Typographie française du texte : espaces fines insécables avant `? ! ; :` et dans les guillemets, tirets cadratins de dialogue, apostrophe typographique. Le séparateur interne de scène se compose comme un fleuron centré `⁂` en `--ch-faint`.

### 3.3 Espacements, rayons, relief

- Espacements : base 4 px (`--ch-space-1` à `-8` : 4, 8, 12, 16, 20, 24, 32, 48).
- Rayons : 22 px (panneaux, feuilles), 14 px (cartes, notes, champs, contrôles segmentés), 9 px (boutons, lignes, puces, valeurs de fiche), cercle (pastilles).
- Relief, trois niveaux seulement :
  - `--ch-raise` (6 px / flou 14) : panneaux, notes, feuille de résultats, cartes de la vue d'ensemble ;
  - `--ch-raise-s` (3 px / flou 7) : boutons, cartes de points, puces, valeurs proposées, pastilles ;
  - `--ch-inset` (3 px / flou 7, creux) : champs de saisie, élément sélectionné ou actif, bouton pressé, valeur validée.
- Le fond de tous les éléments en relief est `--ch-bg` : la forme naît de l'ombre, pas d'un aplat.

### 3.4 Mouvement et son

| Événement | Durée | Remarque |
|---|---|---|
| Pression d'un bouton (relief → creux) | 120 ms | |
| Note du Compagnon qui se déplie | 220 ms | glisse de 8 px depuis la pastille |
| Panneau, tiroir, ligne de commande | 300 ms | glisse depuis son bord |
| Vue d'ensemble, Atelier | 340 ms | léger zoom arrière (1,03 → 1) |
| Changement de statut (relief ↔ gravé) | 350 ms | c'est l'animation signature : la proposition « s'enfonce » quand on la valide |
| Apparition d'une pastille | 500 ms | après une pause de frappe de 1,5 s minimum |

Courbe unique `cubic-bezier(0.2, 0.7, 0.2, 1)`. **Rien ne bouge pendant la frappe.** Respect de `prefers-reduced-motion` et interrupteur « Réduire les animations » dans l'app (tous les tokens de durée à 0).

Sons : **désactivés par défaut**, discrets, hors ligne. Un déclic clair à la validation, un toc plus grave au rejet et à la fermeture, un tic léger à l'ouverture d'une note. Option séparée, également désactivée, pour un son de frappe. Jamais de son pour signaler une remarque du Compagnon.

## 4. Composants

### 4.1 Surface d'écriture
- **Page plate** centrée, mesure `--ch-measure` ; marge droite réservée au Compagnon.
- **Barre de titre (Mac)** : 34 px, fusionnée avec le fond, feux macOS visibles, titre du projet en petites capitales vermillon. Absente en plein écran et sur le X250.
- **En-tête de scène** fixe en haut, fondu vers le texte : chapitre, scène, variante (cliquables : ouvrent le tiroir sur l'élément).
- **En-tête** : en haut à droite, contrôle segmenté « Écrire | Atelier » (`⌘E`), point d'entrée de l'Atelier (§4.8).
- **Pied** : à gauche le compteur (`1 284 mots · +312 aujourd'hui`, ce dernier en vermillon) ; au centre la **zone de commande** (§4.6) ; à droite, si besoin, « 4 remarques du Compagnon » (bleu, ouvre les points), l'état (« Enregistré » ; sur le X250 : réseau et batterie ; « Compagnon : saisir la clé » si la clé manque, cliquable) puis le bouton `Aa` (§4.8). Textes en 12 px `--ch-muted`.
- **Scène vide** : invite en italique `--ch-faint` à la place du texte (« Écrivez ici. Le titre de la scène, celui du chapitre, tout se change plus tard. »), qui disparaît à la première lettre.
- **Défilement machine à écrire** : la ligne courante se tient vers 42 % de la hauteur.
- **Mode focus** : paragraphes autres que le courant à 26 % d'opacité.
- **Curseur** : 2 px, vermillon.

### 4.2 Pastille et note du Compagnon (« marge qui respire »)
- **Pastille** : cercle de 14 px en relief (`--ch-raise-s`) au cœur bleu de Prusse de 6 px, à 1,5 rem du texte, alignée sur la première ligne du paragraphe. Opacité selon l'importance : 0,42 (langue, encouragement), 0,72 (métier, indice), 1 (conflit avec une information validée).
- **Note** : carte en relief de 18,5 rem à droite de la pastille. Contenu : type en petites capitales bleues + « Le Compagnon » en italique ; titre (Literata 16 px) ; message (Inter 13 px) ; « pourquoi » en italique `--ch-muted` sous un filet ; actions en boutons avec leur touche (`1`, `2`, `3` ou `⏎`, `I`, `Échap`).
- **Ancrage** : le passage visé reçoit un lavis `--ch-mentor-soft` et un soulignement bleu 1,5 px, seulement quand la note est dépliée (décoration ProseMirror, aucune marque dans le contenu). Typographie et orthographe : soulignement ondulé fin.
- **Comportement** : une seule note dépliée à la fois ; elle se déplie quand le curseur entre dans le passage après une pause, ou au raccourci ; se replie quand le curseur s'éloigne ou à `Échap`. Fenêtre étroite (< 1180 px) : la note se déplie sous son paragraphe et pousse le texte, sans le recouvrir.

### 4.3 Panneau droit : Points à traiter / Conversation
- Panneau en relief de 25,5 rem, détaché des bords (10–12 px), ouvert par `⌘L` ou la poignée « Compagnon » (§4.8), sur l'onglet Points ; le contrôle segmenté passe à la conversation [D-18]. Il **remplace la marge** : les pastilles disparaissent et le texte se recentre dans l'espace restant.
- **Contrôle segmenté** en tête : rail en creux, onglet actif en relief, libellé vermillon, compteur bleu.
- **Points** : groupes « Cette scène », « Chapitre », « Fiches proposées » (libellés en petites capitales) ; chaque point est une carte en relief avec sa pastille, son type et sa scène, un titre, une phrase. Le point sélectionné est gravé. Les propositions de fiche portent « Valider `V` » et « Rejeter `X` ». Pied : `J K` parcourir, `⏎` aller au passage, `R` résolu, `I` ignorer.
- **Réglette d'intervention** [D-19] : en tête du panneau, sous le contrôle segmenté, un rail gravé à 4 crans (Discret, Attentif, Accompagnant, Tuteur), curseur en relief, libellé du cran en petites capitales et une ligne qui dit ce qu'il change. `←` `→` quand elle a le focus.
- **Conversation** : pas de bulles. Transcription sobre : « Vous » (petites capitales vermillon), « Le Compagnon » (petites capitales bleues), texte en Inter 13,5 px. Champ de saisie gravé en pied.

### 4.4 Manuscrit : tiroir et vue d'ensemble
- **Tiroir** (`⌘J` ou la poignée « Manuscrit », [D-18]) : panneau gauche en relief de 22 rem, la scène derrière s'estompe. Contrôle segmenté « Manuscrit | Plan ». Chapitres en Literata, scènes en lignes ; scène active gravée avec un filet vermillon à gauche ; pastilles bleues `•••` et nombre de mots à droite. Sous la scène active : variantes (active en vermillon) et derniers points de restauration. Clavier : `↑↓`, `⏎` ouvrir, `⌥↑↓` déplacer, `V` variantes, `⌘N` nouvelle scène.
- **Vue d'ensemble** (`⌘⇧P` ou « Plan ») : plein cadre, titre du roman en Literata, une colonne par chapitre, une carte en relief par scène (numéro, titre en Literata, mots, variantes, pastilles). Scène active gravée et cerclée de vermillon. Bandeau en pied : variantes et points de restauration de la scène sélectionnée. Clavier : flèches, `⌥` + flèches pour déplacer, `⏎` écrire, `Échap` revenir.

### 4.5 Atelier (modules) et fiches
- **Atelier** (`⌘E` bascule Écrire / Atelier) : trois colonnes, rail des modules (13,5 rem), liste des entrées (16,5 rem) avec filtre gravé, fiche.
- **Rail** : Méta, Personnages, Structure, Règles du monde, Indices et révélations (`⌘1…5`) ; module actif gravé avec filet vermillon ; nombre de propositions en bleu.
- **Liste** : bouton « + Nouveau personnage » (libellé selon le module) sous le filtre ; entrée active gravée (filet vermillon) ; entrée proposée en relief, texte bleu.
- **Fiche** : titre Literata 30 px, ligne de contexte, légende des statuts, sections en deux colonnes (une seule en dessous de 46 rem de large), libellés en petites capitales.
- **Champ à statut** (cœur du système) :

| Statut | Valeur | Ligne sous la valeur |
|---|---|---|
| Proposée | **en relief**, italique bleu | « Proposée · d'après la scène II.1 » + Valider `V` / Rejeter `X` |
| Validée | **gravée**, encre, filet vermillon de 2 px à gauche | rien |
| Rejetée | à plat, 45 %, barrée | « Rejetée le 10 nov. · conservée pour ne pas être reproposée » ; masquables (« Afficher les rejets ») |
| Contredite | gravée + médaillon « ! » bleu en relief | en bleu : « Contredite : la scène III.2 dit… » + « Voir le passage » |
| Vide | cadre pointillé, invite en Inter | « À écrire, ou laissez le Compagnon proposer » |

  Valider fait passer la valeur du relief au creux en 350 ms : le geste se voit.
- **Apparitions** : puces en relief (`I.1`, `III.2`…), remplies automatiquement.
- **Fiche en volet** : depuis le texte (clic ou raccourci sur un nom connu), la fiche s'ouvre dans le panneau droit, en une colonne ; `⌘⏎` l'ouvre dans l'Atelier, `Échap` la ferme.

### 4.6 Ligne de commande
- **Zone de commande, toujours visible** : au centre du pied, un champ gravé (largeur min(30 rem, 38 %)) avec l'invite bleue `›`, « Que voulez-vous faire ? » en `--ch-faint` et `⌘K` à droite. Un clic ou `⌘K` l'ouvre. Dans l'Atelier, le même champ est au pied du rail des modules.
- Ouverte : barre pleine largeur en pied, champ gravé, invite bleue `›` ; résultats qui montent dans une feuille en relief de 46 rem alignée à gauche. Champ vide : les commandes les plus utiles et les dernières utilisées, pour qu'un débutant voie ce qui existe sans rien taper.
- Préfixes : `>` commandes, `@` fiches, `#` scènes (`⌘P` ouvre directement en `#`). Recherche approximative, insensible aux accents ; lettres trouvées en bleu, ligne choisie gravée ; raccourci de chaque commande à droite.
- Toute action de l'app y figure, avec son raccourci : c'est aussi l'aide-mémoire du clavier.

### 4.7 Éléments de base
- **Bouton** : relief léger, rayon 9 px, Inter 12,5 px 500, touche en `--ch-faint` ; pressé = creux. Bouton principal : libellé bleu s'il agit pour le Compagnon, encre sinon. Pas de bouton plein.
- **Champ** : creux, rayon 14 px, texte d'invite `--ch-faint`.
- **Contrôle segmenté** : rail creux, segment actif en relief.
- **Puce** : relief léger, 12 px ; active = creux, vermillon.
- **Focus clavier** : l'élément focalisé passe en creux ; pour les cartes et lignes, filet vermillon. Jamais d'anneau bleu par défaut du navigateur.

### 4.8 Points d'entrée et découverte
Un débutant doit pouvoir tout trouver à la souris ; le raccourci s'affiche à côté pour qu'il l'apprenne en passant. Maquette : `index.html`, groupe « Découverte » sur « 1 · Poignées » (choix de l'auteur), écran 8 pour le premier lancement, bouton « Frappe » pour l'effacement.

- **Poignées de bord** : une languette en relief (`--ch-raise-s`) collée au bord, centrée verticalement, arrondie côté page (`--ch-radius-md`), libellé vertical en petites capitales Literata 13,5 px `--ch-muted` et raccourci en `--ch-faint`. À gauche « Manuscrit `⌘J` » (ouvre le tiroir) ; à droite « Compagnon `⌘L` », surmonté du nombre de points ouverts dans un médaillon gravé bleu (ouvre le panneau, même sans remarque). Survol : encre et `--ch-raise`. Une poignée disparaît quand son panneau est ouvert : le panneau prend sa place.
- **Écrire | Atelier** : contrôle segmenté en haut à droite de la surface d'écriture (rail creux 3 px, segment actif en relief, libellé vermillon).
- **Zone de commande** : §4.6.
- **`Aa` (affichage)** : bouton texte Literata en bas à droite ; ouvre une petite feuille en relief au-dessus : taille du texte (− +), largeur de colonne (← →), mode focus, thème, réduire les animations, chacun avec son raccourci. `Échap` ou un clic ailleurs la ferme.
- **Effacement pendant la frappe** : poignées, « Écrire | Atelier », zone de commande et `Aa` passent à opacité 0 (`--ch-dur-pastille`) dès la première frappe, et reviennent au mouvement de la souris, à `Échap`, ou après 3 s sans frappe. Le compteur, l'état et les pastilles restent (§5.1). Avec « Réduire les animations », le passage est instantané.
- **Panneaux persistants** : un panneau ouvert (tiroir, panneau du Compagnon, fiche en volet) reste ouvert à la prochaine ouverture du projet, jusqu'à ce que l'auteur le ferme. Préférence par projet, stockée dans le document du projet.
- **Barre de menus macOS complète** : Charpentier, Fichier, Édition, Scène, Manuscrit, Atelier, Compagnon, Présentation, Fenêtre, Aide. Chaque commande du registre y figure une fois, avec son raccourci, sauf celles qui n'ont de sens qu'en contexte (actions d'une note, d'une fiche). Aide › « Que voulez-vous faire ? » ouvre la ligne de commande ; Aide › « Revoir la visite guidée ». Le détail des menus est dans la maquette (barre de menus du cadre Mac). Sur le X250, sans barre de menus, la zone de commande en tient lieu.
- **Premier lancement** : sur la première scène d'un premier projet, une note du Compagnon est dépliée dans la marge (type « Bienvenue ») : « Je lis par-dessus votre épaule », ce qu'il fait et ne fait pas, puis les trois endroits à connaître (à gauche le manuscrit, à droite le Compagnon, en bas « Que voulez-vous faire ? »). Boutons « Faire le tour `⏎` » et « Plus tard `Échap` ».
- **Visite guidée** : trois étapes, une bulle en relief à côté de chaque point d'entrée (Manuscrit, Compagnon, zone de commande), le point d'entrée cerclé de bleu ; titre en petites capitales bleues avec le raccourci, deux phrases, « Suivant `⏎` » et « 1 / 3 ». Jamais relancée d'elle-même.
- **États vides** : tout panneau ou liste vide dit quoi faire et comment (« Rien à traiter pour l'instant. Demandez l'avis du Compagnon sur la scène : `⌘⇧A` » ; « Aucun personnage. + Nouveau personnage »).
- **Bulles d'aide** : chaque bouton, poignée ou contrôle a une bulle native « Libellé (raccourci) ». Tous sont atteignables à la tabulation, dans l'ordre : poignée gauche, Écrire | Atelier, texte, zone de commande, `Aa`, poignée droite.

## 5. Règles d'UX

### 5.1 Distraction-free
- En écriture, visibles en permanence : en-tête de scène, compteur, état, pastilles. Visibles au repos et effacés pendant la frappe : les points d'entrée (§4.8 : poignées, Écrire | Atelier, zone de commande, `Aa`). Rien d'autre.
- Aucune fonction n'est accessible seulement au clavier : chaque outil a un point d'entrée visible, au moins dans la barre de menus ou la zone de commande.
- Tout outil s'ouvre au clavier ou d'un clic, et se ferme par `Échap`, qui ramène toujours au texte, curseur intact.
- Aucune modale bloquante pendant l'écriture ; aucune animation, aucun son, aucune pastille qui apparaît pendant la frappe.
- Hors réseau : l'état l'indique discrètement dans le pied (« Compagnon hors ligne ») ; l'écriture et les corrections hors ligne continuent.

### 5.2 Le Compagnon
- Pendant l'écriture, seules les remarques légères (langue, incohérence factuelle évidente, SPEC §6.2) produisent des pastilles ; l'analyse complète de fin de scène alimente surtout la liste de points.
- L'intensité visuelle suit l'importance, jamais l'urgence : pas de rouge, pas d'alerte. Le vermillon n'est **jamais** utilisé par le Compagnon.
- Toute action proposée affiche sa touche ; aucune n'est appliquée sans geste de l'auteur.

### 5.3 Raccourcis proposés

Registre central dans le cœur, tous modifiables. `⌘` = `Ctrl` sur le X250.

| Action | Touche |
|---|---|
| Ligne de commande / aller à une scène | `⌘K` / `⌘P` |
| Tiroir du manuscrit / vue d'ensemble | `⌘J` / `⌘⇧P` |
| Écrire ↔ Atelier ; modules | `⌘E` ; `⌘1…5` |
| Points à traiter et conversation (panneau droit) | `⌘L` |
| Déplier la remarque du passage / remarque suivante, précédente | `⌥⏎` / `⌘'`, `⌘⇧'` |
| Insérer la phrase d'exemple | `⌘⏎` |
| Nouvelle scène / nouvelle variante / changer de variante | `⌘N` / `⌘⇧N` / `⌘⌥V` |
| Point de restauration | `⌘S` |
| Avis du Compagnon sur la scène | `⌘⇧A` |
| Plus d'aide / moins d'aide (réglette) | ligne de commande |
| Taille du texte / largeur de colonne / mode focus | `⌘+` `⌘−` / `⌘⌥←` `⌘⌥→` / `⌘⇧F` |
| Revenir au texte | `Échap` |

### 5.4 Appareils
- **X250** (cible 1920×1080, mise à l'échelle Sway 125 % → 1536×864 px CSS) : plein écran, pas de barre de titre, état système (réseau, batterie) dans le pied. Tout l'écran d'écriture avec une note dépliée tient sans défilement de l'interface.
- **Mac** : barre de titre intégrée discrète ; plein écran macOS conseillé pour écrire.
- Largeur minimale prise en charge : 960 px. Sous 1180 px : notes sous le paragraphe ; sous 1100 px : l'Atelier masque la colonne de liste (accessible par la ligne de commande `@`).

### 5.5 Accessibilité et confort (v1)
- Taille du texte et largeur de colonne réglables au clavier, indépendamment de l'interface.
- Mode focus ; « Réduire les animations » (et respect du réglage système).
- Statuts lisibles sans la couleur (relief, barré, médaillon, mots) ; tous les contrôles atteignables au clavier, focus visible.
- Les contrastes doux de l'outillage (`--ch-muted`, `--ch-faint`) sont un choix assumé ; un mode « contraste renforcé » reste possible plus tard sans changer la structure (tokens seulement).

### 5.6 Langue
- Toute chaîne vient du catalogue i18n (`fr.json`) ; les maquettes fixent le ton : vouvoiement, phrases courtes, verbes d'action sur les boutons (« Valider », « Corriger le texte », « Mettre à jour la fiche »), pas de point d'exclamation.

## 6. Suites
- ~~Intégrer `design/tokens.css` dans `packages/core/src/styles/` et embarquer Literata et Inter.~~ Fait (phase 1.7 bis) : `packages/core/src/styles/tokens.css` est désormais la copie de référence, polices dans `packages/core/src/fonts`.
- ~~Reporter au journal des décisions de la SPEC : nom du Compagnon et « marge qui respire ».~~ Fait : [D-16], [D-17], question n°3 annotée.
- Raccourcis : un hôte qui garde un raccourci pour lui (⌘N, ⌘⇧N, ⌘1…9, ⌘⌥←→ dans un navigateur) fait basculer la commande sur son autre raccourci ou sur la ligne de commande ; sur le bureau, les raccourcis de ce tableau s'appliquent tels quels.
- ~~À trancher avant l'étape 3 : seuil de la pause et types de remarques visibles pendant l'écriture.~~ Tranché par la réglette [D-19].
