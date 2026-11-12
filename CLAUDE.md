# CLAUDE.md : Charpentier

Outil d'aide à l'écriture de romans piloté par des agents IA : un mentor « par-dessus l'épaule » qui structure, vérifie la cohérence et explique le métier, **sans jamais écrire le roman**. Référence unique : [docs/SPEC.md](docs/SPEC.md) (fusion des deux specs d'origine, journal des décisions au §0). Plan en cours : [docs/PLAN.md](docs/PLAN.md).

**Boussole** : l'auteur doit pouvoir écrire son roman avec le mentor le plus tôt possible. Tout arbitrage se fait à cette aune.

## Principes non négociables
1. **L'IA n'écrit jamais le roman.** Seules entrées d'un texte d'origine IA dans le manuscrit, toujours sur action explicite de l'auteur : correction de langue acceptée, phrase d'exemple (une seule phrase) insérée. Contrainte testée dans `agents` : prompts système, sorties validées par schéma et bornées, filtrage, tests adversariaux.
2. **Les décisions de l'auteur ne sont jamais écrasées.** Statuts stockés `proposed | validated | rejected` ; « contredite » est dérivé (validée + conflit ouvert). Un agent ne touche jamais un champ validé ou rejeté.
3. **L'unité de texte est la scène** (dans des chapitres, avec variantes et points de restauration).
4. **Le cœur n'importe jamais d'API d'hôte** : tout passe par les interfaces de `platform`.
5. Clavier d'abord, distraction-free, offline-first absolu.

## Garde-fous d'architecture (contrôlés mécaniquement)
- Toute écriture passe par une **transaction Yjs** avec une origine (`author`, `agent:<name>`, `mirror`, `system`, `migration`). Jamais d'écriture directe du Markdown ou du DOM.
- Modules, signalements, chat : dans les documents Yjs du projet, jamais de stockage parallèle.
- Un agent n'a **aucun accès en écriture aux documents de scène**.
- Appels LLM uniquement via le service `LLM` de la plateforme.
- `core`, `schema`, `platform`, `agents` : pas de `@types/node`, lib DOM/ES2022 seulement, ESLint interdit `node:*`, `electron`, `fs`… Le build `apps/web` et les tests du cœur dans les deux hôtes tournent en CI.

## Décisions techniques actées
TypeScript strict · React · TipTap 3 (sans extensions Pro) + `@tiptap/y-tiptap` (fork de y-prosemirror) · Yjs source de vérité · y-indexeddb (web) · Electron, `contextIsolation`, documents Yjs **dans le main**, interface synchronisée par IPC · pnpm + Turborepo · SDK `ai`, Anthropic en premier, BYOK via `safeStorage` · i18next · Vitest (+ mode navigateur, + Playwright Electron) · Hunspell fr + règles typo maison · Hocuspocus + Postgres à l'étape 4.

Modèle Yjs (détail : SPEC §15) : doc racine `project:<pid>` (meta, chapitres et scènes ordonnés par indexation fractionnaire, modules, signalements) · `project:<pid>/scene:<sid>` (une `Y.XmlFragment` de premier niveau `variant:<vid>` par variante) · `…/history` (points de restauration ; restaurer = nouvelle transaction) · `project:<pid>/mentor`. **Tout ce que deux répliques peuvent créer en même temps est un type de premier niveau nommé** (`module:<nom>`, `variant:<id>`) ; un sous-type n'est créé que sous une clé aléatoire unique. Champ = trois emplacements à auteur unique (`#value` auteur, `#proposal` agent, `#rejected` auteur), statut dérivé. Agents : uniquement via `createAgentWriter` ; `watchAuthorship` vérifie. Rien n'est supprimé : corbeille (`trashedAt`). Annotations = positions relatives Yjs rendues en décorations, aucune marque dans le contenu. Texte : paragraphe, italique, citation, séparateur interne de scène ; les insécables U+00A0 et U+202F doivent survivre aux allers-retours.

Miroir Markdown (desktop) : un `.md` par scène, appariement par id dans le frontmatter, modules en YAML. Modification externe = fusion à trois voies ; en cas de chevauchement, nouvelle variante « Modif. externe » + signalement.

## Façon de travailler
- Code, identifiants, commentaires en **anglais** ; interface en **français**, aucune chaîne en dur (i18n).
- Commits petits et fréquents, **Conventional Commits**. **Ne jamais pousser** vers un dépôt distant sans demande explicite.
- Les tests prioritaires s'écrivent avec le code concerné : aller-retour CRDT ↔ Markdown, réimport d'un `.md` modifié, fusion offline/online (étape 4).
- Chaque dépendance ajoutée : vérifier sa licence. MIT/ISC/BSD/Apache OK ; MPL/LGPL au cas par cas, documenté ; GPL/AGPL refusé.
- Questions ouvertes : proposer 2 ou 3 options argumentées, ne pas trancher seul.
- Fin de chaque phase : résumer fait / testé / restant, puis attendre le feu vert.
- Garder ce fichier court et à jour.

## Commandes
- `pnpm install` : installation
- `pnpm check` : tout ce que fait la CI (format, lint, typecheck, tests, `check:guards`, `check:licenses`) ; doit passer avant chaque commit
- `pnpm check:guards` : auto-test des garde-fous anti-fuite (ESLint et TypeScript doivent rejeter une fuite Node/Electron dans chaque paquet agnostique)
- `pnpm check:licenses` : licences de toutes les dépendances ; exceptions revues dans `licenses.exceptions.json`
- Tests en navigateur (`*.browser.test.ts[x]`, Chromium headless) : une fois `pnpm --filter @charpentier/core exec playwright install chromium`
- `pnpm dev:web` : hôte web sur http://localhost:5173 (config de prévisualisation dans `.claude/launch.json`) · `pnpm build` : build web · `pnpm dev:desktop` (étape 2)

## Repères techniques
- Paquets internes exportés en source TS (`exports: ./src/index.ts`), pas d'étape de build.
- Paquets agnostiques : `tsconfig.json` (src, sans types Node) + `tsconfig.test.json` (tests). Nouveau paquet agnostique → l'ajouter aux couches d'`eslint.config.js` et à `scripts/guard-selftest.mjs`.
- TypeScript reste en 6.0.x tant que typescript-eslint ne supporte pas la 7.
- Markdown exclu de Prettier (prose formatée à la main).
- Éditeur : `sceneSchemaExtensions` doit produire exactement `sceneSchema` (test `schema-conformity`). Les règles de saisie doivent marcher en français (`l’*Odyssée*`). Toute commande qui insère un nœud feuille place le curseur après lui (sinon la frappe suivante le remplace).
- Services de plateforme absents = `null` : le cœur vérifie et masque la fonction, il ne suppose jamais un service présent. Tests du cœur : `createTestPlatform()` (jamais `platform-web`).
- i18n : catalogue `packages/core/src/i18n/locales/fr.json`, clés typées ; la règle locale `charpentier/no-ui-literal` (`tools/eslint/`) interdit tout texte en dur dans le JSX. `eslint-plugin-i18next` est inopérant avec ESLint 10 : ne pas le réintroduire.
