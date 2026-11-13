# Charpentier : design language

- **Version** : 1.5 (13 novembre 2026). 1.5 : la **ligne système** du X250 et tout ce qu'elle ouvre (§4.12), la matière du système (§3.1), la police à chasse fixe (§3.2), le **liseré de lumière** sur ce qu'on presse (§4.7). 1.4 : en thème sombre, l'ardoise reste la même et la page s'assombrit (§3.1). 1.3 : les outils changent de matière, **ardoise sombre**, et reçoivent des **outils gravés** (§3.1, §4.11), l'auteur trouvant l'ensemble trop neutre hors de la page d'écriture. 1.2 : finitions (sons §3.4, rejets §4.5, restauration dans la vue d'ensemble §4.4, note en fenêtre étroite §4.2, bibliothèque §4.9, icône §4.10). 1.1 : tout devient découvrable sans raccourci (§4.8, §5.1), après essai de l'app par l'auteur ; inventaire et directions comparées dans [design/decouverte.md](design/decouverte.md).
- **Direction retenue** : **Perle** pour la page, **ardoise** pour les outils, avec **Deux encres**, **Signature** et **Outils gravés** ; manuscrit en **tiroir + vue d'ensemble** ; points d'entrée en **poignées** sur les bords et **zone de commande** en pied.
- **Sources** : brief de l'auteur ([design/brief.md](design/brief.md)), maquettes ([design/mockups/](design/mockups/), ouvrir `index.html`), tokens CSS proposés ([design/tokens.css](design/tokens.css)).
- Complète la [SPEC](SPEC.md) (§6 mentor, §7.1 statuts, §19 exigences transverses) sans la contredire.

---

## 1. Principes

1. **La page est plate et claire, les outils sont en relief et en ardoise.** Le texte n'est jamais dans une boîte : il est posé sur le fond perle. Ce qui sert à travailler autour du texte (panneaux, tiroir, rail et liste de l'Atelier, poignées, ligne de commande) est taillé dans une seconde matière, l'**ardoise sombre**, en neumorphisme doux : on distingue d'un coup d'œil le texte de l'outillage. Ce qui est du contenu reste sur la perle : la page, les fiches, les cartes de scène et de projet, la note en marge.
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
| Fond de la page | `--ch-bg` | `#e3e7ed` | `#1b1e23` | – |
| Texte du roman, titres | `--ch-ink` | `#22262d` | `#dfe3ea` | 12,2 / 13,0 |
| Texte d'interface | `--ch-ink-2` | `#474d57` | `#b9c0ca` | 6,9 / 9,1 |
| Méta, libellés discrets | `--ch-muted` | `#7a828e` | `#8a929e` | 3,1 / 5,3 |
| Indications de raccourcis, vides | `--ch-faint` | `#a6adb8` | `#5d6470` | 1,8 / 2,8 (décoratif) |
| Lumière du relief | `--ch-highlight` | `#ffffff` | `#262a31` | – |
| Ombre du relief | `--ch-shade` | `#b3becc` | `#101215` | – |
| Encre du Compagnon (bleu de Prusse) | `--ch-mentor` | `#1f4f7c` | `#86aedb` | 6,9 / 7,2 |
| Lavis du Compagnon (passage ancré) | `--ch-mentor-soft` | 10 % | 13 % | – |
| Encre de l'auteur (vermillon) | `--ch-author` | `#b2432a` | `#e3876a` | 4,5 / 6,3 |
| Sélection | `--ch-author-soft` | 22 % | 24 % | – |

Thème : suit le système par défaut, forçable (`data-theme` sur la racine) et basculable au clavier. Le sombre est un vrai neumorphisme sombre (lumière `#262a31`, ombre `#101215`), jamais un noir pur. Depuis la version 1.4, la page sombre est plus profonde (`#1b1e23` au lieu de `#262a31`) pour que les outils en ardoise s'en détachent.

**Matière des outils (ardoise).** Une surface d'outil redéclare les tokens ci-dessus pour elle-même et tout ce qu'elle contient ; les composants ne changent pas, ils lisent les mêmes tokens. À poser par une classe unique (par exemple `.ch-tool`), qui redéclare aussi `--ch-raise`, `--ch-raise-s` et `--ch-inset` pour que le relief intérieur se calcule avec l'ombre et la lumière de l'ardoise. L'ombre portée de la surface elle-même, sur la page, garde les couleurs de la page.

| Token dans une surface d'outil | Valeur, dans les deux thèmes | Contraste sur l'ardoise |
|---|---|---|
| `--ch-bg` | `#2b3038` | – |
| `--ch-highlight` | `#383e48` | – |
| `--ch-shade` | `#1b1e24` | – |
| `--ch-ink` | `#dfe3ea` | 10,3 |
| `--ch-ink-2` | `#b9c0ca` | 7,2 |
| `--ch-muted` | `#8a929e` | 4,2 |
| `--ch-faint` | `#5d6470` | 2,2 (décoratif) |
| `--ch-mentor` | `#86aedb` | 5,7 |
| `--ch-mentor-soft` | 13 % | – |
| `--ch-author` | `#e3876a` | 5,0 |
| `--ch-author-soft` | 24 % | – |

