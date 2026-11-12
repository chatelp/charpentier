# Charpentier : spécification unifiée

- **Version** : 1.0 (fusion du 12 novembre 2026)
- **Sources** : `SPEC-FONCTIONNELLE.md` (v0.1) et `SPEC-TECHNIQUE.md`, conservés à la racine.
- **Règle de fusion** : la spec fonctionnelle fait foi sur le *quoi*, la spec technique sur le *comment*. Les arbitrages rendus lors de la fusion sont tracés au §0 et marqués **[D-n]** dans le texte.

---

## 0. Journal des décisions de fusion (12 novembre 2026)

| # | Sujet | Décision |
|---|---|---|
| D-1 | Import d'un premier jet | **Reporté après la v1.** L'auteur part de zéro ; l'import n'est pas sur le chemin critique. |
| D-2 | Indices et révélations | **Hybride** : entité de premier rang dans Yjs (indice, fausse piste, révélation), affichée comme un panneau de la vue Structure. |
| D-3 | Portée du suivi des indices en v1 | **Pose → résolution + apparitions + « qui sait »** : scènes de pose et de résolution, scènes où l'élément réapparaît, et à partir de quelle scène chaque personnage (et le lecteur) en a connaissance. Le modèle complet du savoir du lecteur (croyances erronées, vérification scène par scène) est hors v1. Révisé le 12 novembre 2026 (première version : pose → résolution seulement). |
| D-4 | Découpage en documents Yjs | **Un document racine par projet + un document par scène** (qui contient ses variantes) + un document d'historique par scène + un document mentor. |
| D-5 | Historique des scènes | **Points de restauration explicites** (automatiques et manuels). Restaurer = nouvelle transaction. GC Yjs activé. |
| D-6 | Variante analysée par le mentor | Uniquement la **variante active**. |
| D-7 | Document de référence sur desktop | Les `Y.Doc` vivent dans le **processus principal Electron** ; l'interface s'y synchronise par IPC (protocole de synchro Yjs). |
| D-8 | Conflit du miroir Markdown | **Fusion à trois voies** (base = dernier contenu écrit sur disque) appliquée en transaction Yjs ; en cas de chevauchement, la version externe devient une **nouvelle variante** « Modif. externe du … » et un signalement est créé. |
| D-9 | Statut « contredite » | **État dérivé**, non stocké : validée + au moins un signalement de conflit ouvert. |
| D-10 | Correction de la langue | **Hunspell fr + règles typographiques maison**, hors ligne ; le LLM ne traite que la grammaire et les cas douteux. Grammalecte exclu (GPL). |
| D-11 | Frontière « l'IA n'écrit pas » | Deux voies, et deux seulement, par lesquelles un texte d'origine IA entre dans le manuscrit, **toujours sur action explicite de l'auteur** : (a) une correction de langue acceptée, (b) l'insertion d'une **phrase d'exemple** du mentor (une phrase au maximum). Aucun agent n'écrit directement dans un document de scène. |
| D-12 | Premier fournisseur LLM | **Anthropic**, via le SDK `ai`, clé BYOK dans le trousseau de l'OS. |
| D-13 | Mise en forme du texte | Paragraphes, **italique**, **citation en bloc**, **séparateur interne de scène**. Pas de gras ni de titres dans le texte. |
| D-14 | Machine d'écriture initiale | **Le Mac de l'auteur** : la fin de l'étape 2 produit une `.app` macOS non signée. |
| D-15 | Titulaire des droits | **Pierre Chatel**. Dépôt GitHub pas encore choisi (configuration CLA prête, à compléter). |
| D-16 | Design language | **Direction « Perle »** (neumorphisme doux : page plate, outils en relief), deux encres (vermillon pour l'auteur, bleu de Prusse pour le mentor), Literata + Inter embarquées (SIL OFL 1.1). Référence : [DESIGN.md](DESIGN.md). Décidé le 12 novembre 2026. |
| D-17 | Nom du mentor | **Le Compagnon** (le compagnon charpentier qui transmet le métier) ; vouvoie l'auteur, signe ses notes en bleu de Prusse. Répond à la question ouverte n°4. |

Choix par défaut annoncés et non contestés : i18next pour l'i18n ; Vitest (+ mode navigateur, + Playwright Electron) ; signalements rendus en **décorations** ProseMirror (pas de marques dans le contenu) ; un projet = un dossier dans une bibliothèque locale ; IA désactivée dans `apps/web` jusqu'à l'étape 4 ; prompts système en anglais avec réponse imposée dans la langue du projet.

---

# Partie I : le quoi

## 1. Vision

Charpentier est un outil d'aide à l'écriture de romans et de nouvelles, piloté par des agents IA. Il ne rédige pas le livre à la place de l'auteur. Il joue le rôle d'un romancier et éditeur expérimenté « par-dessus l'épaule » : il structure, vérifie la cohérence, pose des questions, signale les faiblesses, explique le métier et propose des améliorations.

Le nom rend hommage à Georges Charpentier, éditeur de Zola, Flaubert et Daudet, et évoque la **charpente** : la structure qui porte le récit.

### Idée centrale : la synchronisation bidirectionnelle

L'outil est organisé en **modules**, du plus abstrait (le méta) au plus concret (le texte). Chaque module est tenu à jour par un agent. Tous les modules restent synchronisés en continu, dans les deux sens :

- **Bottom-up** : l'auteur écrit, et les modules du dessus se remplissent par inférence.
- **Top-down** : l'auteur pose ses intentions dans les modules, qui servent de cadre au texte ; une modification en haut se répercute en signalements dans le texte.
- **Mixte** : l'auteur passe librement de l'un à l'autre.

Analogie : un IDE avec inférence de types. Les intentions déclarées sont les types déclarés, ce que l'agent déduit est le type inféré, le mentor est le linter qui signale les écarts sans réécrire le code.

## 2. Principes non négociables

1. **L'IA n'écrit pas le livre.** Elle ne produit jamais de paragraphe de texte narratif. Même au plus haut niveau d'aide, elle se limite à des exemples ponctuels d'une phrase. Voir [D-11] et §15.
2. **Les décisions de l'auteur ne sont jamais écrasées.** Une information validée ne peut être modifiée que par l'auteur. L'agent peut signaler qu'elle est contredite, jamais la changer.
3. **Tout ce que l'agent déduit est visible comme tel.** Chaque information porte un statut (§7.1) ; l'auteur sait toujours ce qui vient de lui et ce qui vient de l'agent.
4. **Signaler plutôt que corriger.** Face à une incohérence, l'agent pointe l'écart et laisse l'auteur trancher.
5. **Expliquer le pourquoi.** Chaque remarque du mentor est justifiée par un principe du métier, pas seulement par un verdict.

## 3. Publics

- **v1** : un seul utilisateur, l'auteur du projet, romancier débutant. Son roman sert de cas de test (§12).
- **Version publique** : débutants et auteurs confirmés ; le mentor adapte sa pédagogie au profil.
- **Formes** : roman et nouvelle. Scénario et bande dessinée hors périmètre.
- **Langue** : français d'abord (texte et interface). Rien dans la conception ne doit empêcher d'autres langues : chaînes d'interface externalisées, langue portée par le projet, règles typographiques et dictionnaires choisis selon la langue du projet.

## 4. Glossaire

| Terme | Définition |
|---|---|
| Projet | Un livre (roman ou nouvelle). Une bibliothèque (puis un compte) contient plusieurs projets. |
| Manuscrit | L'ensemble du texte d'un projet, organisé en chapitres et scènes. |
| Scène | Unité de base du texte. Appartient à un chapitre, peut être déplacée. |
| Chapitre | Regroupement ordonné de scènes. |
| Variante | Version alternative d'une scène. Une seule est active à un instant donné. |
| Point de restauration | État enregistré d'une variante, auquel l'auteur peut revenir. |
| Module | Un domaine d'information sur le livre (méta, structure, personnages…). |
| Fiche | Une entrée dans un module (un personnage, une règle, un indice…). |
| Statut | État d'une information : proposée, validée, rejetée ; « contredite » est dérivé (§7.1). |
| Mentor | La voix unique par laquelle les agents s'adressent à l'auteur. |
| Signalement | Remarque du mentor rattachée à un passage du texte et/ou à une fiche. |

## 5. Organisation du contenu

### 5.1 Projets

- Plusieurs projets, chacun de type **roman** ou **nouvelle**.
- En v1, un projet est créé vide. La création à partir d'un texte importé est reportée [D-1].

### 5.2 Manuscrit

- Le texte est écrit **dans l'outil**, dans un éditeur intégré.
- Unité de base : la **scène**, regroupée en **chapitres**.
- Scènes et chapitres sont réorganisables, à la souris (glisser-déposer) **et au clavier**.
- **Variantes** : chaque scène peut avoir plusieurs versions ; l'auteur choisit la variante active, les autres sont conservées (couvre les fins alternatives).
- **Historique** : l'auteur peut revenir à un point de restauration antérieur d'une scène, ou créer une variante à partir de ce point [D-5].
- **Mise en forme** autorisée : paragraphes, italique, citation en bloc, séparateur interne de scène [D-13].

### 5.3 Les modules

| Module | Contenu | Version |
|---|---|---|
| **Méta** | Pitch, résumé, intention, thèmes principaux, ton, genre(s), public visé. | v1 |
| **Structure** | Actes, arcs (principal et secondaires), intrigues, rythme, modèle narratif optionnel (§5.4). Le découpage en chapitres est celui du manuscrit, référencé et non dupliqué. | v1 |
| **Indices et révélations** | Panneau de Structure (§5.6). | v1 |
| **Personnages** | Une fiche par personnage (§5.5). | v1 |
| **Règles du monde** | Lois, contraintes et fonctionnement de l'univers. | v1 |
| **Thèmes et motifs** | Symboles, images, motifs récurrents, leurs apparitions et évolution. | v2 |
| **Lieux et objets** | Description, rôle, scènes d'apparition. | v2 |
| **Chronologie** | Temps de l'histoire, distinct de l'ordre du récit. | v2 |
| **Relations** | Liens entre personnages et leur évolution. | v2 |
| **Style et voix** | Voix narrative, point de vue, temps, registre, tics, règles de style. | v2 |
| **Documentation** | Recherches, sources, notes rattachables à des scènes ou fiches. | v2 |
| **Carnet d'idées** | Idées en vrac ; le mentor peut proposer de les ranger. | v2 |
| **Texte** | Le manuscrit (§5.2). | v1 |

### 5.4 Modèles narratifs

- Si l'auteur choisit un modèle (trois actes, voyage du héros, Save the Cat…), l'outil s'en sert pour guider : il situe chaque scène dans le modèle et repère les étapes manquantes ou mal placées.
- Sinon, la structure est libre.
- En bottom-up, l'agent peut détecter qu'un modèle émerge et le proposer (statut « proposée »).

### 5.5 Fiche personnage

- **Identité et apparence** : nom, âge, physique, métier, lieu de vie.
- **Psychologie** : désir, peur, blessure, contradiction, secret.
- **Arc** : évolution au fil du récit, étapes clés.
- **Relations** : liens avec les autres personnages (le module Relations arrive en v2 ; en v1, champ libre).
- **Voix** : manière de parler, tics de langage, vocabulaire.
- **Apparitions** : scènes où le personnage apparaît (rempli automatiquement).

Chaque champ porte son propre statut.

### 5.6 Indices et révélations [D-2, D-3]

- Une fiche par élément, de type **indice**, **fausse piste** ou **révélation**.
- Chaque fiche relie une ou plusieurs **scènes de pose** à une ou plusieurs **scènes de résolution** (exploitation de l'indice, résolution de la fausse piste, préparation de la révélation).
- **Apparitions** : les scènes où l'élément réapparaît entre la pose et la résolution (remplies automatiquement en « proposée », ajustables).
- **Qui sait** : pour chaque personnage concerné, et pour le **lecteur**, la scène à partir de laquelle il a connaissance de l'élément. C'est ce qui permet de suivre l'écart « l'enquêteur sait, le lecteur pas encore » (ou l'inverse).
- Le mentor signale : un indice posé jamais exploité, une révélation non préparée, une fausse piste non résolue, et un personnage qui agit sur une information avant la scène où il l'apprend.
- Affichage : panneau de la vue Structure, à côté des actes et arcs.
- Hors v1 : modèle complet du savoir du lecteur (ce qu'il croit à tort, vérification de chaque scène) ; vue sur la Chronologie (v2).

## 6. Le mentor

### 6.1 Une seule voix
Tous les agents s'expriment à travers un seul mentor, à la voix cohérente. L'auteur n'a pas à savoir quel agent a produit une remarque.

### 6.2 Quand le mentor réagit (mode mixte par défaut)
- **Pendant l'écriture** : discret ; signalements légers (orthographe, incohérence factuelle évidente).
- **En fin de scène** : analyse complète (structure, personnages, rythme, style, cohérence) et mise à jour des modules.
- **À la demande** : analyse d'une scène, d'un chapitre ou du manuscrit.

### 6.3 Niveaux d'intervention (réglables en v2)
Discret, Mentor (défaut), Exigeant.

### 6.4 Niveaux d'aide rédactionnelle
Niveau minimal et par défaut :
- **Pistes** : le mentor pointe le problème, l'explique, suggère des directions sans rédiger.
- **Exemples ponctuels** : il peut reformuler **une phrase** à titre d'exemple. Jamais un paragraphe. L'auteur peut insérer cette phrase dans son texte par une action explicite [D-11].

Niveaux supérieurs à définir (v2), dans le respect du principe n°1.

### 6.5 Pédagogie
Socratique, explicative (principe n°5), références à des œuvres avec parcimonie, adaptation au profil (version publique).

### 6.6 Mémoire de progression (v2)
Suivi des faiblesses récurrentes d'un chapitre à l'autre ; signale progrès et rechutes.

### 6.7 Chat libre
L'auteur peut dialoguer librement avec le mentor.

## 7. Synchronisation des modules

### 7.1 Statuts des informations [D-9]

Chaque information (fiche ou champ de fiche) porte un statut visible :

| Statut | Stocké | Signification |
|---|---|---|
| **Proposée** | oui | Déduite par l'agent, en attente de l'auteur. |
| **Validée** | oui | Saisie ou validée par l'auteur. Seul l'auteur peut la modifier. |
| **Rejetée** | oui | Proposition refusée. L'agent ne la repropose pas sauf élément nouveau dans le texte (la valeur rejetée et sa justification sont conservées pour le vérifier). |
| **Contredite** | non, dérivé | Information validée qui porte au moins un signalement de conflit ouvert. Résoudre le conflit ne lui fait pas perdre la validation. |

Toute saisie directe de l'auteur est validée d'office. Toute modification par l'auteur d'une information proposée la rend validée.

### 7.2 Bottom-up
L'agent remplit les fiches en statut « proposée » ; l'auteur valide, corrige ou rejette, au fil de l'eau ou par lot. Exemples : nouveau personnage nommé → fiche proposée ; modèle narratif émergent → proposé dans Structure.

### 7.3 Top-down (complet en v2)
Quand l'auteur modifie un module : liste des passages concernés, surlignage dans le texte, plan de révision ordonné. Le texte n'est jamais modifié automatiquement.

### 7.4 Conflits
Quand le texte contredit une information validée : annotation dans la marge, ajout à la liste de points à traiter, et l'auteur tranche : corriger le texte, mettre à jour la fiche, ou ignorer.

## 8. Correction de la langue [D-10]

- Orthographe, grammaire, typographie française (espaces insécables, guillemets, tirets de dialogue).
- L'orthographe et la typographie fonctionnent **hors ligne** ; la grammaire et les cas douteux passent par le LLM quand il est disponible.
- Chaque correction est proposée et à accepter. Un bouton « tout accepter » existe pour l'orthographe pure seulement.

## 9. Import et export

- **Import d'un premier jet** : reporté après la v1 [D-1]. Quand il viendra : analyse et remplissage des modules en « proposée », découpage en chapitres et scènes ajustable, validation par lot.
- **Export (v2)** : manuscrit éditeur normalisé, EPUB, PDF, bible du roman.
- Le miroir Markdown (§14) n'est pas un export : c'est une copie lisible tenue à jour en continu.

## 10. Collaboration (après la v1)

Bêta-lecteurs (lecture, commentaires) et éditeur humain (annotations distinguables de celles du mentor), à ne pas rendre impossibles : les signalements portent un auteur (`mentor` ou une personne). La co-écriture est hors périmètre.

## 11. Périmètre par version

### v1
- Projets multiples, création vide.
- Éditeur par scènes et chapitres, variantes, historique (points de restauration).
- Modules Méta, Personnages, Structure (avec modèles narratifs optionnels), Règles du monde, Indices et révélations (pose → résolution, apparitions, qui sait).
- Mentor : voix unique, mode mixte, statuts, bottom-up, annotations en marge, liste de points à traiter, chat libre, aide rédactionnelle minimale (pistes + exemples d'une phrase insérables).
- Correction de la langue (orthographe et typographie hors ligne, grammaire par LLM).
- Hôte desktop macOS avec miroir Markdown ; hôte web compilable et lançable (sans IA).

### v2
- Modules Lieux et objets, Chronologie, Relations, Style et voix, Thèmes et motifs, Documentation, Carnet d'idées.
- Top-down complet. Niveaux d'intervention et d'aide réglables. Mémoire de progression. Exports.

### Plus tard
- Import d'un premier jet [D-1].
- Version publique avec adaptation débutant / confirmé.
- Collaboration. Autres langues.

## 12. Cas de test : le roman de l'auteur

Littérature générale, polar et science-fiction :
- **Littérature générale** : profondeur psychologique, arcs intérieurs, voix et style.
- **Polar** : indices, fausses pistes, révélations préparées (§5.6).
- **SF** : Règles du monde dès la v1, avec détection des incohérences entre le texte et les règles posées.

---

# Partie II : le comment

## 13. Architecture : le modèle VS Code

- **Un seul cœur applicatif web** (UI, éditeur, modules, orchestration), partagé à 100 %.
- **Des hôtes** : `web` (navigateur, capacités réduites), `desktop` (Electron : fichiers locaux, persistance native, agents locaux), `appliance` (build desktop lancé avec `--appliance` sur le ThinkPad X250).
- **Une couche de services de plateforme** : interfaces abstraites dans `platform`, une implémentation par hôte. Le cœur n'importe **jamais** d'API propre à un hôte. Cette couche existe dès le premier commit.

Services (à affiner) :

| Service | Rôle | web (étape 1) | desktop (étape 2+) |
|---|---|---|---|
| `Documents` | Ouvrir et synchroniser les `Y.Doc` d'un projet | `Y.Doc` locaux + y-indexeddb | Pair IPC du processus main [D-7] |
| `Storage` | Bibliothèque de projets, préférences | IndexedDB | Dossiers locaux |
| `Sync` | Synchro distante | absent (étape 4) | absent (étape 4) |
| `FileMirror` | Miroir Markdown et réimport | absent | main process |
| `LLM` / `Agents` | Appels LLM, exécution des agents | désactivé | main process |
| `Secrets` | Clés BYOK | absent | `safeStorage` |
| `Spellcheck` | Orthographe hors ligne | Hunspell en JS (worker) | idem |
| `Keybindings` | Raccourcis propres à l'hôte | navigateur | Electron |
| `System` | Réseau, batterie, luminosité, veille | absent | appliance uniquement |

## 14. Décisions techniques actées

| Sujet | Décision |
|---|---|
| Langage | TypeScript strict partout |
| Front | React |
| Éditeur | TipTap (ProseMirror), extensions libres uniquement (pas de TipTap Pro) |
| Modèle de données | Local-first, CRDT **Yjs** comme source de vérité |
| Liaison éditeur ↔ CRDT | Extension Collaboration de TipTap, qui s'appuie sur `@tiptap/y-tiptap` (fork maintenu de y-prosemirror, même encodage). Le schéma de l'éditeur est vérifié identique à celui de `schema` par un test. |
| Persistance web | y-indexeddb |
| Persistance desktop | Fichiers locaux (journal de mises à jour Yjs + compaction) ; SQLite seulement si un index s'avère utile |
| Miroir lisible | Le CRDT fait foi ; miroir Markdown écrit en continu, métadonnées en YAML à côté ; modification externe réimportée comme une édition (§17) |
| Synchro (étape 4) | Hocuspocus auto-hébergé |
| Hébergement | Tout auto-hébergé (homelab Docker, VPS possible au lancement public) |
| Desktop | Electron ; pouvoirs natifs dans le main, IPC via preload, `contextIsolation` activé |
| Document de référence sur desktop | Dans le processus main ; l'interface est un pair Yjs via IPC [D-7] |
| IA | Multi-fournisseurs derrière une abstraction, SDK `ai` ; Anthropic implémenté en premier [D-12] |
| Exécution des agents | Paquet `agents` agnostique de l'environnement, exécuté côté serveur (web) et dans le main Electron (desktop) ; BYOK via `safeStorage` en local |
| Annotations | Positions relatives Yjs stockées dans le document racine, rendues en **décorations** ProseMirror (aucune marque dans le contenu) |
| Correction hors ligne | Hunspell fr (dictionnaire sous MPL 2.0) + règles typographiques maison [D-10] |
| i18n | i18next ; toutes les chaînes d'interface externalisées dès le début |
| Tests | Vitest ; mode navigateur (Chromium) pour le web ; Playwright Electron pour le desktop |
| Monorepo | pnpm + Turborepo |

## 15. Modèle de données Yjs [D-4, D-5, D-6, D-9, D-13]

Toutes les clés et identifiants sont en anglais. Les identifiants sont des chaînes aléatoires stables (pas des index).

### 15.1 Documents d'un projet

| Document (guid) | Contenu |
|---|---|
| `project:<pid>` | Racine : métadonnées, arbre du manuscrit, modules, signalements |
| `project:<pid>/scene:<sid>` | Contenu de la scène : une `Y.XmlFragment` de premier niveau par variante (`variant:<vid>`) |
| `project:<pid>/scene:<sid>/history` | Points de restauration de la scène |
| `project:<pid>/mentor` | Fils de chat, (v2) mémoire de progression |

Ce découpage permet le chargement paresseux et correspond aux documents que Hocuspocus multiplexera sur une seule connexion à l'étape 4.

### 15.2 Document racine

Règle de construction : tout ce que deux répliques pourraient créer en même temps est un **type de premier niveau nommé** (Yjs fusionne deux types de premier niveau de même nom, alors que deux sous-types créés sous la même clé s'écrasent). Les sous-types imbriqués ne sont créés que sous une clé aléatoire unique (un chapitre, une scène, une entité, un signalement).

```
meta:               Y.Map { id, title, kind: 'novel' | 'short-story', language: 'fr', schemaVersion, createdAt }
chapters:           Y.Map<chapterId, Y.Map { title, order, createdAt, trashedAt? }>
scenes:             Y.Map<sceneId, Y.Map {
                      title, chapterId, order, createdAt, trashedAt?,
                      activeVariantId,
                      variants: Y.Map<variantId, Y.Map { name, createdAt, origin: 'author' | 'external-edit' | 'checkpoint', trashedAt? }>
                    }>
module:meta         Y.Map — champs directement (pitch, summary, intention, themes, tone, genres, audience)
module:structure    Y.Map — champs directement (narrativeModel)
module:characters   Y.Map<entityId, Entity>
module:acts         Y.Map<entityId, Entity>   (title, summary, sceneIds)
module:arcs         Y.Map<entityId, Entity>   (title, kind, summary, sceneIds)
module:worldRules   Y.Map<entityId, Entity>   (title, statement, consequences)
module:clues        Y.Map<entityId, Entity>   (kind: 'clue' | 'red-herring' | 'reveal', title, description,
                                               plantedIn, resolvedIn, appearsIn : [sceneId],
                                               knownBy:<characterId> et knownBy:reader : { fromSceneId })
signals:            Y.Map<signalId, Y.Map Signal>
```

- **Ordre** : chapitres et scènes portent une clé `order` en indexation fractionnaire, et la scène porte son `chapterId`. Tri par `(order, id)` : deux insertions concurrentes au même endroit produisent parfois la même clé, et l'id départage de la même façon partout ; une insertion ultérieure entre deux clés égales ré-indexe la fratrie. Un déplacement est l'écriture de deux champs : deux déplacements concurrents ne dupliquent jamais une scène (le dernier gagne).
- **Corbeille** : chapitres, scènes, variantes et entités ne sont jamais supprimés, seulement marqués `trashedAt` / `$trashedAt` et restaurables.
- **Champ** : trois emplacements dans la map qui le contient, chacun avec un seul type d'auteur :

  | Clé | Contenu | Écrit par |
  |---|---|---|
  | `<champ>#value` | `{ value, at }` : la valeur de l'auteur | l'auteur seulement |
  | `<champ>#proposal` | `{ value, agent, at, evidence: [{ sceneId, variantId, quote }], evidenceHash }` | les agents ; effacé par l'auteur |
  | `<champ>#rejected` | `[{ value, evidenceHash, at }]` : propositions refusées | l'auteur seulement |

  Le statut est **dérivé** : validé s'il existe une valeur de l'auteur, sinon proposé s'il existe une proposition, sinon rejeté. Comme la valeur de l'auteur et la proposition d'un agent ne partagent jamais un emplacement, aucune écriture ni aucune fusion entre appareils ne peut laisser un agent écraser une décision de l'auteur. Un agent ne repropose une valeur rejetée que si `evidenceHash` diffère (élément nouveau dans le texte).
- **Entity** : `Y.Map { $createdBy: 'author' | 'agent:<name>', $createdAt, $validatedAt?, $rejectedAt?, $trashedAt?, …emplacements des champs }`. Statut de l'entité dérivé : rejetée si `$rejectedAt`, validée si créée par l'auteur ou `$validatedAt`, proposée sinon. Un agent ne peut pas proposer de champ sur une entité rejetée.
- **Contredite** n'est pas stocké : un champ est contredit s'il est validé et visé par un `Signal` de type `conflict` ouvert (`displayStatus`).

### 15.3 Signalements

```
Signal: Y.Map {
  kind: 'language' | 'conflict' | 'craft' | 'clue' | 'external-edit',
  state: 'open' | 'resolved' | 'dismissed',
  author: 'mentor' | <personId>,           // ouvre la porte aux annotations humaines
  textAnchor?: { sceneId, variantId, start, end },   // Y.RelativePosition au format JSON
  fieldRef?: { module, entityId?, field },
  message, principle?,                      // le « pourquoi » (principe n°5)
  suggestion?: { kind: 'correction' | 'example', text },
  createdAt, closedAt?
}
```

Les positions relatives sont résolues dans le document de la scène visée ; elles survivent aux éditions concurrentes. Le rendu passe par des décorations ProseMirror. Un agent peut résoudre ses propres signalements ouverts, jamais rouvrir un signalement écarté par l'auteur.

### 15.4 Scène, variantes, historique

- Document de scène : une `Y.XmlFragment` **de premier niveau** par variante, nommée `variant:<variantId>`. L'éditeur se lie au fragment de la variante active. Deux appareils qui ouvrent la même variante pour la première fois fusionnent leurs saisies au lieu de s'écraser.
- Créer une variante = copier le contenu d'une variante (ou d'un point de restauration) dans un nouveau fragment, puis l'inscrire dans le document racine. Le texte est écrit d'abord : une interruption laisse au pire un fragment non référencé, invisible. La variante active ne peut pas être mise à la corbeille.
- Point de restauration : `checkpoints: Y.Array<{ id, variantId, createdAt, reason: 'manual' | 'interval' | 'scene-end' | 'before-restore' | 'before-external-merge' | 'before-variant-delete', label?, state: Uint8Array }>` dans le document d'historique ; `state` encode une copie du fragment.
- Restaurer = remplacer le contenu du fragment par celui du point, dans une **nouvelle transaction** (précédée d'un point `before-restore`, lui-même restaurable). L'historique n'est jamais réécrit ; GC Yjs activé.
- **Points automatiques** (`interval`) : à l'ouverture d'une scène, toutes les 5 minutes si le texte a changé, quand on quitte la scène et quand l'app passe en arrière-plan. Un contenu identique au dernier point de la variante n'est jamais réenregistré. Purge : par variante, les 50 derniers points automatiques, puis le premier de chaque jour pour les plus anciens. Les points manuels (`⌘S`, avec ou sans nom) et les points de sécurité (`before-*`) ne sont jamais purgés.
- Le mentor n'analyse que la variante active [D-6] ; les signalements d'une variante inactive restent attachés à elle.

### 15.5 Origines des transactions et droits d'écriture

Chaque transaction porte une origine : `author`, `agent:<name>`, `mirror`, `system`, `migration`.

- Les agents écrivent **uniquement** via `createAgentWriter(rootDoc, agent)` : liée au seul document racine, elle permet de proposer (champs, entités), lever des signalements et résoudre les siens. Elle n'offre aucun accès aux documents de scène.
- Défense en profondeur : `watchAuthorship(doc, onViolation)` inspecte chaque transaction d'origine `agent:*` et signale toute écriture interdite (emplacement de l'auteur, statut d'entité, manuscrit, document de scène, suppression). Des tests vérifient qu'elle ne signale rien pour ce que fait `AgentWriter` et qu'elle attrape les écritures interdites.
- Les corrections et les exemples acceptés sont appliqués par une transaction d'origine `author`, déclenchée par une action explicite de l'auteur.

### 15.6 Schéma ProseMirror du texte [D-13]

Nœuds : `doc` (au moins un bloc), `paragraph`, `blockquote` (paragraphes uniquement, pas d'imbrication), `sceneBreak`, `hardBreak` ; marque : `italic`. Les noms reprennent ceux des extensions TipTap. Les espaces insécables (U+00A0) et fines insécables (U+202F) sont du texte et doivent survivre à tous les allers-retours.

Texte admis : pas de caractères de contrôle, hormis la tabulation. Partout où du texte entre dans une scène (import Markdown, collage), les sauts de ligne isolés deviennent des espaces (un vrai retour à la ligne est un `hardBreak`) et les autres caractères de contrôle sont retirés (`sanitizeSceneText`).

## 16. Persistance desktop

- Bibliothèque : un dossier choisi par l'auteur ; un projet = un dossier.
- Par document Yjs : journal append-only des mises à jour, compacté périodiquement en un état complet ; écritures atomiques (fichier temporaire + `fsync` + renommage). Objectif testé : aucune perte après un arrêt brutal du processus.

Disposition indicative d'un projet :

```
Mon roman/
  .charpentier/        # état CRDT, historique, base du miroir (ne pas éditer)
  manuscrit/
    01-titre-du-chapitre/
      01-titre-de-la-scene.md
  modules/
    meta.yaml  personnages.yaml  structure.yaml  regles-du-monde.yaml  indices.yaml
```

## 17. Miroir Markdown [D-8]

- Un fichier `.md` par scène (variante active), dans un dossier par chapitre. Le frontmatter porte l'`id` de la scène et de la variante ; les noms de fichiers suivent l'ordre et les titres, mais l'appariement se fait **par id**.
- Les modules sont écrits en YAML (valeur, statut, source par champ).
- Écriture différée (debounce) après chaque modification.
- **Réimport** d'un `.md` modifié hors de l'app : fusion à trois voies entre la base (dernier contenu écrit par l'app), le fichier et l'état courant du CRDT, appliquée en transaction d'origine `mirror` après un point de restauration. Si les modifications se chevauchent : la version externe devient une nouvelle variante « Modif. externe du … » et un signalement `external-edit` est créé. Rien n'est perdu.
- En v1, les YAML de modules sont en écriture seule (le réimport des modules est une question ouverte, §22).

### 17.1 Dialecte Markdown d'une scène

- **Écriture canonique**, lisible dans n'importe quel lecteur Markdown : un paragraphe par ligne, séparés par une ligne vide ; `*italique*` ; `> ` pour les citations ; `* * *` pour le séparateur interne ; `\` en fin de ligne pour un retour à la ligne. Une scène vide donne un fichier vide.
- **Échappements** : `\ * _ ` [ ] < & ~` sont toujours échappés par `\` ; `> # - + =` et `12.` / `3)` le sont en début de ligne, pour qu'aucun texte ne se lise comme une structure.
- **Encodages de dernier recours**, seulement là où Markdown ne sait pas dire le texte : espace (normale, insécable, tabulation…) en bord de ligne → référence numérique `&#xA0;` ; italique que les délimiteurs `*` ne peuvent ni ouvrir ni fermer → `<em>…</em>` ; retour à la ligne en fin de paragraphe → `<br>` ; paragraphe vide → `<!-- -->`.
- **Garantie testée** (y compris par génération aléatoire) : CRDT → Markdown → CRDT est l'identité pour toute scène au texte admis ; tout fichier Markdown se lit en une scène valide dont la réécriture est stable.
- **Lecture tolérante** d'un fichier modifié hors de l'app : titres, listes et code restent du texte ; le gras perd ses marqueurs mais garde ses mots ; `_italique_`, `<i>` et `<em>` sont lus comme italique ; `***`, `---` et `___` comme séparateurs ; les citations imbriquées sont aplaties ; les lignes coupées sont jointes par une espace.

## 18. Agents et frontière de l'IA [D-11]

La contrainte « l'IA n'écrit jamais le roman » est **explicite et testée** dans le paquet `agents` :

1. **Prompts système** : interdiction de produire du texte narratif ; seule une phrase d'exemple est permise, présentée comme telle.
2. **Sorties structurées** : toute réponse d'agent est validée par schéma ; les champs d'exemple et de correction ont des bornes (une phrase au plus, longueur maximale ; une correction a un ratio de modification borné par rapport au segment d'origine).
3. **Filtrage** : une sortie qui dépasse les bornes ou contient de la prose narrative est rejetée (nouvel essai ou abandon), jamais tronquée en silence.
4. **Capacités** : aucun agent ne dispose d'un accès en écriture aux documents de scène (§15.5).
5. **Tests** : tests unitaires des bornes et des filtres, et tests adversariaux (demandes explicites de l'auteur du type « écris-moi la scène ») vérifiant le refus.

Le mentor s'exprime dans la langue du projet. Sans réseau, les fonctions IA se dégradent proprement (indication discrète, l'écriture n'est jamais bloquée).

## 19. Exigences transverses

- **Clavier d'abord** : toute action accessible au clavier, ligne de commande (`⌘K`), registre de raccourcis central dans le cœur (y compris réorganisation des scènes et chapitres). Un raccourci que l'hôte se réserve (⌘N dans un navigateur) bascule sur son autre raccourci ou sur la ligne de commande.
- **Design** : [DESIGN.md](DESIGN.md) fait foi pour l'apparence, les composants et les raccourcis proposés.
- **Distraction-free** : aucun chrome non essentiel ; l'état (synchro, réseau, batterie) est discret, voire masqué.
- **Offline-first absolu** : une coupure réseau ne bloque jamais l'écriture.
- **i18n** : aucune chaîne d'interface en dur.
- **Tests prioritaires** : aller-retour CRDT ↔ Markdown, réimport d'un `.md` modifié hors de l'app, fusion offline/online (étape 4).

## 20. Structure du dépôt

```
apps/
  web/              # hôte navigateur
  desktop/          # hôte Electron (main, preload, renderer)
  server/           # Hocuspocus + API + proxy IA (étape 4)
packages/
  core/             # UI React, éditeur TipTap, modules, palette, raccourcis
  schema/           # schéma ProseMirror, structure Yjs, sérialiseur Markdown
  platform/         # interfaces des services
  platform-web/
  platform-desktop/ # dont le service System (appliance)
  agents/           # orchestration des agents, abstraction LLM
nix/
  flake.nix
  hosts/x250/
infra/              # docker-compose du serveur
docs/
```

## 21. Ordre de construction et garde-fous

Priorité : que l'auteur puisse **écrire son roman avec le mentor le plus tôt possible**.

1. **Fondations locales** : monorepo, `schema`, `platform`, `core` avec TipTap + Yjs en local seul, `apps/web` lançable. Modules v1, statuts, variantes et historique modélisés dans Yjs dès cette étape.
2. **Hôte `desktop` minimal** (macOS d'abord) : documents dans le main, persistance disque, miroir Markdown et réimport, `.app` installable.
3. **Mentor v1** : correction hors ligne, signalements ancrés et liste de points, paquet `agents` (Anthropic), chat, bottom-up, conflits, indices.
4. **`server`** : Hocuspocus + Postgres en Docker, synchro multi-appareils, proxy IA pour le web, authentification.
5. **Flake NixOS du X250** et mode `--appliance`.

Plus tard : import d'un premier jet [D-1].

Garde-fous, contrôlés mécaniquement :
- Toute écriture dans le document, y compris par un agent, passe par une transaction Yjs ; jamais d'écriture directe du Markdown ou du DOM.
- Modules et signalements vivent dans les documents Yjs du projet, jamais dans un stockage parallèle.
- Les appels LLM passent par le service `LLM` de la plateforme.
- `apps/web` reste compilable et lançable dès l'étape 1 ; les tests du cœur tournent dans les deux hôtes en CI.
- `core`, `schema`, `platform` et `agents` compilent sans `@types/node` (lib DOM/ES2022 seulement) et une règle ESLint y interdit `node:*`, `electron`, `fs` et consorts ; le build web tourne en CI. Toute fuite casse le build.

## 22. Questions ouvertes

À trancher avant l'étape 3 :
1. Définition de la « fin de scène » qui déclenche l'analyse complète (action explicite, changement de scène, inactivité).
2. Types de remarques assez importants pour apparaître pendant l'écriture.
3. Place de la marge d'annotations et de la liste de points dans une interface distraction-free. *Piste retenue par le design : la « marge qui respire » (pastilles en marge, note dépliée à la pause) et le panneau droit Points / Conversation, [DESIGN.md](DESIGN.md) §4.2 et §4.3 ; détails à confirmer avant l'étape 3.*
4. ~~Nom ou personnalité du mentor.~~ Tranché : le Compagnon [D-17].

À trancher plus tard :
5. Réimport des YAML de modules modifiés hors de l'app.
6. Authentification auto-hébergée (étape 4) : 2 ou 3 options adaptées à Hocuspocus et Postgres.
7. Migration de l'hébergement au lancement public.
8. Niveaux supérieurs d'aide rédactionnelle ; détermination du profil débutant / confirmé (v2, version publique).
9. Interface de validation par lot (avec l'import, après la v1).
10. Dépôt GitHub (propriétaire/nom) pour activer le CLA.

## 23. Licence

- Dépôt public sous **FSL-1.1-ALv2** (conversion en Apache 2.0 au bout de 2 ans), titulaire **Pierre Chatel**. Fichier `LICENSE` officiel et en-tête court dans le README : l'usage concurrent commercial est interdit.
- **CLA obligatoire** pour toute contribution externe (CLA Assistant sur GitHub), pour que le titulaire reste seul détenteur des droits.
- Chaque dépendance ajoutée est vérifiée : licences permissives (MIT, ISC, BSD, Apache 2.0) acceptées ; copyleft faible (MPL 2.0, LGPL) au cas par cas et documenté ; **copyleft fort (GPL, AGPL) refusé**. Exclu nommément : Grammalecte (GPL v3).
