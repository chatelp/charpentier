# Charpentier : spécification technique

## Contexte

Charpentier est un outil d'aide à l'écriture de roman piloté par des agents IA. L'IA n'écrit pas le roman : elle travaille sur des modules allant du plus méta (description du livre, arcs, personnages, cohérence) jusqu'au texte, où elle propose des corrections et des améliorations. Les fonctionnalités (le « quoi ») sont définies dans `SPEC-FONCTIONNELLE.md`, à fusionner avec celui-ci.

**Règle de fusion** : le document fonctionnel fait foi sur le *quoi*, ce document fait foi sur le *comment*. En cas de conflit, signale-le avant de trancher.

Usage d'abord personnel, avec une ouverture publique (et potentiellement payante) à terme.

## Principe d'architecture : le modèle VS Code

- **Un seul cœur applicatif web** (UI, éditeur, modules, orchestration des agents), partagé à 100 %.
- **Des hôtes** qui donnent plus ou moins de capacités à ce cœur :
  - **web** : navigateur, capacités réduites ;
  - **desktop** : Electron, avec fichiers locaux, persistance native et agents exécutés localement ;
  - **appliance** : le build desktop lancé avec `--appliance` sur un ThinkPad X250 dédié (voir plus bas).
- **Une couche de services de plateforme** : des interfaces abstraites dans le cœur, avec une implémentation par hôte. Le cœur ne doit **jamais** importer d'API spécifique à un hôte. Cette couche doit exister dès le premier commit, même avec une seule implémentation.

Services attendus (à affiner) : `Storage`, `Sync`, `FileMirror`, `Agents`/`LLM`, `Secrets`, `System` (appliance uniquement : réseau, batterie, luminosité, veille, extinction), `Keybindings`.

## Décisions actées

| Sujet | Décision |
|---|---|
| Langage | TypeScript strict partout |
| Front | React |
| Éditeur | TipTap (ProseMirror) |
| Modèle de données | Local-first, CRDT **Yjs** comme source de vérité |
| Liaison éditeur ↔ CRDT | y-prosemirror (extension Collaboration de TipTap) |
| Persistance offline web | y-indexeddb |
| Persistance desktop | Fichiers locaux (mise à jour Yjs + snapshots) ; SQLite pour index et métadonnées si utile |
| Miroir lisible | Le CRDT fait foi. Un miroir **Markdown** est écrit en continu sur disque (desktop/appliance). Les métadonnées (arcs, personnages…) vont dans des fichiers à côté (frontmatter/YAML ou JSON). Une modification du .md hors de l'app est détectée et réimportée dans le CRDT comme une édition. |
| Serveur de synchro | **Hocuspocus** auto-hébergé |
| Hébergement | **Tout auto-hébergé** (homelab Docker au départ, VPS possible au lancement public) : front web, Hocuspocus, API, Postgres |
| Desktop | **Electron** (moteur Chromium, identique au web ; pas de Tauri à cause de WebKitGTK). Pouvoirs natifs dans le processus principal, IPC via preload, `contextIsolation` activé. |
| IA | **Multi-fournisseurs** (Claude, OpenAI, modèles locaux…) derrière une abstraction. Candidat : le SDK `ai` (Vercel AI SDK), agnostique du fournisseur et utilisable sans hébergement Vercel. |
| Exécution des agents | Un paquet `agents` agnostique de l'environnement, exécutable **côté serveur** (web) **et dans le processus principal Electron** (desktop/appliance). Clés côté serveur pour l'usage hébergé ; BYOK en local via le trousseau de l'OS (`safeStorage` d'Electron). |
| Annotations des agents | Ancrées dans le texte via les positions relatives Yjs et des décorations/marques ProseMirror, robustes aux éditions concurrentes. |
| Monorepo | pnpm + Turborepo |

## Exigences transverses

- **Clavier d'abord** : toute action accessible au clavier, palette de commandes, registre de raccourcis central dans le cœur. Aucune fonction réservée à la souris (la souris reste toujours possible).
- **Distraction-free** : aucun chrome non essentiel. L'état (synchro, batterie, réseau) est discret, voire masqué par défaut.
- **Offline-first absolu** : une coupure réseau ne bloque jamais l'écriture. Les agents IA se dégradent proprement sans réseau.
- **Tests prioritaires** : aller-retour CRDT ↔ Markdown, fusion offline/online, réimport d'un .md modifié hors app.

## Structure de repo proposée

```
apps/
  web/              # hôte navigateur
  desktop/          # hôte Electron (main, preload, renderer)
  server/           # Hocuspocus + API + proxy IA
packages/
  core/             # UI React, éditeur TipTap, modules, palette, raccourcis
  schema/           # schéma ProseMirror, structure Yjs, sérialiseur Markdown
  platform/         # interfaces des services
  platform-web/
  platform-desktop/ # dont le service System (appliance)
  agents/           # orchestration des agents, abstraction LLM
nix/
  flake.nix
  hosts/x250/       # config NixOS de l'appareil
infra/              # docker-compose du serveur auto-hébergé
```

