# Polices embarquées

| Fichier | Police | Licence |
|---|---|---|
| `Literata-Variable.woff2`, `Literata-Italic-Variable.woff2` | Literata (TypeTogether pour Google), axes `opsz` et `wght` | SIL OFL 1.1, [OFL-Literata.txt](OFL-Literata.txt) |
| `Inter-Variable.woff2` | Inter (Rasmus Andersson), axes `opsz` et `wght` | SIL OFL 1.1, [OFL-Inter.txt](OFL-Inter.txt) |

- Source : les builds variables complets de [google/fonts](https://github.com/google/fonts) (`ofl/literata`, `ofl/inter`). L'API Google Fonts et Fontsource retirent les petites capitales (`smcp`, `c2sc`) dont le design a besoin, d'où ce sous-ensemble local qui garde toutes les fonctionnalités OpenType.
- Sous-ensemble : latin, latin étendu A et B, ponctuation générale (dont `⁂`), euro. Reconstruction : `scripts/subset-fonts.sh`.
- Literata n'a pas d'espace fine insécable (U+202F) : la pile de polices la prend dans Inter.
- Aucun nom de police réservé dans ces deux licences : le sous-ensemble peut garder son nom. L'OFL autorise l'embarquement et la redistribution avec le logiciel, à condition de joindre la licence ; elle ne s'étend pas au code de Charpentier.
