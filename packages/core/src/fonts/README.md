# Polices embarquées

| Fichier                                                     | Police                                                                 | Licence                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Literata-Variable.woff2`, `Literata-Italic-Variable.woff2` | Literata (TypeTogether pour Google), axes `opsz` et `wght`             | SIL OFL 1.1, [OFL-Literata.txt](OFL-Literata.txt)           |
| `Inter-Variable.woff2`                                      | Inter (Rasmus Andersson), axes `opsz` et `wght`                        | SIL OFL 1.1, [OFL-Inter.txt](OFL-Inter.txt)                 |
| `JetBrainsMono-Variable.woff2`                              | JetBrains Mono (JetBrains), axe `wght` ; la matière du système du X250 | SIL OFL 1.1, [OFL-JetBrainsMono.txt](OFL-JetBrainsMono.txt) |

- Source : les builds variables complets de [google/fonts](https://github.com/google/fonts) (`ofl/literata`, `ofl/inter`). L'API Google Fonts et Fontsource retirent les petites capitales (`smcp`, `c2sc`) dont le design a besoin, d'où ce sous-ensemble local qui garde toutes les fonctionnalités OpenType.
- Sous-ensemble : latin, latin étendu A et B, ponctuation générale (dont `⁂`), euro. Reconstruction : `scripts/subset-fonts.sh`.
- Literata n'a pas d'espace fine insécable (U+202F) : la pile de polices la prend dans Inter.
- JetBrains Mono garde en plus les flèches, les touches (⌘, ⇧), les caractères de bloc (▁ à █, pour le signal Wi-Fi et la courbe du segment `cpu`), ● et ⚡. Elle n'a ni ⊞, ni ⏎, ni ⇥, ni ○ : la pile de polices les prend dans Inter ou dans la police du système.
- Aucun nom de police réservé dans ces trois licences : le sous-ensemble peut garder son nom. L'OFL autorise l'embarquement et la redistribution avec le logiciel, à condition de joindre la licence ; elle ne s'étend pas au code de Charpentier.
