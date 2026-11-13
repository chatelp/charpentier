# Icône de Charpentier : l'Équerre

Choix de Pierre (13 nov. 2026) parmi trois pistes (`pistes/`, comparées dans `pistes.png` : Lettrine, Crayon, Équerre).

Une équerre de charpentier gravée dans une plaque perle, bord intérieur vermillon (l'encre de l'auteur), graduations, et la pastille du Compagnon en relief, cœur bleu de Prusse, dans l'angle : le métier, la structure, et le compagnon qui veille.

## Fichiers

| Fichier | Usage |
|---|---|
| `charpentier.svg` | source, 1024 × 1024, grille macOS (plaque de 824 px à 100 px du bord, rayon 185 px, ombre portée intégrée) |
| `charpentier-1024.png` | rendu de la source : tailles 128 px et plus (128, 256, 512 et leurs @2x, 1024) |
| `charpentier-petit.svg` | version simplifiée pour les petites tailles : sans relief ni graduations, équerre pleine et pastille agrandie |
| `charpentier-16.png`, `-32.png`, `-64.png` | rendus de la version simplifiée : `icon_16x16`, `icon_16x16@2x` et `icon_32x32`, `icon_32x32@2x` |

Pour l'`.icns` : 16 → `charpentier-16.png` ; 32 → `charpentier-32.png` ; 64 → `charpentier-64.png` ; 128 à 1024 → `charpentier-1024.png` réduit. Rendus produits avec `rsvg-convert -w <taille> -h <taille> <source>.svg`.

## Lisibilité en petit

- **32 px** : le L vermillon et le point bleu se lisent nettement, la plaque claire se détache sur un fond sombre comme sur un fond clair.
- **16 px** : il reste un L vermillon et un point bleu : assez pour distinguer l'app dans le Dock réduit, la barre de menus d'une fenêtre ou le Finder en liste. Les graduations et le relief disparaissent volontairement en dessous de 128 px, d'où la version simplifiée.

## Couleurs

Uniquement les tokens Perle : plaque `#eef1f5` → `#d8dde5` (fond perle éclairé en haut à gauche), ombre `#b3becc`, lumière `#ffffff`, vermillon `#b2432a`, bleu de Prusse `#1f4f7c`, graduations `#7a828e`.

## Plus tard

- **X250 (Sway)** : les PNG 64 et 1024 suffisent pour un fichier `.desktop` (thème hicolor 64 × 64 et 512 × 512).
- **macOS 26** : des variantes sombre et teintée (Icon Composer) pourront dériver de la même source ; non nécessaires pour une app non signée.
