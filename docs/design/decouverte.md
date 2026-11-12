# Découvrabilité : inventaire et directions (12 nov. 2026)

Retour de Pierre après essai de l'app de bureau (main `ed0368d`) : « quasiment rien n'est accessible si on ne connaît pas les raccourcis clavier ». Cause : DESIGN.md §5.1 (« visibles en permanence : en-tête, compteur, état, pastilles. Rien d'autre ») appliqué à la lettre, alors que les maquettes montraient les outils déjà ouverts sans dire comment y arriver. Le défaut est dans le design language, pas dans le code.

## 1. Inventaire : ce qu'un débutant ne peut pas découvrir

Seuls points d'entrée visibles aujourd'hui : le fil d'Ariane de l'en-tête (cliquable, mais rien ne l'indique), « N remarques du Compagnon » dans le pied (seulement s'il y a des remarques), les pastilles, les noms connus dans le texte. Les menus macOS ne contiennent qu'Édition et Fenêtre. Les boutons ont `tabIndex=-1` : on ne les atteint pas à la tabulation.

| Écran | Fonction | Accès aujourd'hui | Visible ? |
|---|---|---|---|
| Écriture | Manuscrit (tiroir) | `⌘J` ; clic sur le fil d'Ariane | à peine |
| | Vue d'ensemble | `⌘⇧P` ; « Plan » dans le tiroir | non |
| | Panneau du Compagnon (points, conversation) | `⌘L` ; lien du pied s'il y a des remarques | rarement |
| | Ligne de commande (toutes les actions) | `⌘K` | **non** |
| | Atelier et ses 5 modules | `⌘E`, `⌘1…5` | **non** |
| | Nouvelle scène, nouveau chapitre | `⌘N`, `⌘⌥⇧N` ; aide du pied du tiroir | non |
| | Variantes, points de restauration | `⌘⇧N`, `⌘⌥V`, `⌘S` ; variante dans l'en-tête seulement s'il y en a plusieurs | non |
| | Avis du Compagnon (scène, chapitre, manuscrit) | `⌘⇧A` ; ligne de commande | non |
| | Réglette d'intervention, plus ou moins d'aide | dans le panneau seulement | non |
| | Clé d'API du Compagnon | ligne de commande seulement | **non** (sans elle, pas de Compagnon) |
| | Affichage : taille, colonne, focus, thème, machine à écrire, animations | raccourcis ; ligne de commande | non |
| | Mise en forme : italique, citation, séparateur | raccourcis | non (usuel pour l'italique) |
| | Corrections de langue | `⌥⏎` sur le soulignement | non |
| Tiroir | Renommer, déplacer, corbeille, restaurer | ligne de commande | non |
| Atelier | Nouvelle fiche, valider ou rejeter | touches affichées dans l'écran | oui, une fois dans l'Atelier |
| Projet | Bibliothèque, nouveau projet, renommer | `⌘O` ; ligne de commande | non |
| Premier lancement | Que faire, où sont les outils | rien : page vide, sans invite | **non** |

## 2. Socle commun (quelle que soit la direction)

1. **Menus macOS complets** : Fichier, Édition, Scène, Manuscrit, Atelier, Compagnon, Présentation, Fenêtre, Aide. Toute commande du registre y figure avec son raccourci. C'est l'endroit où un utilisateur Mac cherche d'abord, et la recherche du menu Aide trouve toute commande. Coût nul pour le calme de la page.
2. **Zone de commande** : la ligne de commande a un point d'entrée visible (sa forme dépend de la direction) ; son invite est « Que voulez-vous faire ? ».
3. **Premier lancement** : la scène vide porte une invite (« Écrivez ici… ») et une note d'accueil du Compagnon dans la marge, qui nomme les trois endroits à connaître et propose « Faire le tour » (3 étapes, une bulle par point d'entrée). Rejouable par Aide › Revoir la visite guidée.
4. **États vides** : chaque panneau vide dit quoi faire (« Aucune remarque. Demandez l'avis du Compagnon sur la scène : ⌘⇧A »). Si la clé d'API manque, le pied dit « Compagnon : saisir la clé » (cliquable).
5. **Bulles d'aide** : tout bouton a une bulle « Libellé (raccourci) ». Tout contrôle visible est atteignable à la tabulation.
6. **Affichage (`Aa`)** : un bouton ouvre un petit panneau de confort (taille, colonne, focus, thème, animations).

## 3. Trois directions

À comparer dans `mockups/index.html`, groupe **Découverte** (touche `G`), écrans 1 à 8 (le 8 est le premier lancement), bouton **Frappe** (touche `W`) pour voir ce qui s'efface pendant l'écriture.

### 1 · Poignées (recommandée)
Une poignée en relief sur chaque bord, là d'où sort le panneau : « Manuscrit `⌘J` » à gauche, « Compagnon `⌘L` » à droite avec le nombre de points. En haut à droite, un contrôle segmenté « Écrire | Atelier ». Dans le pied, la zone de commande gravée au centre, `Aa` à droite. Tout cela s'efface à la première frappe et revient au mouvement de la souris, à `Échap` ou après 3 s sans frappe.
- Pour : la page reste celle du design actuel ; chaque outil se trouve là où il apparaît (mémoire spatiale) ; la zone de commande enseigne les raccourcis en passant.
- Contre : quatre éléments de plus à l'écran au repos ; une poignée verticale se lit moins vite qu'un bouton.

### 2 · Établi ouvert
Le tiroir du manuscrit et le panneau du Compagnon sont ouverts par défaut, de part et d'autre de la page ; « Pleine page » (`⌘\`) les range et l'on retombe sur les poignées de la direction 1. L'app se souvient du choix.
- Pour : tout est visible dès le premier lancement, rien à deviner ; tient sur le X250 (22 + 25,5 rem de panneaux, colonne de 38 rem).
- Contre : la « marge qui respire » disparaît (le panneau la remplace) ; plus proche du « look tableau de bord » écarté dans le brief ; la page est moins calme.

### 3 · Barre d'outils
Une barre à libellés dans la barre de titre (pleine largeur en haut sur le X250) : Manuscrit, Plan | titre | Écrire / Atelier, Compagnon 4, Rechercher `⌘K`, `Aa`. Elle s'efface pendant la frappe, comme en 1.
- Pour : la convention la plus familière ; des mots, pas des symboles.
- Contre : le haut de l'écran se charge ; les outils ne sont pas là où ils s'ouvrent ; sur le X250 elle prend une bande de hauteur.

## 4. Recommandation

**Direction 1 et le socle commun.** Elle corrige le défaut sans toucher à ce que Pierre a validé : la page calme, la marge qui respire, la ligne de commande en pied. Complément possible tiré de la direction 2 : un panneau ouvert reste ouvert d'une session à l'autre, tant que l'auteur ne le ferme pas.