**L'ardoise est la même dans les deux thèmes** (choix de l'auteur, « outils clairs ») : seule la page change. En thème clair, les outils sont sombres sur une page claire ; en thème sombre, ils sont plus clairs que la page (`#2b3038` sur `#1b1e23`), comme des plaques posées dessus. L'ardoise porte toujours les encres du thème sombre.

**Matière du système (X250).** La zone système a sa propre matière, **la plus sombre de l'écran dans les deux thèmes**, plus profonde que l'ardoise des outils : on la reconnaît sans la lire. Classe unique (par exemple `.ch-system`), même mécanique que `.ch-tool`, avec la police `--ch-font-sys`.

| Token dans une surface système | Valeur, dans les deux thèmes | Contraste |
|---|---|---|
| `--ch-bg` | `#14161a` | – |
| `--ch-highlight` | `#20242a` | – |
| `--ch-shade` | `#090a0c` | – |
| `--ch-ink` | `#dfe3ea` | 14,1 |
| `--ch-ink-2` | `#b9c0ca` | 9,9 |
| `--ch-muted` | `#8a929e` | 5,8 |
| `--ch-faint` | `#555b66` | 2,7 (décoratif) |

Le système n'a **pas de couleur à lui** : ni vermillon ni bleu (sauf le point bleu de l'équerre, son emblème). Une alerte est un **segment inversé** (fond `--ch-ink`, texte `--ch-bg`), jamais du rouge.

| Surface d'outil (ardoise) | Reste sur la page (perle) |
|---|---|
| panneau du Compagnon, fiche en volet, tiroir du manuscrit | page d'écriture, en-tête, ouverture de scène, pied |
| poignées de bord | « Écrire \| Atelier », zone de commande au repos, bouton `Aa` |
| rail des modules et liste des entrées de l'Atelier (deux plaques en relief, rayon `--ch-radius-lg`, 14 px de marge intérieure) | fiche de l'Atelier et ses champs |
| bandeau de la vue d'ensemble et son aperçu de restauration | cartes de scène, titre et colonnes de la vue d'ensemble |
| ligne de commande ouverte (barre et feuille de résultats), feuille `Aa`, bulle de la visite guidée | note du Compagnon en marge (et sous le paragraphe), note de bienvenue |
| | bibliothèque et ses cartes |

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
| Système (X250 : ligne, panneaux déroulants, rail des réglages) | JetBrains Mono | 11,5 px (12 dans les panneaux) | chasse fixe, libellés en minuscules sans majuscule initiale (`wifi`, `bat`, `lum`), valeurs en `--ch-ink-2`, token `--ch-font-sys` |

Polices : **Literata** (TypeTogether, SIL OFL 1.1, variable `opsz` + `wght`, build complet avec petites capitales `smcp`/`c2sc`) et **Inter** (SIL OFL 1.1, variable). **JetBrains Mono** (SIL OFL 1.1, graisses 400 et 500) s'y ajoute pour la zone système du X250 ; à embarquer avec le même script, en gardant les blocs U+2581 à U+2588 (signal Wi-Fi). Embarquées en WOFF2, sous-ensemble latin + latin étendu, en vérifiant la présence de U+00A0, U+202F, « », —, ’, `⁂`. L'OFL n'est pas dans la liste blanche de `CLAUDE.md` : à ajouter comme licence acceptée (ou exception documentée dans `licenses.exceptions.json`) au moment de l'intégration.

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

Sons : **désactivés par défaut**, discrets, hors ligne, synthétisés par Web Audio (aucun fichier). Un son ne suit **qu'un geste de l'auteur** : jamais pour signaler une remarque du Compagnon, jamais quand une pastille apparaît d'elle-même. Les gains sont absolus (un `GainNode` par son, sortie directe) ; le volume du système fait le reste. Page d'écoute : [design/sons.html](design/sons.html).

