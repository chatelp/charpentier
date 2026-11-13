# Maquettes de Charpentier

Ouvrir `index.html` dans un navigateur (aucune installation). La barre noire du haut ne fait pas partie du design : elle sert à comparer.

- **Direction** (touche `D`) : Perle, Vélin, Grès.
- **Caractère** (touches `M` `E` `O`, direction Perle) : leviers combinables pour sortir les outils de la monotonie, la page d'écriture restant telle quelle. `M` alterne Neutre, **Matières** (une matière par lieu : bleu lavé pour le Compagnon, ivoire pour le manuscrit, argile pour l'Atelier) et **Établi sombre** (outils en ardoise, page claire) ; `E` **Encres pleines** (vermillon et bleu remplissent ce qui est actif) ; `O` **Outils gravés** (pictogrammes en médaillon, monogrammes, titres de panneaux, filets gravés). **Retenu par l'auteur : Établi sombre + Outils gravés** (état par défaut). En thème sombre (`T`), deux variantes : « outils profonds » et **« outils clairs », retenue** (même ardoise que dans le thème clair, page plus sombre).
- **Découverte** (touche `G`, direction Perle) : comment un débutant trouve les outils sans raccourci. Actuel ; 1 · Poignées (retenue) ; 2 · Établi ouvert ; 3 · Barre d'outils. **Frappe** (touche `W`) montre ce qui s'efface pendant l'écriture. Inventaire et arguments : [`../decouverte.md`](../decouverte.md).
- **Écran** (touches `1` à `9`) : écrire ; écrire avec le Compagnon ; manuscrit (bouton « Plan » pour la vue d'ensemble et son bandeau de restauration) ; fiche personnage (Atelier, `⇧X` affiche ou masque les rejets) ; fiche en volet ; points à traiter et conversation ; ligne de commande ; premier lancement ; bibliothèque.
- **X250 · ligne système** (cadre « X250 ») : la zone système toujours affichée (DESIGN.md §4.12). Cliquer un segment déplie son panneau ; le message ouvre le journal. Boutons : « En haut » (retenu) ou « Console en bas » (écartée), « Clé USB », « Touche luminosité », « Batterie faible ». Écrans « X250 · Moniteur » (ou un clic sur `cpu`), « X250 · Réglages », « X250 · Verrou », « X250 · Démarrage ». Rendus à la taille réelle : [`../x250/`](../x250/).
- Sons : page d'écoute séparée, [`../sons.html`](../sons.html). Icône : [`../icon/`](../icon/README.md).
- **Thème** (touche `T`) : clair, sombre. **Cadre** : Mac (barre de titre intégrée) ou X250 (plein écran, état système en pied). **Focus** (touche `F`), **sons** (désactivés par défaut), **animations**.
- À essayer : en cadre Mac, ouvrir les menus de la barre de menus ; au premier lancement, « Faire le tour » ; cliquer une pastille en marge, cliquer « Hélène » dans le texte, valider ou rejeter une proposition dans une fiche (le relief change), taper dans la ligne de commande (`>` commandes, `@` fiches, `#` scènes), `↑` `↓`.

Taille de référence : 1536×864 px CSS (X250 en 1920×1080 à 125 %). Sous 1180 px de large, la note du Compagnon se déplie sous son paragraphe au lieu de la marge.

Les polices viennent de Google Fonts **pour les maquettes seulement** ; l'application embarquera les polices retenues (toutes sous OFL) et ne chargera rien du réseau. Le texte de la scène est un exemple écrit pour la maquette.

## Direction retenue

**Perle**, avec les leviers **B · Deux encres** et **C · Signature** (actifs par défaut dans la maquette ; A · Pierre chaude écarté), navigation du manuscrit par **tiroir + vue d'ensemble** (bouton « Plan » du tiroir), points d'entrée en **poignées** sur les bords, **zone de commande** en pied, `Aa`, barre de menus complète et premier lancement guidé (Découverte « 1 · Poignées », version 1.1). Outils en **ardoise sombre** avec **outils gravés** (Caractère « N » et « O », version 1.3). Le design language qui en découle est décrit dans [`../../DESIGN.md`](../../DESIGN.md).

## Les trois directions

Socle commun, issu du brief (`../brief.md`) : neumorphisme, page d'écriture plate et outils en relief, accent bleu de Prusse réservé au Compagnon, marge qui respire, statuts portés par le relief, panneau droit Points / Conversation, ligne de commande en pied, Atelier plein cadre + fiche en volet.

| | Perle | Vélin | Grès |
|---|---|---|---|
| Matière | gris perle froid | vélin crème chaud | grès minéral |
| Texte | Literata | Newsreader | Source Serif 4 |
| Interface | Inter | Source Sans 3 | Public Sans |
| Relief | arrondi, moyen (rayons 22/14/9) | le plus doux (14/10/6) | ferme, taillé (8/6/4) |
| Pastille du Compagnon | point rond en relief | encoche verticale | losange |
| Manuscrit | tiroir latéral gauche | vue d'ensemble plein écran (plan en cartes) | ligne de commande seule (`#`), variantes et restauration en aperçu |
