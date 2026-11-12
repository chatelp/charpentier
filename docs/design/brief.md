# Brief de design (réponses de l'auteur, 12 novembre 2026)

Recueilli par questionnaire avant toute maquette. Sert d'entrée aux directions de `docs/design/mockups/` puis à `docs/DESIGN.md`.

## Orientation générale
- **Neumorphisme** (relief doux, ombres claire et sombre sur fond uni), appliqué ainsi : **la page d'écriture reste plate**, seuls les outils sont en relief (panneaux, palette, boutons, fiches, notes du Compagnon).
- Matière du thème clair : **à comparer** dans les maquettes (gris perle, vélin crème, grès minéral).
- Contraste : **esthétique d'abord** (contrastes doux acceptés).
- Thème **sombre dès la v1**, en neumorphisme lui aussi.
- Anti-références : look « tableau de bord », surcharge à la Scrivener, chatbot envahissant, skeuomorphisme lourd (cuir, bois, papier photographié).

## Typographie
- Texte du roman : **serif d'écran** (Literata, Newsreader…), licence OFL, embarqué.
- Interface : **sans humaniste** (Inter, Source Sans 3, Public Sans…), OFL, embarqué.

## Écriture et distraction-free
- Visible en permanence pendant l'écriture : **titre de la scène**, **compteur de mots**, **pastilles du mentor** en marge.
- Les aides du mentor **apparaissent dynamiquement sans être intrusives** (le côté « dynamique » du mentor de la spec).
- Confort v1 : taille du texte, largeur de colonne, mode focus, réduction des animations.

## Le mentor : « le Compagnon »
- Nom de métier : **le Compagnon** (le compagnon charpentier qui transmet le métier). Répond à la question ouverte n°4 de la SPEC §22 (à reporter au journal des décisions).
- **Vouvoie** l'auteur.
- Apparition des remarques : **marge qui respire** (pastille en marge à hauteur du passage, la remarque se déplie quand le curseur s'approche ou au raccourci, puis se replie ; rien ne recouvre le texte). Éclaire la question ouverte n°3.
- Ton visuel : **une seule couleur d'accent**, le **bleu de Prusse**, pour tout ce qui vient du Compagnon ; l'intensité varie avec l'importance.
- Statuts dans les fiches : **le relief porte le statut** (proposée = en relief, à prendre ; validée = gravée, à plat ou en creux ; rejetée = estompée et barrée ; contredite = validée + marque d'alerte).
- Liste de points et chat : **panneau droit à onglets** (Points à traiter, Conversation), appelé au raccourci, remplace la marge quand il est ouvert.

## Navigation
- Manuscrit (chapitres, scènes, variantes) : **à comparer** (tiroir latéral, vue d'ensemble plein écran, palette seule).
- Modules : **les deux** (écrans « Atelier » plein cadre + fiche en volet rapide depuis la scène).
- Palette de commandes : **ligne de commande en pied**, résultats qui montent.

## Appareils
- X250 : viser **1920×1080** (12,5", mise à l'échelle Sway, soit environ 1536×864 px CSS à 125 %).
- Mac : **barre de titre intégrée discrète** (fusionnée avec le fond, feux visibles, titre du projet en petit).

## Mouvement, son, densité
- **Mouvement doux + sons discrets** optionnels (désactivés par défaut), jamais d'animation pendant la frappe.
- Densité des écrans d'atelier : **équilibrée** (une fiche tient autant que possible en un écran).