| Son | Quand | Recette |
|---|---|---|
| **Déclic** | valider (champ, fiche proposée), point résolu | sinus 1 320 → 990 Hz (rampe exp. 40 ms), attaque 3 ms à 0,09, chute exp. à 60 ms ; puis à +28 ms sinus 1 980 Hz, attaque 2 ms à 0,05, chute à 45 ms. 75 ms en tout |
| **Toc** | rejeter, ignorer un point, fermer un panneau ou une feuille | triangle 220 → 150 Hz (rampe exp. 90 ms), attaque 4 ms à 0,12, chute exp. à 120 ms ; avec un bruit blanc de 15 ms, passe-bande 900 Hz Q 1,2, gain 0,04 |
| **Tic** | l'auteur déplie une note ou ouvre un panneau | sinus 2 600 Hz, attaque 1 ms à 0,035, chute exp. à 25 ms |
| **Frappe** (option séparée) | chaque caractère tapé dans le texte | bruit blanc 12 ms, passe-bande 2 200 Hz ± 15 % au hasard, Q 0,8, gain 0,025 ± 20 % ; plus sinus 180 Hz de 20 ms, gain 0,02. Espace : passe-bande 1 400 Hz, 18 ms. Retour : le Toc à 50 %. Effacement : bruit 10 ms, 3 000 Hz, gain 0,015. Au plus un son toutes les 30 ms ; rien sur la répétition automatique ni pendant une composition (accents morts, IME) |

Attaques et chutes en rampes exponentielles depuis et vers 0,0001. Réglages : « Sons de l'interface » et « Son de frappe », tous deux désactivés par défaut, dans la feuille `Aa` (deux lignes Oui / Non) et dans le menu Présentation (cases à cocher), aussi dans la ligne de commande ; pas de raccourci. Préférence d'appareil.

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
- **Comportement** : une seule note dépliée à la fois ; elle se déplie quand le curseur entre dans le passage après une pause, ou au raccourci ; se replie quand le curseur s'éloigne ou à `Échap`. Fenêtre étroite (< 1180 px) : la note se déplie **sous son paragraphe**, en pleine largeur de colonne, et pousse le texte qui suit ; elle ne recouvre jamais le texte (décoration ProseMirror de type widget placée après le paragraphe, pas une couche positionnée). La pastille reste dans ce qui reste de marge, à 0,5 rem du bord de la colonne ; la note garde sa carte en relief, avec 10 px au-dessus et 14 px au-dessous.

### 4.3 Panneau droit : Points à traiter / Conversation
- Panneau en ardoise, en relief, de 25,5 rem, détaché des bords (10–12 px), ouvert par `⌘L` ou la poignée « Compagnon » (§4.8), sur l'onglet Points ; le contrôle segmenté passe à la conversation [D-18]. Il **remplace la marge** : les pastilles disparaissent et le texte se recentre dans l'espace restant. **Il ne recouvre jamais le contenu**, dans aucune vue : dans l'Atelier, la colonne de la fiche se resserre (une seule colonne de champs sous 46 rem) ; dans la vue d'ensemble, les colonnes et le bandeau s'arrêtent avant lui. Même règle pour le tiroir du manuscrit quand il reste ouvert.
- **Contrôle segmenté** en tête : rail en creux, onglet actif en relief, libellé vermillon, compteur bleu.
- **Points** : groupes « Cette scène », « Chapitre », « Fiches proposées » (libellés en petites capitales) ; chaque point est une carte en relief avec sa pastille, son type et sa scène, un titre, une phrase. Le point sélectionné est gravé. Les propositions de fiche portent « Valider `V` » et « Rejeter `X` ». Pied : `J K` parcourir, `⏎` aller au passage, `R` résolu, `I` ignorer.
- **Réglette d'intervention** [D-19] : en tête du panneau, sous le contrôle segmenté, un rail gravé à 4 crans (Discret, Attentif, Accompagnant, Tuteur), curseur en relief, libellé du cran en petites capitales et une ligne qui dit ce qu'il change. `←` `→` quand elle a le focus.
- **Conversation** : pas de bulles. Transcription sobre : « Vous » (petites capitales vermillon), « Le Compagnon » (petites capitales bleues), texte en Inter 13,5 px. Champ de saisie gravé en pied.

