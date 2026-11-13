# Plan des étapes 1 à 5

Chaque phase est courte, se termine par un résultat vérifiable dans l'app (ou par des tests quand la phase n'a pas d'interface), puis par un arrêt pour le feu vert. Les tests prioritaires sont écrits dans la phase qui introduit le code concerné.

Statut : étapes 1 à 3 réalisées (12 novembre 2026) ; étape 4a réalisée (13 novembre 2026), serveur en service sur https://charpentier.chatel.pm ; étape 5 commencée, phases 5.1 à 5.3 réalisées, 5.4 à 5.7 codées (à vérifier sur le X250). Reste à éprouver le Compagnon avec la clé de l'auteur (tests adversariaux en direct, réglage des prompts). Avancement visuel : https://claude.ai/artifact/NAAMCGpuXETvPTiDXMzdS4 (régénéré par `node scripts/progress.mjs`).

---

## Étape 1 : fondations locales (hôte web)

### 1.1 Socle du monorepo
pnpm + Turborepo, TypeScript strict, ESLint, Prettier, Vitest, squelettes vides des paquets `core`, `schema`, `platform`, `platform-web`, `agents` et de `apps/web`. Garde-fou anti-fuite : `tsconfig` sans `@types/node` pour `core`/`schema`/`platform`/`agents`, et règle ESLint `no-restricted-imports`. Script de vérification des licences (liste blanche). Workflow CI (fichier local, rien n'est poussé). `LICENSE` FSL-1.1-ALv2, README avec en-tête de licence, `CLA.md` et workflow CLA Assistant prêts à activer.
**Vérifiable** : `pnpm check` passe ; un fichier de contrôle qui importe `node:fs` depuis `core` fait échouer le lint **et** le typecheck.

### 1.2 Plateforme et coquille web
Interfaces de `platform` (`Documents`, `Storage`, `FileMirror`, `LLM`, `Secrets`, `Spellcheck`, `Keybindings`, `System`) ; `platform-web` avec les implémentations minimales ou « non disponible ». `apps/web` (Vite + React) monte le cœur ; i18next et fichier `fr.json`.
**Vérifiable** : `pnpm dev:web` ouvre une page plein écran en français, chaînes issues de `fr.json`.

### 1.3 Schéma du texte et Markdown
Schéma ProseMirror (paragraphe, italique, citation, séparateur interne de scène). Sérialiseur et analyseur Markdown. Tests d'aller-retour, y compris par génération aléatoire : insécables U+00A0 et U+202F, guillemets « », tirets de dialogue, astérisques et caractères à échapper.
**Vérifiable** : tests verts (pas d'interface).

### 1.4 Modèle Yjs du projet
Document racine (meta, chapitres et scènes ordonnés par indexation fractionnaire, modules, signalements), documents de scène avec variantes, document d'historique. Accesseurs typés et API restreinte des agents (refus d'écrire un champ validé ou rejeté, aucun accès aux scènes). Tests : déplacements concurrents sans duplication, refus des écritures d'agent interdites, « contredite » bien dérivé.
**Vérifiable** : tests verts (pas d'interface).

### 1.5 Écrire une scène
Éditeur TipTap lié à la variante active via y-prosemirror, plein écran sans chrome, persistance y-indexeddb. Un projet par défaut.
**Vérifiable** : j'écris une scène dans le navigateur, je recharge la page, mon texte est là.

### 1.6 Chapitres, scènes, palette
Créer, renommer, réordonner, supprimer chapitres et scènes, au clavier et à la souris. Navigateur de scènes, palette de commandes, registre central des raccourcis.
**Vérifiable** : je crée deux chapitres et trois scènes, je les réorganise sans toucher la souris, tout est accessible depuis la palette.

### 1.7 Variantes et points de restauration
Créer, dupliquer, renommer, activer et supprimer une variante. Points de restauration automatiques (intervalle, avant opération lourde) et manuels ; restaurer ; créer une variante depuis un point.
**Vérifiable** : je crée une variante d'une scène, je bascule de l'une à l'autre, je restaure la version d'il y a dix minutes.

### 1.7 bis Design language
Intégration de [DESIGN.md](DESIGN.md) : tokens et thèmes clair et sombre, polices embarquées, en-tête et ouverture de scène, pied (compteur de mots), ligne de commande en pied (`#` scènes, `>` commandes), tiroir du manuscrit, réglages de confort (taille du texte, largeur de colonne, mode focus, défilement machine à écrire, réduction des animations).
**Vérifiable** : l'écran d'écriture ressemble à la maquette Perle ; ⌘+ / ⌘− changent la taille du texte, ⇧⌘F active le mode focus, et ces réglages survivent au rechargement.
Reporté : compteur « +n aujourd'hui », barre de titre macOS (étape 2), pastilles et panneau droit (étape 3). La vue d'ensemble du manuscrit (⇧⌘P) est livrée avec la phase 1.9.

### 1.8 Modules Méta et Personnages
L'Atelier (⌘E, rail des modules, liste, fiche) selon [DESIGN.md](DESIGN.md) §4.5 : écrans de saisie, champs à statut rendus par le relief (saisie de l'auteur = validée), navigation au clavier.
**Vérifiable** : je remplis le pitch et la fiche de mon personnage principal ; tout survit au rechargement.
Réalisé : ⌘E, ⌘1…5 (⌥⌘1…5 dans un navigateur, qui garde ⌘1…9), `@` dans la ligne de commande, N nouvelle entrée, V / X sur une proposition, corbeille des fiches. Les apparitions d'un personnage seront remplies par le Compagnon (étape 3).

### 1.9 Structure, Règles du monde, Indices
Actes, arcs, modèle narratif optionnel (liste de modèles), règles du monde, panneau Indices (pose, apparitions, résolution, et « qui sait » à partir de quelle scène, lecteur compris).
**Vérifiable** : je choisis « trois actes », je place mes scènes dans les actes, je pose un indice dans la scène 2, je le relie à sa résolution, et j'indique que l'enquêteur le connaît dès la scène 2 mais le lecteur seulement à la scène 5.

Réalisé : rail Structure (modèle narratif, actes, arcs), Règles du monde, Indices et révélations avec « qui sait » (lecteur et chaque personnage) ; vue d'ensemble du manuscrit (⇧⌘P), une colonne par chapitre, ⌥ + flèches pour déplacer.

### 1.10 Projets multiples
Bibliothèque : créer (roman ou nouvelle), ouvrir, renommer, mettre à la corbeille.
Réalisé : ⌘O ; la bibliothèque est un document Yjs `library` (index), le titre reste aussi dans la racine du projet ; corbeille avec restauration ; le projet des phases précédentes est adopté au premier démarrage.
**Vérifiable** : je crée un roman et une nouvelle et je passe de l'un à l'autre.

---

## Étape 2 : hôte desktop minimal (macOS)

### 2.1 Coquille Electron
`apps/desktop` (main, preload, renderer), `contextIsolation`, `platform-desktop`. Tests du cœur exécutés aussi dans Electron (Playwright) en CI.
**Vérifiable** : `pnpm dev:desktop` ouvre la même app que le web.
Réalisé : electron-vite, preload sandboxé (`contextIsolation`, `sandbox`), barre de titre intégrée sur macOS. Écart : plutôt que d'exécuter les tests unitaires du cœur dans Electron, `pnpm test:desktop` lance l'app construite avec Playwright (ouverture, isolation, arrêt brutal, miroir, orthographe, Compagnon contre un faux serveur Anthropic, plein écran) ; il tourne en CI sous xvfb.

### 2.2 Documents dans le main et persistance disque
`Y.Doc` détenus par le main, synchronisés avec l'interface par IPC. Journal append-only + compaction, écritures atomiques. Choix du dossier de bibliothèque ; un projet = un dossier.
**Vérifiable** : j'écris, je tue l'app brutalement, je relance : rien n'est perdu (scénario aussi couvert par un test automatique).
Réalisé : chaque mise à jour est écrite (appel système synchrone) avant la suivante, `fsync` sous 300 ms, compaction atomique ; testé par SIGKILL d'un processus écrivain et de l'app. Bibliothèque par défaut `~/Documents/Charpentier`, modifiable (commande et écran Bibliothèque) ; le dossier d'un projet garde son nom de création.

### 2.3 Miroir Markdown sortant
Un `.md` par scène, dossiers par chapitre, frontmatter avec ids, modules en YAML ; écriture différée.
**Vérifiable** : j'ouvre le dossier du projet dans le Finder et je lis mon roman en Markdown, à jour.
Réalisé : `manuscrit/01-chapitre/01-scene.md` (frontmatter `scene`, `variant`), `modules/*.yaml` ; écriture 0,8 s après la dernière modification, tant qu'une fenêtre a le projet ouvert ; la scène mise à la corbeille perd son fichier (pas ses données).

### 2.4 Réimport des modifications externes
Surveillance des fichiers, fusion à trois voies appliquée en transaction `mirror`, point de restauration préalable ; chevauchement → variante « Modif. externe » + signalement. Tests prioritaires de réimport.
**Vérifiable** : je corrige une phrase dans un autre éditeur, l'app la reprend ; si j'ai modifié la même phrase dans l'app, je retrouve une variante « Modif. externe ».
Réalisé : fusion par paragraphe ; seuls les blocs modifiés sont réécrits dans le CRDT. Un nouveau fichier `.md` sans identifiant est ignoré (import après la v1, D-1).

### 2.5 Application installable
`.app` macOS non signée.
**Vérifiable** : j'installe Charpentier dans Applications et **je commence à écrire mon roman pour de vrai**. (Jalon : écriture réelle sans risque de perte.)
Réalisé : `pnpm package:desktop` produit `apps/desktop/dist/mac-arm64/Charpentier.app` (Apple Silicon, signature ad hoc, sans runtime renforcé ni notarisation), à glisser dans Applications. Icône Electron par défaut.

---

## Étape 3 : mentor v1

Avant de commencer : arbitrer les questions ouvertes 1 à 4 de la SPEC (§22 : fin de scène, remarques pendant l'écriture, place de la marge, nom du mentor).

### 3.1 Correction hors ligne
Service `Spellcheck` (Hunspell fr), règles typographiques françaises, propositions à accepter au clavier, « tout accepter » pour l'orthographe.
**Vérifiable** : réseau coupé, mes fautes et mes espaces manquantes sont signalées ; j'accepte une correction au clavier.
Réalisé : Hunspell fr (Dicollecte, MPL 2.0, embarqué) dans un fil du main ; règles typographiques maison ; ⌥⏎ corrige ou propose, ⌘' va à la suivante ; dictionnaire du projet ; « tout corriger ». Sur le web : typographie seule (pas de dictionnaire).

### 3.2 Signalements ancrés et liste de points
Décorations en marge à partir des positions relatives, liste de points à traiter navigable au clavier, résoudre / ignorer.
**Vérifiable** : les signalements restent sur le bon passage quand je réécris autour ; je les parcours depuis la liste.
Réalisé : ancrage par citation exacte (`anchorForQuote`) ; pastilles, note dépliée à la pause ou par ⌥⏎ ; panneau ⌘L (Points / Conversation).

### 3.3 Paquet `agents` et service LLM
Abstraction multi-fournisseurs complète, Anthropic implémenté, exécution dans le main ; saisie et stockage de la clé (`safeStorage`) ; dégradation hors réseau. Garde-fous « l'IA n'écrit pas » : prompts système, schémas bornés, filtrage, tests adversariaux.
**Vérifiable** : je saisis ma clé ; réseau coupé, un indicateur discret le signale et l'écriture continue ; les tests adversariaux sont verts.
Réalisé : SDK officiel d'Anthropic, Opus 5.5 [D-12, D-20], clé vérifiée puis chiffrée par `safeStorage`, statut dans le pied. Tests des garde-fous verts hors ligne ; les tests adversariaux en direct (`CHARPENTIER_LIVE_LLM=1 pnpm test:llm`, payants) restent à lancer avec la clé de l'auteur.

### 3.4 Chat libre
Voix unique du mentor, contexte = scène courante et modules ; historique dans le document mentor.
**Vérifiable** : je pose une question sur ma scène, le mentor répond en français et refuse d'écrire la scène à ma place.
Réalisé : historique dans le document mentor ; phrase d'exemple insérable par ⌘⏎ seulement.

### 3.5 Bottom-up
Analyse de fin de scène → propositions dans Personnages, Méta, Structure, Règles du monde, Indices ; validation, correction, rejet au clavier ; pas de reproposition d'un rejet sans élément nouveau.
**Vérifiable** : je termine une scène où apparaît un nouveau personnage ; une fiche proposée apparaît, je la valide ou la rejette.
Réalisé avec 3.6 : une analyse structurée par scène ; propositions par l'AgentWriter ; empreinte des remarques (jamais deux fois, jamais après « ignorer »).

### 3.6 Conflits, indices et remarques de métier
Contradictions avec les informations validées, indices non exploités, personnage qui agit sur une information avant de l'apprendre, apparitions d'indices proposées, remarques justifiées par un principe, phrases d'exemple insérables sur action explicite.
**Vérifiable** : j'écris que mon héroïne a les yeux verts alors que sa fiche validée dit bleus ; une annotation apparaît en marge et je tranche (corriger le texte, mettre à jour la fiche, ignorer).

### 3.7 Pendant l'écriture et à la demande
Réglette d'intervention à 4 crans [D-19] (cran 3 par défaut) qui règle les remarques pendant l'écriture, le déclenchement de l'analyse complète et la profondeur des explications ; analyse à la demande d'une scène, d'un chapitre ou du manuscrit, grammaire par le LLM.
**Vérifiable** : je demande l'analyse d'un chapitre entier et je reçois des remarques ancrées dans le texte. (Jalon : **v1 fonctionnelle**.)
Réalisé : réglette dans le panneau, « Plus / Moins d'aide », lectures automatiques (en quittant une scène, après deux minutes de pause) et à la demande (scène ⌘⇧A, chapitre, manuscrit) ; option Haiku pour les lectures automatiques. Bilan de chapitre : au cran 4 en passant de la dernière scène d'un chapitre au chapitre suivant, à tous les crans par la commande « Bilan du chapitre » ; il arrive dans la conversation. Reporté : grammaire par le LLM pendant l'écriture (elle passe par la lecture de la scène).

---

## Étape 4a : synchro entre applications de bureau [D-21, D-22, D-23]

But : écrire sur le Mac, retrouver son roman sur une autre machine (le X250 plus tard), sans jamais dépendre du réseau pour écrire. Le disque local reste la référence de chaque appareil ; le serveur relaie et garde une copie.

### 4.1 Serveur de synchro
`apps/server` (Node, TypeScript) : Hocuspocus (MIT) avec persistance Postgres (`pg`, MIT) des états Yjs, un document Hocuspocus par document Yjs du projet (racine, scènes, historique, mentor) et le document `library`. `infra/docker-compose.yml` (serveur + Postgres, volumes, vérification de santé). Tests avec PGlite (Postgres en WASM, Apache 2.0), sans Docker.
**Vérifiable** : deux clients Yjs branchés sur le serveur convergent ; arrêté puis relancé, le serveur rend les documents.
Réalisé (13 novembre 2026). Image Docker non construite faute de Docker sur le Mac : à faire en 4.5.

### 4.2 Comptes et sessions
Inscription fermée par défaut, premier compte par une commande du serveur (`create-user`), réinitialisation de mot de passe par commande. API HTTP : connexion (e-mail + mot de passe → jeton de session de l'appareil), déconnexion, liste et révocation des appareils. Mots de passe en Argon2id (`@node-rs/argon2`, MIT), jetons opaques stockés hachés, limitation des tentatives. Hocuspocus refuse toute connexion sans jeton valide et n'ouvre que les documents des projets du compte.
**Vérifiable** : sans jeton, ou avec un jeton révoqué, aucune lecture ni écriture ; un compte ne voit pas les projets d'un autre.
Réalisé : Argon2id de Node (24.7+, aucune dépendance native ; image Docker en Node 24), sessions par appareil (jeton opaque, empreinte SHA-256 en base), 10 tentatives par adresse et e-mail en 15 min, commandes `create-user` et `reset-password`. Le premier compte qui ouvre un projet le revendique (ids aléatoires).

### 4.3 Synchro dans l'app de bureau
Service `Sync` de la plateforme ; dans le main, un fournisseur Hocuspocus par document des projets synchronisés, branché sur le `DocStore` (le journal local reste la persistance de l'appareil). Projets découverts par le document `library` du compte ; un projet arrivé d'ailleurs est créé dans la bibliothèque locale avec son miroir Markdown. Jeton dans `safeStorage`. Reconnexion automatique, rien ne bloque l'écriture.
**Vérifiable (test prioritaire)** : deux applications écrivent hors ligne dans la même scène et dans les fiches, se reconnectent, et convergent sans perte ; les statuts des fiches (validée, rejetée) survivent.
Réalisé : `SyncEngine` dans le main, un fournisseur Hocuspocus par document sur une seule WebSocket ; bibliothèque du compte `library:<userId>` (gardée aussi sur l'appareil), projets adoptés avec leurs dates exactes pour éviter l'écho ; compte et jeton dans `safeStorage`. Test prioritaire contre un vrai serveur (PGlite), plus renommage, corbeille et session révoquée. La connexion depuis l'app vient en 4.4.

### 4.4 Se connecter, voir l'état
Commandes « Se connecter à un serveur… » (adresse, e-mail, mot de passe), « Se déconnecter », « Appareils connectés » ; état discret dans le pied (« Synchronisé », « Hors ligne », « Synchro en pause »). Points d'entrée selon DESIGN §4.8 (menu, ligne de commande ; design demandé à la session de design si un écran est nécessaire).
**Vérifiable** : je me connecte depuis le Mac, puis depuis une seconde installation ; mon roman y apparaît, et une phrase écrite d'un côté arrive de l'autre.
Réalisé : service `Sync` de la plateforme (absent sur le web) ; commandes « Se connecter à un serveur de synchro… » (adresse, e-mail, mot de passe à la suite), « Appareils connectés… », « Se déconnecter du serveur », aussi dans le menu Fichier ; état dans le pied, « Synchro en pause » cliquable pour se reconnecter. Test de bout en bout avec un vrai serveur et deux installations de l'app.

### 4.5 Déploiement
Image Docker du serveur, `docker-compose.yml` et guide de déploiement sur `prodesk2021.local` derrière le reverse proxy en HTTPS (WebSocket), sauvegarde de Postgres.
**Vérifiable** : le serveur tourne sur `prodesk2021.local`, l'app s'y connecte par le domaine public.
Réalisé (13 novembre 2026) : `https://charpentier.chatel.pm`, derrière le Traefik de la machine (réseau `proxy`, certificat Cloudflare), sauvegarde nocturne du volume Postgres ; `scripts/deploy-server.sh` et `infra/README.md`. Compte de l'auteur créé, l'app du Mac connectée et son projet synchronisé. Reste à essayer : la restauration d'une sauvegarde, et une seconde machine réelle.

## Étape 4b (ensuite) : version web synchronisée et relais IA
La version web ouvre les projets du compte depuis le serveur, et le Compagnon y passe par un relais IA côté serveur (clé de l'auteur chiffrée sur le serveur). À détailler à la fin de 4a.

---

## Étape 5 : le X250, appareil d'écriture

But : un ThinkPad X250 dédié qui démarre directement dans Charpentier, sans rien d'autre à l'écran, et retrouve le roman par la synchro (étape 4a). Sur cet appareil, l'app est la partie visible de l'OS [D-24] : tout ce qu'offrirait un gestionnaire de fenêtres est dans son interface. Référence : SPEC §13 (hôte `appliance`, service `System`) et le chapitre « Mode appareil » de la spec technique d'origine ; apparence et périmètre validés avec la session de design : DESIGN §4.12 (ligne système, réglages, verrou, premier démarrage), §3.1 (matière du système), §3.2 (JetBrains Mono), rendus dans `docs/design/x250/`.

Hors périmètre de la v1 de l'appareil : portail captif (seulement détecté), bureau étendu, mises à jour lancées depuis l'appareil. Le terminal de secours reste sans interface.

### 5.1 Points de contribution du cœur [D-24]
Une « fonctionnalité » est un module compilé avec l'app qui déclare ce qu'elle apporte et sa condition d'activation : commandes (le registre le fait déjà), zone en tête de fenêtre, éléments d'état du pied, sections de réglages, vue plein cadre, préfixe de la ligne de commande, entrées de menu, textes. Le pied, les réglages et le menu, aujourd'hui câblés en dur, lisent ces contributions. Pas d'extensions tierces : rien n'est chargé à l'exécution.
**Vérifiable** : une fonctionnalité de test ajoute une commande, une zone en tête, un état dans le pied et une section de réglages sans toucher aux composants du cœur ; retirée, il n'en reste rien.
Réalisé (13 novembre 2026) : type `Feature` du cœur (`packages/core/src/features/`), passé par l'hôte à `App` (`features`) et actif selon `isActive(platform)` ; textes fusionnés dans le catalogue sous `<id>.…` et `commands.<id>`, vérifiés au démarrage (un propriétaire par identifiant, préfixe et texte ; un titre par commande). Commandes au registre, menus (groupe ajouté ou nouveau menu avant « Fenêtre »), bande en tête (le reste de la fenêtre commence dessous, bibliothèque comprise), états du pied, vue des réglages (`Mod-,`, rail des sections et valeur courante, seulement s'il existe une section), vues plein cadre (`ctx.openView`), préfixe de la ligne de commande qui lit son argument. Test avec une fonctionnalité « sonde » qui use de tout, puis sans elle.

### 5.2 Mode appareil de l'app
L'app de bureau lancée avec `--appliance` : plein écran, sans barre de titre ni barre de menus (la zone de commande en tient lieu), `Ctrl` à la place de `⌘` dans les raccourcis et leurs libellés, touche Super réservée au système. Cible 1920 × 1080 à 125 % (1 536 × 864 px CSS) : l'écran d'écriture avec une note dépliée tient sans défilement de l'interface.
**Vérifiable** : sur Linux, `--appliance` ouvre l'app en plein écran sans chrome ; tout s'atteint par la zone de commande et les raccourcis `Ctrl`.
Réalisé (13 novembre 2026) : `--appliance` ouvre une fenêtre en mode kiosque (plein écran, sans cadre), sans barre de menus hors macOS ni barre de titre dessinée ; l'interface le sait par le pont (`appliance`), ne publie pas de menu et ne réserve plus `Ctrl+Q` ni `Ctrl+W`. Hors macOS `Mod` est `Ctrl` : aucune commande du cœur n'emploie Super (test). Sur le Mac, le mode garde `⌘` et sa barre de menus cachée, pour développer. Tests de bout en bout : le mode appareil (kiosque, pas de barre de titre, la zone de commande ouvre la ligne de commande) et l'écran d'écriture avec une note dépliée dans 1536 × 864 sans défilement.

### 5.3 Ligne système, journal et réglages
La fonctionnalité « Système », première cliente des points de contribution, contre un service `System` simulé (elle se développe et se teste sur le Mac) : la ligne système de 30 px en tête, dans sa matière (`.ch-system`) et sa police (JetBrains Mono embarquée, OFL 1.1), ses segments et leurs panneaux, qui cèdent la place au message quand la fenêtre est étroite (dont le segment `cpu` : mini-courbe de la dernière minute, pourcentage et température, figé pendant la frappe), les jauges à dix cellules, l'alerte en segment inversé ; le message, seul canal du système, et son journal ; Super seul et Super + lettre ; le préfixe `:` de la ligne de commande (`:lum 40`, `:wifi <nom>`, `:veille`…) ; la vue des réglages du système (Super + virgule), son rail et ses douze sections.
**Vérifiable** : avec le service simulé, je parcours la ligne au clavier, je déplie le Wi-Fi, je tape `:lum 40`, j'ouvre les réglages ; sur le Mac sans service, rien de tout cela n'apparaît.
Réalisé (13 novembre 2026) : service `System` de la plateforme (état entier observé, actions, journal) et `createSimulatedSystem` (l'état de la maquette) ; fonctionnalité `createSystemFeature` (`packages/core/src/system/`) : ligne système en tête (matière `.ch-system`, JetBrains Mono embarquée), segments `système`, message ou `journal · n`, `usb`, `cpu` (figé pendant la frappe), `wifi`, `bt` (absent s'il est coupé), `lum`, `vol`, `bat` (inversé sous le seuil), `sync`, date ; repli des jauges, de l'autonomie, du jour puis des libellés quand la place manque ; panneaux (menu avec confirmation légère, journal, clé, cpu, Wi-Fi avec mot de passe et portail, Bluetooth, luminosité et mode nuit, volume et sons de l'app, batteries et délais, synchro, date) ; touche du système seule ou avec une lettre (Super sur l'appareil, Ctrl là où ⌘ est à l'app) ; préfixe `:` ; vue des réglages du système, rail en matière système, douze sections. On la voit sur le web par `?x250` et dans l'app de bureau par `--simulate-system`. Tests en navigateur avec le service simulé. Restent pour les phases suivantes : le moniteur au clic sur `cpu` (5.5), les touches du ThinkPad (5.4), le verrou et l'impression (5.6, 5.7), la mise à jour (5.11).

### 5.4 Service `System` : l'essentiel
Dans le main, l'implémentation Linux (D-Bus et outils du système) de ce qu'il faut pour écrire en déplacement : Wi-Fi (radio, réseaux, connexion, oubli, état, portail détecté) et Ethernet, luminosité et son avec les touches du ThinkPad, les deux batteries (niveau, charge, puissance, autonomie ; à 15 % le segment s'inverse, à 3 % point de restauration puis veille), veille, extinction et redémarrage avec leur confirmation, délais d'écran et de veille, rabat et réveil, date, heure et fuseau, « À propos ».
**Vérifiable** : sur le X250, je choisis un réseau Wi-Fi, je règle la luminosité et le volume aux touches, je vois la batterie, je mets en veille et j'éteins, sans quitter l'app.
Codé (13 novembre 2026), à vérifier sur le X250 : service `System` Linux dans le main (`platform-desktop/src/main/system/`), actif sous Linux en mode appareil, qui pilote les outils du système plutôt que D-Bus directement : NetworkManager par `nmcli` (radio, réseaux et leur signal, connexion, mot de passe refusé sans profil laissé derrière, oubli, adresse, portail signalé jamais ouvert, Ethernet, « réseau perdu » quand NetworkManager le dit), rétroéclairage (`/sys`, `brightnessctl`, jamais noir), PipeWire (`wpctl`), les deux batteries (`/sys/class/power_supply` : niveau, usure, puissance, autonomie), processeur et température toutes les 5 s, `systemctl suspend|reboot|poweroff`, délais d'écran et de veille confiés à `swayidle` relancé à chaque réglage, heure automatique et fuseau (`timedatectl`), Bluetooth allumé ou coupé et appareils connus (`bluetoothctl`), « À propos » (modèle, NixOS et sa génération, démarrage, stockage, disque chiffré). Réglages de l'appareil gardés dans `system.json` ; relecture complète au réveil. L'interface y accède par IPC (`connectSystem`, instantané puis changements ; seules les actions du service passent) ; `--simulate-system` passe désormais lui aussi par le main. Dans le cœur : touches du ThinkPad (luminosité, volume, muet : la jauge bouge, le segment s'allume une seconde, le message le dit), batterie faible dite une fois sous le seuil, à 3 % point de restauration de la scène, message puis veille. Tests : lecture des sorties réelles des outils, faux X250 sous Node, IPC, navigateur, bout en bout avec `--simulate-system`. Le rabat (veille par logind) et les droits sans mot de passe viennent avec le flake (5.9) ; clé USB, imprimantes, mode nuit effectif, écran externe et clavier avec 5.7.

### 5.5 Moniteur
L'écran plein cadre du moniteur (Super M, `:moniteur`, ou un clic sur le segment `cpu`), entièrement dans la matière du système : en tête la machine et la durée affichée (1 min, 10 min, 1 h), puis une grille de cadrans avec leurs courbes : processeur (total, par fil, fréquence, charge moyenne), températures et ventilateur, mémoire, réseau, batterie (watts, usure), disque, les processus de Charpentier, graphique (charge « non mesurée » tant qu'elle n'est pas fiable). Côté service : un échantillon par seconde lu dans `/proc` et `/sys`, une heure d'historique en mémoire dans le main, pour toutes les séries tant que le segment `cpu` ou l'écran est affiché ; l'interface ne s'abonne aux mesures détaillées que lorsque l'écran est ouvert. X250 seulement ; le segment se retire dans les réglages (« Ligne système »).
**Vérifiable** : sur le X250, le segment `cpu` suit la charge ; un clic ouvre le moniteur, dont les courbes couvrent la dernière heure ; pendant que je tape, le segment ne bouge pas.
Codé (13 novembre 2026), à vérifier sur le X250 : `SystemMonitor` de la plateforme (un échantillon par seconde, une heure gardée) ; dans le main, l'échantillonneur Linux (`linux-monitor.ts` : `/proc/stat` par fil, fréquences, charge moyenne, températures du processeur et de la carte, ventilateur du ThinkPad, mémoire, réseau, disque, puissance des batteries, fréquence graphique ; modèle graphique par `lspci`, écran par `swaymsg`, débit du Wi-Fi par `nmcli`), actif tant que le segment `cpu` est affiché ou l'écran ouvert, au repos sinon ; les processus de l'app par Electron (principal, interface, graphique : le correcteur est un fil du principal) et les documents ouverts. L'écran (`Monitor.tsx`) : plein cadre jusque sous le pied, matière du système, en-tête (équerre, machine, durées 1 min, 10 min, 1 h en onglets, Échap), huit cadrans en trois colonnes, courbes SVG sans couleur moyennées sur 300 points au plus ; il ne reçoit des mesures que lorsqu'il est affiché (IPC `system.monitorOpen`). Ouvert par `⊞M`, `:moniteur` ou un clic sur `cpu` ; le X250 simulé a son moniteur simulé (`?x250`, `--simulate-system`). Tests : lecteurs, échantillonneur sur un faux X250, IPC, navigateur, bout en bout.

### 5.6 Verrouillage et premier démarrage
Code de 4 à 8 caractères demandé au réveil (ou après 15 min, ou jamais), empreinte gardée hors du projet, attente croissante après 5 erreurs, écran de verrouillage plein cadre sans contenu de projet ; le terminal de secours est neutralisé tant que l'appareil est verrouillé. Premier démarrage en quatre étapes passables (Wi-Fi, code, synchronisation, Compagnon) avant la note de bienvenue ; il prévient que le disque est chiffré [D-25] : mot de passe oublié, disque perdu, la synchronisation est la seule copie. Les réglages affichent « Disque chiffré : oui ».
**Vérifiable** : je rabats l'écran, je le rouvre, le code m'est demandé et aucun texte n'est visible avant ; un appareil neuf me guide jusqu'à mon roman synchronisé.
Codé (13 novembre 2026), à vérifier sur le X250 : nouveau point de contribution du cœur, la **couverture** d'une fonctionnalité (`features/cover.tsx`) : une page par-dessus tout sauf les bandes du haut, le reste reste monté mais inerte, aucun raccourci ni menu ne passe, et le curseur revient où il était (ou dans le texte). Code de 4 à 8 lettres ou chiffres gardé en empreinte PBKDF2 (WebCrypto, `lock-keeper.ts`, commun à l'appareil et au simulé) dans `system.json`, jamais en clair ; attente de 30 s après 5 erreurs, doublée à chaque série. Le main verrouille avant la veille (Electron `powerMonitor`), selon le réglage (à chaque réveil, après 15 min de veille : une veille plus courte rouvre sur le texte, jamais) ; mode `locked` de Sway pendant le verrou (le terminal de secours y sera neutralisé par le flake, 5.9). Écran du verrou (rendu 5) : l'heure, la date en petites capitales, champ gravé de points vermillon, tremblement unique, attente affichée ; ligne système réduite à `charpentier`, `verrouillé`, `bat` et l'heure. `⊞L`, `:verrou` et « Verrouiller » au menu du système ; réglages : choisir, changer (code actuel demandé) ou retirer le code, verrouiller maintenant, « Disque chiffré : oui ». Premier démarrage (rendu 6) avant la note de bienvenue : Wi-Fi, code (deux fois, ou « Sans code »), synchronisation (avec la phrase sur le disque chiffré), Compagnon ; chaque étape avec « Continuer ⏎ » et « Plus tard Échap » ; une fois passé, il ne revient plus. Sur le web, `?x250=premier` simule un appareil neuf. Tests : gardien du code, verrou et veille sous Node, navigateur (verrou, raccourcis bloqués, retour au texte, premier démarrage).

### 5.7 Périphériques et confort
Clé USB (détection, copie du miroir Markdown de tous les projets dans `Charpentier/<date>/`, éjection) ; impression (imprimantes du réseau sans pilote seulement, PDF en mise en page de manuscrit : scène, chapitre ou manuscrit) ; Bluetooth (appareils connus, recherche, appairage, oubli) ; écran externe (« externe seul » : l'app passe sur le moniteur branché, l'écran du portable s'éteint, retour au débranchement ; échelle 100, 125 ou 150 % ; pas de duplication en v1) ; mode nuit (automatique de 21 h à 7 h, chaleur) ; disposition du clavier (AZERTY, BÉPO, QWERTY) et pavé tactile.
**Vérifiable** : je copie mon roman sur une clé, j'imprime une scène, j'appaire un casque, je branche un écran, le mode nuit s'active le soir.
Codé (13 novembre 2026), à vérifier sur le X250 : clé USB vue par `lsblk` et `udevadm monitor`, montée par `udisksctl` ; « Copier mes textes » (`⊞U`, menu, réglages) écrit tous les projets en Markdown, sans l'état du miroir, dans `Charpentier/<date>/` (l'heure en plus pour une seconde copie le même jour), rien n'est effacé sur la clé ; « Éjecter » la démonte et l'éteint. Impression (`⊞P`, `:imprimer scène|chapitre|manuscrit`, menu) : feuille en ardoise (quoi, imprimante, copies) ; le cœur compose la page du manuscrit à partir des scènes (Literata 12 pt, interligne double, chapitre sur une nouvelle page, `#` entre les scènes, montrée à l'imprimante seule), Electron en fait un PDF A4 (marges 2,5 cm, titre courant et folio en tête), `lp` l'envoie ; imprimantes par `lpstat` (celles du réseau sans pilote que CUPS connaît). Bluetooth : recherche, appairage, confiance et connexion par `bluetoothctl` (un appareil qui demande un code n'est pas encore pris en charge). Écran externe « externe seul » par Sway (il prend l'app à son échelle 100, 125 ou 150 %, l'écran du portable s'éteint et revient au débranchement), disposition du clavier et pavé tactile par Sway, lumière chaude de la nuit par `wlsunset` (toujours, ou de 21 h à 7 h). Le journal devient un nouveau tableau à chaque message (un message seul redessine la ligne). Tests : faux X250 sous Node (clé, écran, clavier, nuit, impression, appairage), export Markdown, navigateur (copie, impression, appairage). Reste : la saisie d'un code d'appairage, la chaleur réglable de la nuit.

### 5.8 Build Linux et empaquetage Nix
Build Electron pour Linux x64 (dictionnaire Hunspell compris), puis paquet Nix reproductible de l'app (dépendances npm figées). En attendant, une installation manuelle du build Linux est acceptable.
**Vérifiable** : `nix build .#charpentier` produit l'app, qui démarre sur une machine NixOS.

### 5.9 Flake NixOS du X250
`nix/flake.nix` et `nix/hosts/x250/` : `nixos-hardware` pour le X250 ; disque chiffré (LUKS) avec un mot de passe au démarrage, sur un écran sobre (fond `#14161a`, chasse fixe) [D-25] ; greetd en ouverture de session automatique, qui lance un Sway minimal (pas de barre ni de bordures, Charpentier en plein écran par `for_window`, raccourcis Sway supprimés, un combo caché pour un terminal de secours, qui ne commence jamais par Super + une lettre de la ligne système, et un mode « verrouillé » où il est neutralisé) ; Electron en Wayland natif ; les services que demande `System` (NetworkManager, BlueZ, PipeWire, UPower, udisks, CUPS) et les droits pour les piloter sans mot de passe ; keyd ; TLP ; veille au rabat de l'écran avec reprise directe sur le texte ; systemd-boot sans délai, démarrage silencieux, services inutiles désactivés ; un TTY de secours (Ctrl+Alt+F2).
**Vérifiable** : le X250 démarre en quelques secondes directement sur mon texte ; rabattre l'écran puis le rouvrir me ramène au curseur.

### 5.9 bis Clé d'installation
Une image d'installation tirée du flake (NixOS minimal, le système du X250 déjà construit dedans, rien à télécharger) et un installateur en mode texte qui **efface tout le disque** (choix de l'auteur) : partitions EFI et LUKS, mot de passe du disque saisi deux fois par l'auteur, puis installation. Le Wi-Fi se règle au premier démarrage, dans l'app (5.6) : l'appareil n'a que le Wi-Fi au départ. `scripts/flash-installer.sh` sur le Mac (choix de l'auteur) : liste les clés USB branchées, demande confirmation avec leur nom et leur taille, n'offre jamais le disque interne, puis écrit l'image. L'image se construit sur une machine Linux (le Mac n'a pas Nix) : prodesk2021, dans un conteneur `nixos/nix`, ou Nix installé sur le Mac avec un constructeur Linux, à décider à ce moment-là.
**Vérifiable** : depuis le Mac, je flashe la clé ; le X250 démarre dessus, efface son disque, s'installe, redémarre, me demande le mot de passe du disque puis ouvre Charpentier sur son premier démarrage.

### 5.10 Déploiement à distance
Pour le développement : mise à jour du X250 depuis le Mac par `nixos-rebuild switch --flake .#x250 --target-host …` quand il est sur le réseau de la maison ; connexion au serveur de synchro (étape 4a) pour retrouver les projets.
**Vérifiable** : je mets à jour le X250 sans le toucher ; une scène écrite sur le Mac s'y retrouve, et inversement.

### 5.11 Mises à jour par le serveur [D-28]
Sur le Mac, `scripts/publish-update.sh` construit le système du X250 (sur la machine Linux de construction de 5.9 bis), le signe avec une clé gardée sur le Mac et le publie sur le serveur de synchro : un cache binaire Nix et un pointeur « dernière version » (numéro, date, notes), servis aux seuls appareils du compte (jeton d'appareil de 4.2). Sur le X250, un service vérifie toutes les heures quand le réseau est là, télécharge, vérifie la signature (clé publique posée à l'installation), prépare la version pour le prochain démarrage et le dit à l'app : message « mise à jour prête · redémarrer », ligne dans les réglages (« À propos » : version installée, version prête, Redémarrer, Revenir à la version précédente). Rien ne s'applique pendant l'écriture ; l'ancienne version reste au menu de démarrage. Aucune donnée personnelle dans une version publiée (test). Apparence et comportement : DESIGN §4.12 « Mises à jour » (segment `maj`, `⊞R` puis `⏎ ⏎`, panneau, « À propos », écran du disque, échecs, retour à la version précédente), rendus `docs/design/x250/9` à `12`.
**Vérifiable** : je publie depuis le Mac ; le X250, ailleurs qu'à la maison, annonce la mise à jour, redémarre dessus et garde mon texte ; je reviens à la version précédente depuis les réglages.

---

## Étape 6 : l'entretien avec le Compagnon et les agents spécialisés [D-26, D-27]
L'Atelier se remplit en parlant, et le Compagnon gagne des agents spécialisés pour le travail de fond (D-27). La page « Méta » s'appelle déjà « Le projet » (13 novembre 2026). 6.1 et 6.2 sont codées (avant la suite de l'étape 5, décidé le 13 novembre 2026) et attendent l'essai avec le vrai Compagnon ; 6.3 et 6.4 viennent après l'étape 5, l'auteur voulant d'abord installer le X250 complet (13 novembre 2026).

### 6.1 Agent d'entretien
Un agent du paquet `agents`, en deux modes. **Libre** : il répond à ce que l'auteur dit et range ce qui relève de l'Atelier dans la bonne section (le projet, personnages, structure, règles du monde, indices), en propositions par l'`AgentWriter`, sortie validée par schéma et bornée ; il dit où il a rangé quoi. **Dirigé** : il pose une question à la fois, section par section, en commençant par ce qui est vide ou seulement proposé ; les questions de chaque section viennent de son agent spécialisé (D-27), le Compagnon restant la seule voix. Historique dans le document mentor, à part de la conversation sur le texte. Jamais un champ validé ou rejeté, jamais une ligne du roman (tests adversariaux).
**Vérifiable** : je dis « mon héroïne, Hélène, est batelière sur la Loire en 1890 » ; une fiche Hélène est proposée dans Personnages, la Loire de 1890 dans Règles du monde ; en mode dirigé, il me demande ce qui manque.
Codé (13 novembre 2026), pas encore déclaré fait : `interviewTurn` (`packages/agents/src/interview.ts`) et ses spécialistes de section ; fil `interview` du document mentor ; une proposition peut citer les mots de l'auteur (`InterviewEvidence`, « d'après l'entretien » dans l'Atelier) ; garde-fous : citation exacte des derniers messages de l'auteur, champ connu, valeur d'une liste, 600 signes au plus, ni dialogue ni prose, rien sur un champ validé ou une fiche rejetée, réponse refusée deux fois remplacée par un refus. Service `agents.interview` jusqu'au main, une tâche à la fois par projet. Tests unitaires verts ; reste l'essai en direct (`pnpm test:llm`, trois cas d'entretien) avec la clé de l'auteur, puis la page (6.2) pour l'essayer de mes mains.

### 6.2 Page de l'entretien dans l'Atelier
En tête du rail : la conversation, le choix du mode, et ce qu'elle propose qui apparaît dans les sections au fil de l'échange, à valider ou rejeter sur place ou dans la fiche.
**Vérifiable** : sans quitter la page, je valide une proposition née de la conversation et je la retrouve validée dans sa fiche.
Codé (13 novembre 2026), pas encore déclaré fait : « Entretien » en tête du rail (`⌘0` ; la taille du texte par défaut passe à `⌥⌘0`), une colonne de conversation sur la page, parole de l'auteur en creux, propositions sous chaque réponse (chemin cliquable, Valider / Rejeter, `V` `X` et `⌘↑` `⌘↓` quand la saisie est vide), onglets Libre | Dirigé (`⌘⇧M`, préférence d'appareil), en dirigé la ligne d'avancement et la carte de la question avec son « pourquoi », « Passer `⇥` », « Plus tard `⇧⇥` », « Autre section… `⌘⇧S` » ; note de bienvenue. Test de bout en bout avec un Compagnon simulé. Reste : l'essayer avec le vrai Compagnon dans l'app de bureau, et la revue de la session de design.

### 6.3 Agents spécialisés à la demande [D-27]
Un agent par section de l'Atelier, chacun avec son prompt et son schéma, lancé par une commande : vérifier la structure sur tout le manuscrit (actes, arcs, tension), suivre les indices (posés, exploités, révélations préparées), faire le point sur un personnage (ce qu'il veut, ce qu'il sait, scène par scène). Ils lisent le document du projet et y laissent propositions et signalements, ou un bilan dans la conversation ; une tâche à la fois par projet ; coût annoncé avant un travail sur tout le manuscrit. Chacun a son test de bout en bout sur un manuscrit d'exemple, et un essai en direct avec la clé de l'auteur avant d'être déclaré fait.
**Vérifiable** : je lance « Vérifier la structure » ; le Compagnon signale un arc abandonné, ancré dans la scène où il s'arrête, et propose l'acte qui manque dans Structure.

### 6.4 Textes de référence et choix de style
Depuis la page de l'entretien, j'importe un texte que j'admire (ou un des miens) : `.txt`, `.md`, `.epub`, `.pdf`. Le Compagnon en dégage les choix stylistiques (point de vue, temps, longueur et rythme des phrases, part du dialogue, densité des descriptions, registre, façon d'ouvrir et de clore un chapitre), mesurés en partie sur l'appareil (statistiques) et en partie par le modèle sur des extraits tirés au hasard, coût annoncé avant. **Rien du texte n'est repris** : il n'est ni gardé dans le projet ni cité dans les résultats (garde-fou : aucune suite de mots du texte source dans ce qui est proposé) ; seuls restent des traits décrits avec ses propres mots. Ils arrivent en propositions que j'adopte ou non ; adoptés, le Compagnon s'en sert ensuite (« vous aviez choisi le présent »). À décider avant de coder : où vivent ces choix (une section « Style » dans Le projet, ou une page de l'Atelier), et les bibliothèques de lecture (licences à vérifier).
**Vérifiable** : j'importe un roman en `.epub` ; l'entretien me propose cinq à dix choix de style, aucun ne contient une phrase du livre ; j'en adopte deux, et une remarque du Compagnon s'y réfère.
