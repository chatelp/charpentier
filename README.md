# Charpentier

> **Licence : [FSL-1.1-ALv2](LICENSE.md)** (Functional Source License). Le code est public : vous pouvez le lire, l'utiliser, le modifier et le redistribuer pour tout usage **sauf un usage commercial concurrent** (proposer un produit ou service qui se substitue à Charpentier). Chaque version passe automatiquement sous licence Apache 2.0 deux ans après sa publication. Toute contribution externe suppose la signature du [CLA](CLA.md).

Outil d'aide à l'écriture de romans piloté par des agents IA. Charpentier n'écrit pas le livre à votre place : il joue le rôle d'un romancier et éditeur expérimenté « par-dessus l'épaule », qui structure, vérifie la cohérence, pose des questions et explique le métier.

- Spécification : [docs/SPEC.md](docs/SPEC.md)
- Design language : [docs/DESIGN.md](docs/DESIGN.md)
- Plan de construction : [docs/PLAN.md](docs/PLAN.md)

Les polices embarquées (Literata, Inter) restent sous leur propre licence, la SIL Open Font License 1.1 : voir [packages/core/src/fonts](packages/core/src/fonts/README.md).

## Développement

Prérequis : Node.js ≥ 22.12 (24 LTS recommandé, voir `.nvmrc`) et pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm check   # format, lint, typecheck, tests, garde-fous, licences
```