### 4.4 Manuscrit : tiroir et vue d'ensemble
- **Tiroir** (`⌘J` ou la poignée « Manuscrit », [D-18]) : panneau gauche en ardoise, en relief, de 22 rem, la scène derrière s'estompe. Contrôle segmenté « Manuscrit | Plan ». Chapitres en Literata, scènes en lignes ; scène active gravée avec un filet vermillon à gauche ; pastilles bleues `•••` et nombre de mots à droite. Sous la scène active : variantes (active en vermillon) et derniers points de restauration. Clavier : `↑↓`, `⏎` ouvrir, `⌥↑↓` déplacer, `V` variantes, `⌘N` nouvelle scène.
- **Vue d'ensemble** (`⌘⇧P` ou « Plan ») : plein cadre, titre du roman en Literata, une colonne par chapitre, une carte en relief par scène (numéro, titre en Literata, mots, variantes, pastilles). Scène active gravée et cerclée de vermillon. Clavier : flèches, `⌥` + flèches pour déplacer, `⏎` écrire, `Échap` revenir.
- **Bandeau en pied de la vue d'ensemble** (scène sélectionnée) : deux groupes, libellés en petites capitales avec leur touche.
  - « Variantes `V` » : une puce par variante, l'active gravée en vermillon ; un clic ou `⏎` la rend active.
  - « Restauration `H` » : les **3 derniers points** de la variante active, en puces (« Auj. 14:32 · auto », « Hier 18:40 · « avant de couper la fin » ») puis un lien « Tous (12)… » qui ouvre « Revenir à un point de restauration… » dans la ligne de commande, filtré sur la scène.
  - Choisir un point ouvre au-dessus du bandeau un **aperçu** en relief : date et raison en petites capitales, les premières lignes de cette version dans un cadre gravé (Literata italique), l'écart de mots avec aujourd'hui et la variante, puis « Restaurer `⏎` », « En faire une variante `⇧⏎` », « Fermer `Échap` ».
  - Restaurer ne demande pas de confirmation : c'est une nouvelle transaction et l'état précédent devient lui-même un point de restauration (message d'état « Version restaurée… »). « En faire une variante » crée une variante nommée d'après la date et la rend active.
  - Clavier : `V` ou `H` font entrer le focus dans le groupe, `←` `→` parcourent les puces, `⏎` choisit, `Échap` remonte au groupe puis aux cartes.

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
| Rejetée | à plat, 45 %, barrée | « Rejetée le 10 nov. · conservée pour ne pas être reproposée » + « Utiliser cette valeur » ; visible seulement avec « Afficher les rejets » |
| Contredite | gravée + médaillon « ! » bleu en relief | en bleu : « Contredite : la scène III.2 dit… » + « Voir le passage » |
| Vide | cadre pointillé, invite en Inter | « À écrire, ou laissez le Compagnon proposer » |

  Valider fait passer la valeur du relief au creux en 350 ms : le geste se voit.
- **Afficher les rejets** : l'étiquette « estompée : rejetée » de la légende est un interrupteur : « estompée : rejetée · afficher (3) `⇧X` » (« masquer » quand ils sont visibles ; le nombre compte les rejets de la fiche et les fiches rejetées du module ; sans aucun rejet, l'étiquette reste une simple légende, sans « afficher (0) » ni touche). Survol ou état actif : relief léger. **Masqués par défaut** ; le choix vaut pour tout l'Atelier et la fiche en volet, préférence d'appareil.
  - Masqués : un champ dont la seule valeur est rejetée s'affiche **vide** (pointillés, invite habituelle) avec, dessous, « 1 rejet » en `--ch-faint`, cliquable (affiche les rejets) ; un champ validé qui a des rejets passés porte le même « 1 rejet » ; une fiche rejetée disparaît de la liste, dont le pied indique « 1 proposition rejetée · Afficher `⇧X` ».
  - Affichés : le champ rejeté reprend son aspect (à plat, 45 %, barré) avec « Utiliser cette valeur » (l'auteur la reprend comme sa valeur, validée) ; sous un champ validé, une ligne « Rejetée : ~~« 52 ans »~~, le 9 nov. » ; la fiche rejetée revient dans la liste, estompée et barrée, avec « Reprendre » (elle redevient proposée).
- **Apparitions** : puces en relief (`I.1`, `III.2`…), remplies automatiquement.
- **Fiche en volet** : depuis le texte (clic ou raccourci sur un nom connu), la fiche s'ouvre dans le panneau droit, en une colonne ; `⌘⏎` l'ouvre dans l'Atelier, `Échap` la ferme.

### 4.6 Ligne de commande
- **Zone de commande, toujours visible** : au centre du pied, un champ gravé (largeur min(30 rem, 38 %)) avec l'invite bleue `›`, « Que voulez-vous faire ? » en `--ch-faint` et `⌘K` à droite. Un clic ou `⌘K` l'ouvre. Dans l'Atelier, le même champ est au pied du rail des modules.
- Ouverte : barre pleine largeur en pied, en ardoise et en relief (sans dégradé vers la page), champ gravé, invite bleue `›` ; résultats qui montent dans une feuille en relief de 46 rem alignée à gauche. Champ vide : les commandes les plus utiles et les dernières utilisées, pour qu'un débutant voie ce qui existe sans rien taper.
- Préfixes : `>` commandes, `@` fiches, `#` scènes (`⌘P` ouvre directement en `#`). Recherche approximative, insensible aux accents ; lettres trouvées en bleu, ligne choisie gravée ; raccourci de chaque commande à droite.
- Toute action de l'app y figure, avec son raccourci : c'est aussi l'aide-mémoire du clavier.

### 4.7 Éléments de base
- **Bouton** : relief léger, rayon 9 px, Inter 12,5 px 500, touche en `--ch-faint` ; pressé = creux. Bouton principal : libellé bleu s'il agit pour le Compagnon, encre sinon. Pas de bouton plein.
- **Champ** : creux, rayon 14 px, texte d'invite `--ch-faint`.
- **Contrôle segmenté** : rail creux, segment actif en relief.
- **Puce** : relief léger, 12 px ; active = creux, vermillon.
- **Barres de défilement** : fines, **sans fond** (piste transparente, jamais de bande blanche entre le texte et un panneau), curseur en `--ch-muted` à 40 % ; elles prennent donc la teinte de la matière où elles se trouvent, en clair comme en sombre.
- **Liseré de lumière** (« ce qu'on presse s'allume ») : tout élément pressé, ouvert ou sélectionné passe en creux **et** reçoit un liseré d'un pixel de lumière sur son bord bas et droit : `box-shadow: var(--ch-inset), inset -1px -1px 0 color-mix(in srgb, var(--ch-highlight) 70%, #fff)` (token proposé : `--ch-rim`, à déclarer sur chaque élément pour qu'il prenne la lumière de sa matière). Transition de 120 ms. S'applique partout : segment de la ligne système, bouton pressé, bouton `Aa` ouvert, zone de commande survolée, entrée active d'une liste ou d'un rail (avec son filet vermillon), médaillon ou monogramme actif, point sélectionné, carte de projet sélectionnée. Ne s'applique pas aux valeurs validées des fiches : là, le creux dit un statut, pas un geste.
- **Focus clavier** : l'élément focalisé passe en creux ; pour les cartes et lignes, filet vermillon. Jamais d'anneau bleu par défaut du navigateur.