## Mode appareil (ThinkPad X250)

Appareil d'écriture **mono-usage** : il démarre directement dans Charpentier.

- **NixOS** en flake, configuration entièrement déclarative, avec le module `nixos-hardware` pour le X250.
- **greetd** en autologin, qui lance **Sway** minimal : pas de barre, pas de bordures, Charpentier en plein écran via `for_window`, raccourcis Sway par défaut supprimés, un combo caché pour un terminal de secours.
- Electron lancé en Wayland natif (`--ozone-platform=wayland`) avec `--appliance`.
- Le service `System` de l'hôte desktop parle à D-Bus : NetworkManager pour le Wi-Fi, UPower pour la batterie, logind pour la veille et l'extinction, ainsi que la luminosité. L'UI correspondante n'apparaît qu'en mode appliance.
- **keyd** pour le remapping clavier système ; disposition FR.
- TLP, veille au rabat de l'écran avec reprise directe sur le texte, systemd-boot avec timeout à 0, boot silencieux, services inutiles désactivés.
- Un TTY de secours conservé (Ctrl+Alt+F2).
- Déploiement à distance : `nixos-rebuild switch --flake .#x250 --target-host …`.
- Empaquetage de l'app Electron dans Nix (dépendances npm reproductibles). Pendant le prototypage, une installation manuelle est acceptable.

## Ordre de construction

Priorité : que Pierre puisse **écrire son roman avec le mentor le plus tôt possible** (v1 de la spec fonctionnelle). La synchro multi-appareils passe donc après le mentor.

1. **Fondations locales** : monorepo, `schema`, `platform` (interfaces), `core` avec l'éditeur TipTap + Yjs en local seul. Les modules v1 (Méta, Personnages, Structure, Règles du monde, indices) et les statuts (proposée, validée, rejetée…) sont modélisés dans Yjs dès cette étape.
2. **Hôte `desktop` minimal** : persistance sur disque et miroir Markdown. C'est ce qui rend l'écriture réelle sans risque de perte (IndexedDB seul ne suffit pas pour un manuscrit), et ce qui permet d'exécuter les agents dans le processus principal Electron sans aucun serveur.
3. **Mentor v1** : paquet `agents` avec l'abstraction multi-fournisseurs (interface complète, un seul fournisseur implémenté au départ), voix unique, remplissage bottom-up des fiches en statut « proposée », signalements ancrés dans la marge, liste de points à traiter, chat libre, correction de la langue.
4. **`server`** : Hocuspocus + Postgres en Docker, synchro multi-appareils, proxy IA pour l'hôte web, authentification.
5. **Flake NixOS du X250** et mode `--appliance`.

Garde-fous pour que ce report de la synchro ne coûte rien plus tard :
- toute écriture dans le document, y compris par un agent, passe par une transaction Yjs (jamais d'écriture directe du Markdown ou du DOM) ;
- les données des modules et des signalements vivent dans le même document Yjs (ou des sous-documents liés), pas dans un stockage parallèle ;
- les appels LLM passent par le service `LLM` de la couche plateforme, pour que l'hôte web puisse plus tard les router vers le proxy serveur.
- **`apps/web` reste compilable et lançable dès l'étape 1**, avec une implémentation minimale de la plateforme (`platform-web` : IndexedDB pour le stockage, IA désactivée ou via une clé de développement). Les tests du cœur tournent dans les deux hôtes (web et desktop) en CI. Objectif : qu'aucune hypothèse Electron ou Node ne s'infiltre dans `core` pendant la phase desktop-first ; toute dérive doit casser le build web immédiatement.

## Questions ouvertes (à proposer, pas à trancher seul)

- **Authentification** auto-hébergée : propose 2 ou 3 options adaptées à Hocuspocus et Postgres.
- **Politique de conflit** du miroir Markdown quand le .md et le CRDT ont divergé.
- **Migration de l'hébergement** au lancement public.

## Licence (actée)

- Repo **public** sous **FSL-1.1-ALv2** (Functional Source License, conversion en Apache 2.0 au bout de 2 ans). Ajoute le fichier `LICENSE` officiel et un en-tête court dans le README expliquant que l'usage concurrent commercial est interdit.
- **CLA obligatoire** pour toute contribution externe (par exemple via CLA Assistant sur GitHub), afin que Pierre reste seul détenteur des droits et puisse proposer des licences commerciales ou changer de licence.
- Vérifie la compatibilité des licences des dépendances (pas de dépendance copyleft forte qui contraindrait la redistribution).
