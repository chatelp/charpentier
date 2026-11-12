# Plan des étapes 1 à 3

Chaque phase est courte, se termine par un résultat vérifiable dans l'app (ou par des tests quand la phase n'a pas d'interface), puis par un arrêt pour le feu vert. Les tests prioritaires sont écrits dans la phase qui introduit le code concerné.

Statut : étape 1 réalisée jusqu'à la phase 1.10 (12 novembre 2026) ; étape 2 à venir.

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

### 2.2 Documents dans le main et persistance disque
`Y.Doc` détenus par le main, synchronisés avec l'interface par IPC. Journal append-only + compaction, écritures atomiques. Choix du dossier de bibliothèque ; un projet = un dossier.
**Vérifiable** : j'écris, je tue l'app brutalement, je relance : rien n'est perdu (scénario aussi couvert par un test automatique).

### 2.3 Miroir Markdown sortant
Un `.md` par scène, dossiers par chapitre, frontmatter avec ids, modules en YAML ; écriture différée.
**Vérifiable** : j'ouvre le dossier du projet dans le Finder et je lis mon roman en Markdown, à jour.

### 2.4 Réimport des modifications externes
Surveillance des fichiers, fusion à trois voies appliquée en transaction `mirror`, point de restauration préalable ; chevauchement → variante « Modif. externe » + signalement. Tests prioritaires de réimport.
**Vérifiable** : je corrige une phrase dans un autre éditeur, l'app la reprend ; si j'ai modifié la même phrase dans l'app, je retrouve une variante « Modif. externe ».

### 2.5 Application installable
`.app` macOS non signée.
**Vérifiable** : j'installe Charpentier dans Applications et **je commence à écrire mon roman pour de vrai**. (Jalon : écriture réelle sans risque de perte.)

---

## Étape 3 : mentor v1

Avant de commencer : arbitrer les questions ouvertes 1 à 4 de la SPEC (§22 : fin de scène, remarques pendant l'écriture, place de la marge, nom du mentor).

### 3.1 Correction hors ligne
Service `Spellcheck` (Hunspell fr), règles typographiques françaises, propositions à accepter au clavier, « tout accepter » pour l'orthographe.
**Vérifiable** : réseau coupé, mes fautes et mes espaces manquantes sont signalées ; j'accepte une correction au clavier.

### 3.2 Signalements ancrés et liste de points
Décorations en marge à partir des positions relatives, liste de points à traiter navigable au clavier, résoudre / ignorer.
**Vérifiable** : les signalements restent sur le bon passage quand je réécris autour ; je les parcours depuis la liste.

### 3.3 Paquet `agents` et service LLM
Abstraction multi-fournisseurs complète, Anthropic implémenté, exécution dans le main ; saisie et stockage de la clé (`safeStorage`) ; dégradation hors réseau. Garde-fous « l'IA n'écrit pas » : prompts système, schémas bornés, filtrage, tests adversariaux.
**Vérifiable** : je saisis ma clé ; réseau coupé, un indicateur discret le signale et l'écriture continue ; les tests adversariaux sont verts.

### 3.4 Chat libre
Voix unique du mentor, contexte = scène courante et modules ; historique dans le document mentor.
**Vérifiable** : je pose une question sur ma scène, le mentor répond en français et refuse d'écrire la scène à ma place.

### 3.5 Bottom-up
Analyse de fin de scène → propositions dans Personnages, Méta, Structure, Règles du monde, Indices ; validation, correction, rejet au clavier ; pas de reproposition d'un rejet sans élément nouveau.
**Vérifiable** : je termine une scène où apparaît un nouveau personnage ; une fiche proposée apparaît, je la valide ou la rejette.

### 3.6 Conflits, indices et remarques de métier
Contradictions avec les informations validées, indices non exploités, personnage qui agit sur une information avant de l'apprendre, apparitions d'indices proposées, remarques justifiées par un principe, phrases d'exemple insérables sur action explicite.
**Vérifiable** : j'écris que mon héroïne a les yeux verts alors que sa fiche validée dit bleus ; une annotation apparaît en marge et je tranche (corriger le texte, mettre à jour la fiche, ignorer).

### 3.7 Pendant l'écriture et à la demande
Signalements légers pendant l'écriture, analyse à la demande d'une scène, d'un chapitre ou du manuscrit, grammaire par le LLM.
**Vérifiable** : je demande l'analyse d'un chapitre entier et je reçois des remarques ancrées dans le texte. (Jalon : **v1 fonctionnelle**.)