### 4.8 Points d'entrée et découverte
Un débutant doit pouvoir tout trouver à la souris ; le raccourci s'affiche à côté pour qu'il l'apprenne en passant. Maquette : `index.html`, groupe « Découverte » sur « 1 · Poignées » (choix de l'auteur), écran 8 pour le premier lancement, bouton « Frappe » pour l'effacement.

- **Poignées de bord** : une languette en relief (`--ch-raise-s`) collée au bord, centrée verticalement, arrondie côté page (`--ch-radius-md`), libellé vertical en petites capitales Literata 13,5 px `--ch-muted` et raccourci en `--ch-faint`. À gauche « Manuscrit `⌘J` » (ouvre le tiroir) ; à droite « Compagnon `⌘L` », surmonté du nombre de points ouverts dans un médaillon gravé bleu (ouvre le panneau, même sans remarque). Survol : encre et `--ch-raise`. Une poignée disparaît quand son panneau est ouvert : le panneau prend sa place.
- **Écrire | Atelier** : contrôle segmenté en haut à droite de la surface d'écriture (rail creux 3 px, segment actif en relief, libellé vermillon).
- **Zone de commande** : §4.6.
- **`Aa` (affichage)** : bouton texte Literata en bas à droite ; ouvre une petite feuille en relief au-dessus : taille du texte (− +), largeur de colonne (← →), mode focus, thème, réduire les animations, chacun avec son raccourci. `Échap` ou un clic ailleurs la ferme.
- **Effacement pendant la frappe** : poignées, « Écrire | Atelier », zone de commande et `Aa` passent à opacité 0 (`--ch-dur-pastille`) dès la première frappe, et reviennent au mouvement de la souris, à `Échap`, ou après 3 s sans frappe. Le compteur, l'état et les pastilles restent (§5.1). Avec « Réduire les animations », le passage est instantané.
- **Panneaux persistants** : un panneau ouvert (tiroir, panneau du Compagnon, fiche en volet) reste ouvert à la prochaine ouverture du projet, jusqu'à ce que l'auteur le ferme. Préférence d'interface par projet, rangée avec les autres préférences d'écriture (taille, colonne), pas dans le contenu du projet.
- **Barre de menus macOS complète** : Charpentier, Fichier, Édition, Scène, Manuscrit, Atelier, Compagnon, Présentation, Fenêtre, Aide. Chaque commande du registre y figure une fois, avec son raccourci, sauf celles qui n'ont de sens qu'en contexte (actions d'une note, d'une fiche). Aide › « Que voulez-vous faire ? » ouvre la ligne de commande ; Aide › « Revoir la visite guidée ». Le détail des menus est dans la maquette (barre de menus du cadre Mac). Sur le X250, sans barre de menus, la zone de commande en tient lieu.
- **Premier lancement** : sur la première scène d'un premier projet, une note du Compagnon est dépliée dans la marge (type « Bienvenue ») : « Je lis par-dessus votre épaule », ce qu'il fait et ne fait pas, puis les trois endroits à connaître (à gauche le manuscrit, à droite le Compagnon, en bas « Que voulez-vous faire ? »). Boutons « Faire le tour `⏎` » et « Plus tard `Échap` ».
- **Visite guidée** : trois étapes, une bulle en relief à côté de chaque point d'entrée (Manuscrit, Compagnon, zone de commande), le point d'entrée cerclé de bleu ; titre en petites capitales bleues avec le raccourci, deux phrases, « Suivant `⏎` » et « 1 / 3 ». Jamais relancée d'elle-même.
- **États vides** : tout panneau ou liste vide dit quoi faire et comment (« Rien à traiter pour l'instant. Demandez l'avis du Compagnon sur la scène : `⌘⇧A` » ; « Aucun personnage. + Nouveau personnage »).
- **Bulles d'aide** : chaque bouton, poignée ou contrôle a une bulle native « Libellé (raccourci) ». Tous sont atteignables à la tabulation, dans l'ordre : poignée gauche, Écrire | Atelier, texte, zone de commande, `Aa`, poignée droite.

### 4.9 Bibliothèque des projets
Maquette : écran 9.
- En tête : « Bibliothèque » en petites capitales vermillon, à droite « + Nouveau roman `N` » (principal) et « + Nouvelle `⇧N` ». Sous le titre, la ligne de touches en `--ch-faint`.
- Un projet = une carte en relief léger : titre en Literata 19 px ; dessous, genre, mots, scènes et dernière ouverture en Inter 12 px `--ch-muted`. Projet sélectionné (ou ouvert) gravé avec un filet vermillon à gauche. Au survol ou au focus, à droite : « Ouvrir `⏎` », « Renommer `R` », « Corbeille `⌫` ».
- Pied, sous un filet : « Corbeille (2) » (projets restaurables) ; sur le bureau, « Dossier : ~/Documents/Charpentier · Changer… · Afficher dans le Finder ».
- État vide : « Aucun projet pour l'instant. Commencez un roman ou une nouvelle. » avec les deux boutons.

### 4.10 Icône
L'**Équerre** : une équerre de charpentier gravée dans une plaque perle, bord intérieur vermillon, graduations, pastille du Compagnon dans l'angle. Sources, rendus et règles des petites tailles (version simplifiée sous 128 px) : [design/icon/](design/icon/README.md).

### 4.11 Outils gravés
Du dessin plutôt que de la couleur : chaque lieu devient reconnaissable. Maquette : groupe « Caractère », « N · Établi sombre » et « O · Outils gravés » (état par défaut). Pictogrammes : [design/pictos/](design/pictos/README.md).

- **Titre de panneau** : en tête du panneau du Compagnon et du tiroir, au-dessus du contrôle segmenté (14 px 18 px 4 px) : un médaillon, un titre, et à droite une ligne de contexte en Inter 11,5 px `--ch-muted`.
  - Compagnon : compas, « Le Compagnon » en Literata italique 19 px `--ch-mentor`, contexte « 6 points · cran Accompagnant ».
  - Manuscrit : livre ouvert, « Manuscrit » en petites capitales Literata 19 px `--ch-ink-2`, contexte : titre du projet et nombre de mots.
- **Médaillon** : disque en relief léger (`--ch-raise-s`), 34 px dans un titre de panneau, 30 px dans le rail de l'Atelier ; pictogramme au trait de 1,5 px en `--ch-ink-2` (`--ch-mentor` pour le Compagnon). Élément actif : médaillon **gravé**, pictogramme vermillon.
- **Rail de l'Atelier** : chaque module porte son médaillon à gauche du libellé : plan (Méta), buste (Personnages), ferme de charpente (Structure), fil à plomb (Règles du monde), loupe (Indices et révélations). Le compteur de propositions passe à droite.
- **Monogramme** : l'initiale de l'entrée (sans l'article : « Le technicien » donne T) en Literata dans un disque en relief : 30 px devant chaque entrée de la liste (gravé et vermillon si l'entrée est active, italique bleu si elle est proposée), 62 px en `--ch-raise` devant le titre de la fiche, initiale vermillon de 34 px.
- **Filets gravés** : les intertitres de groupe (« Cette scène », « Identité et apparence »…) sont suivis d'un filet qui file jusqu'au bord : deux traits d'1 px, `--ch-shade` puis `--ch-highlight`, comme un trait de trusquin.
- **Tiroir** : chaque titre de chapitre est en Literata 15 px, précédé du fleuron ⁂ en `--ch-faint`.
- Un pictogramme n'est jamais seul : toujours à côté de son libellé. Aucune autre illustration, aucune texture.

### 4.12 Système (X250)
Sur le X250, l'app est la partie visible du système [D-24]. Maquette : cadre « X250 », groupe « X250 · ligne système », écrans « X250 · Réglages », « Verrou », « Démarrage » ; rendus à la taille réelle dans [design/x250/](design/x250/). Rien de tout cela n'apparaît sur le Mac ni sur le web.

**La ligne système.** Toujours affichée, 30 px, tout en haut, pleine largeur, dans la matière du système, en JetBrains Mono 11,5 px. Elle ne s'efface pas pendant la frappe et rien n'y bouge de soi-même, sauf l'heure. De gauche à droite :

| Segment | Affiche | Un clic ou sa touche déplie |
|---|---|---|
| `système` `⊞` | l'équerre et le mot | le menu : Réglages du système… `⊞,`, Imprimer… `⊞P`, Copier mes textes sur une clé USB `⊞U`, Verrouiller `⊞L`, Mettre en veille `⊞⏎`, Redémarrer…, Éteindre… ; en tête la version (`0.5.0 · nixos 26.11 · x250`), en pied « allumé depuis 3 h 12 » |
| message | le dernier message du système, en `--ch-muted` ; vide : `journal · 7` en `--ch-faint` | le **journal** `⊞J` : les messages depuis le démarrage, du plus récent au plus ancien, avec leur heure ; effacé à l'extinction |
| `usb` | le nom de la clé, seulement si une clé est branchée | Copier mes textes `⊞U`, Éjecter |
| `wifi` | le réseau et la force du signal (`▂▄▆█`, barres manquantes en `--ch-faint`) ; `wifi non` si coupé | interrupteur Wi-Fi, réseaux visibles, mot de passe, Oublier, adresse `⊞W` |
| `bt` | `non` ou le nombre d'appareils connectés | interrupteur, appareils connus, Appairer… `⊞B` |
| `lum` | jauge et valeur | luminosité, mode nuit (auto, oui, non), écran externe |
| `vol` | jauge et valeur ; `muet` | volume, muet, les deux réglages de sons de l'app |
| `bat` | jauge, pourcentage, autonomie (`5h40`) ; `⚡` en charge | les deux batteries, la puissance, écran éteint après, veille après |
| `sync` | `ok`, `…` en cours, `hors ligne` | serveur, dernière synchronisation, Synchroniser maintenant |
| date | `ven. 13 nov. 14:32` | l'heure en grand, la date complète et la semaine, le fuseau, les mots et le temps d'écriture du jour |

- **Segments** : séparés par un filet gravé vertical (1 px `--ch-shade`, 1 px `--ch-highlight`) ; libellé en `--ch-muted`, valeur en `--ch-ink-2` ; survol : `--ch-ink` ; déplié : en creux avec le liseré de lumière (§4.7).
- **Jauge en cellules** : dix cellules de 4 × 9 px espacées de 2 px, pleines en `--ch-ink-2`, vides en `--ch-faint`. Pas d'icône.
- **Panneau déroulant** : sous son segment, aligné sur lui, 21 rem, rayon 12 px, matière du système, ombre de la page. En-tête : nom en minuscules à gauche, touche ou état à droite. Lignes libellé / contrôle ; ligne choisie en creux ; aides de touches en pied. `Échap` ou un clic ailleurs le ferme. Un seul ouvert à la fois.
- **Contrôles du système** : interrupteur à deux ou trois segments (rail en creux, segment actif en relief), curseur (rail en creux de 10 px, remplissage `--ch-muted`, bouton rond de 18 px en relief), boutons de l'app.
- **Touches du ThinkPad** (luminosité, volume, muet) : la jauge du segment bouge, le segment s'allume une seconde et le message dit « luminosité 70 % ». Aucune fenêtre par-dessus le texte.
- **Messages** : le seul canal du système, à la place de toute notification. Un message naît d'un geste de l'auteur ou d'un changement d'état (clé branchée, réseau perdu, synchronisation faite, batterie faible) ; il reste jusqu'au suivant, sans animation ni son. Jamais de message du Compagnon ici.
- **Batterie faible** : à 15 %, le segment `bat` s'inverse et le message dit « batterie faible · branchez l'appareil, tout est enregistré ». À 3 % : point de restauration de la scène, message, puis veille. Rien n'interrompt la frappe.
- **Portail captif** : un réseau qui demande une page de connexion est marqué `portail` ; l'appareil ne l'ouvre pas (pas de navigateur) et le dit : « Ce réseau demande une page de connexion. Utilisez le partage de connexion de votre téléphone. »

**Clavier.**
- La touche **Super** (`⊞`) est celle du système. Seule : le focus va à la ligne, `←` `→` parcourent les segments, `⏎` ou `↓` déplie, `Échap` rend le focus au texte. Avec une lettre : `⊞W` Wi-Fi, `⊞B` Bluetooth, `⊞J` journal, `⊞L` verrouiller, `⊞P` imprimer, `⊞U` clé USB, `⊞,` réglages, `⊞⏎` veille.
- Dans la ligne de commande, le préfixe **`:`** appelle le système, avec un argument éventuel : `:lum 40`, `:vol 20`, `:muet`, `:wifi Maison-5G`, `:wifi non`, `:nuit`, `:veille`, `:verrou`, `:eteindre`, `:redemarrer`, `:imprimer scène`, `:usb`, `:reglages`. Sans argument, la commande ouvre le panneau du segment. Ces commandes figurent aussi, en clair, dans la liste ordinaire (« Mettre en veille », « Régler la luminosité… »).

**Réglages du système** (`⊞,`). Vue plein cadre, comme l'Atelier : à gauche un rail de 17 rem dans la matière du système (titre « réglages du système » avec l'équerre, une ligne par section avec sa valeur courante à droite, section active en creux avec un filet `--ch-ink`) ; à droite la section, **sur la page**, avec les composants ordinaires de l'app (titre Literata 30 px, intertitres en petites capitales, lignes libellé / aide / contrôle). `Échap` revient au texte.

| Section | Contenu |
|---|---|
| Réseau | Wi-Fi oui / non ; réseaux (connecté, protégé, portail), Se connecter, Oublier ; Ethernet automatique |
| Bluetooth | oui / non ; appareils connus, Oublier ; Appairer un appareil (le code éventuel s'affiche ici) |
| Écran | luminosité ; mode nuit (auto de 21 h à 7 h, oui, non) et chaleur ; écran externe : Dupliquer ou Externe seul (pas de bureau étendu : une seule fenêtre), échelle |
| Son | volume, muet ; sons de l'interface, son de frappe |
| Batterie et veille | les deux batteries ; écran éteint après (5, 15 min, jamais) ; veille après (15, 30 min, jamais) ; rabat fermé = veille ; seuils de batterie faible |
| Verrouillage | demander le code : à chaque réveil (défaut), après 15 min de veille, jamais ; changer le code (4 à 8 chiffres ou lettres) ; après 5 erreurs, 30 s d'attente, doublées à chaque série ; code oublié : réinitialisé depuis le Mac |
| Clavier et pavé tactile | disposition (AZERTY, BÉPO, QWERTY) ; couper le pavé pendant la frappe (oui par défaut), toucher pour cliquer, défilement naturel, pavé oui / non |
| Impression | imprimantes du réseau (sans pilote), par défaut, page de test ; format A4 / Lettre, interligne |
| Clé USB | état ; Copier mes textes (tous les projets en Markdown dans `Charpentier/<date>/`, rien n'est effacé sur la clé) ; Éjecter |
| Date et heure | fuseau, heure automatique par le réseau, format 24 h / 12 h |
| À propos | versions de l'app et du système, mise à jour (depuis le Mac), stockage, licences |

**Imprimer** (`⊞P`) : une feuille en ardoise au centre : quoi (cette scène, ce chapitre, tout le manuscrit), imprimante, copies ; « Imprimer `⏎` ». Mise en page de manuscrit fixe : Literata 12 pt, interligne double, marges de 2,5 cm, titre courant et folio.

**Éteindre et redémarrer** : une confirmation légère. La ligne du menu devient « Confirmer l'extinction `⏎` » pendant 3 secondes ; un second appui éteint. La veille est immédiate.

**Verrouillage.** À l'ouverture du rabat (réglage par défaut), plein écran sur la page : l'heure en Literata 96 px, la date en petites capitales, un champ gravé où chaque caractère tapé devient un point vermillon, « votre code, puis ⏎ ». Aucun titre de projet, aucun texte. La ligne système est réduite à `charpentier`, `verrouillé`, `bat` et l'heure. Code faux : le champ tremble une fois (rien si les animations sont réduites) et se vide. Ce verrou protège des regards ; ce n'est pas un chiffrement du disque.

**Premier démarrage de l'appareil.** Avant la note de bienvenue (§4.8), une page centrée : « Bienvenue », le fleuron, la phrase du Compagnon en italique bleu (« Avant d'écrire, quatre réglages. Chacun peut attendre. »), puis quatre étapes, chacune avec « Continuer `⏎` » et « Plus tard `Échap` » : `1 wifi` (réseaux, mot de passe), `2 code` (choisir le code de verrouillage, ou « Sans code »), `3 synchronisation` (adresse du serveur, identifiant), `4 compagnon` (clé d'API). Ce qui est remis à plus tard reste accessible par la ligne système et les réglages.

**Hors périmètre** : portail captif (v1), bureau étendu, mises à jour depuis l'appareil. Le terminal de secours reste une combinaison de touches sans interface.

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
| Système (X250 seulement) | `⊞` et ses lettres, voir §4.12 |

### 5.4 Appareils
- **X250** (cible 1920×1080, mise à l'échelle Sway 125 % → 1536×864 px CSS) : plein écran, pas de barre de titre ni de barre de menus ; la **ligne système** (§4.12) occupe les 30 px du haut, la page et son pied sont ceux du Mac. Tout l'écran d'écriture avec une note dépliée tient sans défilement de l'interface.
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
