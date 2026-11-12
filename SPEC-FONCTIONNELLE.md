# Charpentier : spécification fonctionnelle

- **Version** : 0.1 (brouillon de cadrage)
- **Date** : 12 novembre 2026
- **Portée** : fonctionnel uniquement. Les choix techniques (stack, modèles, hébergement, architecture des agents, stockage) sont traités dans un document séparé.

---

## 1. Vision

Charpentier est un outil d'aide à l'écriture de romans et de nouvelles, piloté par des agents IA. Il ne rédige pas le livre à la place de l'auteur. Il joue le rôle d'un romancier et éditeur expérimenté « par-dessus l'épaule » : il structure, vérifie la cohérence, pose des questions, signale les faiblesses, explique le métier et propose des améliorations.

Le nom rend hommage à Georges Charpentier, éditeur de Zola, Flaubert et Daudet, et évoque la **charpente** : la structure qui porte le récit.

### Idée centrale : la synchronisation bidirectionnelle

L'outil est organisé en **modules**, du plus abstrait (le méta : de quoi parle le livre) au plus concret (le texte). Chaque module est tenu à jour par un agent. Tous les modules restent synchronisés en continu, dans les deux sens :

- **Bottom-up** : l'auteur écrit le texte, et les modules du dessus (personnages, structure, thèmes…) se remplissent par inférence.
- **Top-down** : l'auteur pose ses intentions dans les modules du dessus, et elles servent de cadre au texte. Une modification en haut se répercute en signalements dans le texte.
- **Mixte** : l'auteur passe librement de l'un à l'autre, par exemple pour fixer dans un module une idée qui a émergé en écrivant.

Analogie : un IDE avec inférence de types. Les intentions déclarées par l'auteur sont les types déclarés, ce que l'agent déduit du texte est le type inféré, et le mentor joue le rôle du linter qui signale les écarts sans réécrire le code.

---

## 2. Principes non négociables

1. **L'IA n'écrit pas le livre.** Elle ne produit jamais de paragraphe de texte narratif. Le niveau d'aide rédactionnelle est réglable (voir §6.4), mais même au plus haut niveau il reste limité à des exemples ponctuels.
2. **Les décisions de l'auteur ne sont jamais écrasées.** Une information validée par l'auteur ne peut être modifiée que par lui. L'agent peut signaler qu'elle est contredite, jamais la changer.
3. **Tout ce que l'agent déduit est visible comme tel.** Chaque information porte un statut (voir §7.1), et l'auteur sait toujours ce qui vient de lui et ce qui vient de l'agent.
4. **Signaler plutôt que corriger.** Face à une incohérence, l'agent pointe l'écart et laisse l'auteur trancher. Un écart entre le texte et une fiche peut être une bonne idée émergente, pas une erreur.
5. **Expliquer le pourquoi.** Chaque remarque du mentor est justifiée par un principe du métier (« ce dialogue expose une information déjà connue du lecteur, ce qui casse la tension »), pas seulement par un verdict.

---

## 3. Publics

- **v1** : un seul utilisateur, l'auteur du projet, romancier débutant. Son propre roman sert de cas de test (voir §12).
- **Version publique** : débutants **et** auteurs confirmés. Le mentor adapte son niveau de pédagogie au profil de l'auteur (plus d'explications pour un débutant, plus de contrôle et de concision pour un confirmé).
- **Formes couvertes** : roman et nouvelle. Le scénario et la bande dessinée sont hors périmètre.
- **Langue** : français d'abord (texte des romans et interface). Les autres langues viendront plus tard ; rien ne doit l'empêcher dans la conception fonctionnelle.

---

## 4. Glossaire

| Terme | Définition |
|---|---|
| Projet | Un livre (roman ou nouvelle). Un compte peut contenir plusieurs projets. |
| Manuscrit | L'ensemble du texte d'un projet, organisé en chapitres et scènes. |
| Scène | Unité de base du texte. Une scène appartient à un chapitre et peut être déplacée. |
| Chapitre | Regroupement ordonné de scènes. |
| Variante | Version alternative d'une scène. Une seule variante est active dans le manuscrit à un instant donné. |
| Module | Un domaine d'information sur le livre (méta, structure, personnages…). |
| Fiche | Une entrée dans un module (un personnage, un lieu, un arc…). |
| Statut | État d'une information : proposée, validée, rejetée, contredite (voir §7.1). |
| Mentor | La voix unique par laquelle les agents s'adressent à l'auteur. |
| Signalement | Remarque du mentor rattachée à un passage du texte et/ou à une fiche. |

---

## 5. Organisation du contenu

### 5.1 Projets

- Un compte contient plusieurs projets.
- Un projet est de type **roman** ou **nouvelle**.
- Un projet peut être créé vide, ou à partir d'un texte importé (voir §9.1).

### 5.2 Manuscrit

- Le texte est écrit **dans l'outil**, dans un éditeur intégré.
- L'unité de base est la **scène**. Les scènes sont regroupées en **chapitres**.
- Scènes et chapitres sont réorganisables (glisser-déposer).
- **Variantes** : chaque scène peut avoir plusieurs versions. L'auteur choisit la variante active ; les autres sont conservées. Cela couvre aussi les fins alternatives (une scène finale avec plusieurs variantes).
- Historique : l'auteur peut revenir à une version antérieure d'une scène.

### 5.3 Les modules

Les modules sont listés du plus abstrait au plus concret.

| Module | Contenu |
|---|---|
| **Méta** | Pitch, résumé, intention de l'auteur, thèmes principaux, ton, genre(s), public visé. |
| **Thèmes et motifs** | Symboles, images et motifs récurrents ; où ils apparaissent dans le texte ; leur évolution. |
| **Structure** | Actes, arcs narratifs (principal et secondaires), intrigues, découpage en chapitres, rythme. Modèle narratif optionnel (voir §5.4). |
| **Personnages** | Une fiche par personnage (voir §5.5). |
| **Lieux et objets** | Une fiche par lieu ou objet important : description, rôle, scènes où il apparaît. |
| **Chronologie** | Ligne du temps des événements de l'histoire (temps de l'histoire, distinct de l'ordre du récit). |
| **Règles du monde** | Lois, contraintes et fonctionnement de l'univers (essentiel pour la SF et le fantastique). |
| **Relations** | Liens entre personnages et leur évolution au fil du récit. |
| **Style et voix** | Voix narrative, point de vue, temps du récit, registre, tics d'écriture de l'auteur, règles de style qu'il se fixe. |
| **Documentation** | Recherches, sources, notes documentaires, rattachables à des scènes ou des fiches. |
| **Carnet d'idées** | Idées en vrac, pas encore rattachées à un module. Le mentor peut proposer de les ranger. |
| **Texte** | Le manuscrit lui-même (voir §5.2). |

### 5.4 Modèles narratifs

- **Si l'auteur choisit un modèle** (trois actes, voyage du héros, Save the Cat…), l'outil s'en sert pour **guider** : il situe chaque scène dans le modèle, repère les étapes manquantes ou mal placées.
- **Sinon, la structure est libre.**
- **En bottom-up, l'agent peut détecter qu'un modèle narratif émerge** du texte et le proposer à l'auteur (statut « proposé »), qui l'adopte ou non.

### 5.5 Fiche personnage

- **Identité et apparence** : nom, âge, physique, métier, lieu de vie.
- **Psychologie** : désir, peur, blessure, contradiction, secret.
- **Arc** : évolution du personnage au fil du récit, étapes clés.
- **Relations** : liens avec les autres personnages (renvoi au module Relations).
- **Voix** : manière de parler, tics de langage, vocabulaire.
- **Apparitions** : scènes où le personnage apparaît (rempli automatiquement).

Chaque champ porte son propre statut (§7.1).

---

## 6. Le mentor

### 6.1 Une seule voix

Tous les agents s'expriment à travers **un seul mentor**, avec une voix unique et cohérente. L'auteur n'a pas à savoir quel agent a produit une remarque.

### 6.2 Quand le mentor réagit

Mode **mixte** par défaut :

- **Pendant l'écriture** : discret. Uniquement des signalements légers et peu intrusifs (orthographe, incohérence factuelle évidente : un personnage mort qui réapparaît, une couleur d'yeux qui change).
- **En fin de scène** : analyse complète de la scène (structure, personnages, rythme, style, cohérence) et mise à jour des modules.
- **À la demande** : l'auteur peut demander une analyse à tout moment, sur une scène, un chapitre ou tout le manuscrit.

### 6.3 Niveaux d'intervention

Réglables par l'auteur :

- **Discret** : le minimum, uniquement à la demande et en fin de scène.
- **Mentor** (par défaut) : le comportement décrit en §6.2.
- **Exigeant** : remarques plus nombreuses et plus directes, seuil de tolérance plus bas.

### 6.4 Niveaux d'aide rédactionnelle

Réglables par l'auteur. Le niveau **minimal, et par défaut**, combine :

- **Pistes** : le mentor pointe le problème, l'explique, et suggère des directions sans rédiger (« et si cette scène s'ouvrait sur le silence plutôt que sur le dialogue ? »).
- **Exemples ponctuels** : il peut reformuler **une phrase** à titre d'exemple pour illustrer un principe. Jamais un paragraphe, jamais un passage narratif complet.

Les niveaux supérieurs restent à définir (voir §13), dans le respect du principe n°1.

### 6.5 Pédagogie

- **Socratique** : le mentor pose des questions de lui-même pour faire émerger les intentions de l'auteur (« que veut vraiment ce personnage, et qu'est-ce qui l'en empêche ? »).
- **Explicatif** : chaque remarque est justifiée par un principe du métier (principe n°5).
- **Références** : il peut citer des œuvres connues pour illustrer un point, **avec parcimonie**, seulement quand la référence éclaire vraiment le propos.
- **Adaptation** : le niveau des explications s'adapte au profil (débutant ou confirmé).

### 6.6 Mémoire de progression

- Le mentor repère les **faiblesses récurrentes** de l'auteur (tics, dialogues explicatifs, adverbes, scènes sans enjeu…) et les suit d'un chapitre à l'autre.
- Il signale les progrès comme les rechutes, pour faire progresser l'auteur dans la durée.

### 6.7 Chat libre

En plus des signalements, l'auteur peut dialoguer librement avec le mentor (poser une question sur une scène, réfléchir à une intrigue, demander un avis).

---

## 7. Synchronisation des modules

### 7.1 Statuts des informations

Chaque information (fiche ou champ de fiche) porte un statut visible :

| Statut | Signification |
|---|---|
| **Proposée** | Déduite par l'agent, en attente de validation par l'auteur. |
| **Validée** | Saisie ou validée par l'auteur. Seul l'auteur peut la modifier. |
| **Rejetée** | Proposition refusée par l'auteur. L'agent ne la repropose pas sauf élément nouveau dans le texte. |
| **Contredite** | Information validée que le texte contredit. Génère un signalement de conflit. |

### 7.2 Bottom-up (du texte vers les modules)

- L'auteur écrit ; l'agent **remplit les fiches automatiquement**, chaque information en statut **« proposée »**.
- L'auteur valide, corrige ou rejette, au fil de l'eau ou par lot.
- Exemples : un nouveau personnage nommé crée une fiche proposée ; une scène de dispute entre deux personnages propose une relation conflictuelle ; un motif récurrent est proposé dans Thèmes et motifs ; un modèle narratif émergent est proposé dans Structure.

### 7.3 Top-down (des modules vers le texte)

Quand l'auteur modifie un élément d'un module (la fin, une motivation, une règle du monde), l'outil fait **les trois** :

1. **Liste les passages concernés** (scènes impactées).
2. **Surligne ces passages dans le texte.**
3. **Propose un plan de révision** ordonné de ce qu'il faut retravailler.

Le texte n'est jamais modifié automatiquement.

### 7.4 Conflits

Quand le texte contredit une information validée :

- une **annotation apparaît dans la marge** du passage concerné ;
- le conflit est ajouté à une **liste de points à traiter** ;
- l'auteur tranche : corriger le texte, mettre à jour la fiche (le texte avait raison), ou ignorer le signalement.

---

## 8. Correction de la langue

- Orthographe, grammaire et typographie (règles françaises : espaces insécables, guillemets, dialogues).
- Chaque correction est **proposée et à accepter**. Un bouton **« tout accepter »** existe pour l'orthographe pure (pas pour les corrections de style ou de grammaire discutables).

---

## 9. Import et export

### 9.1 Import

- Un projet peut démarrer à partir d'un **texte déjà écrit** (premier jet). Les agents l'analysent et remplissent tous les modules, tout en statut **« proposée »**.
- L'outil propose un découpage en chapitres et en scènes, que l'auteur ajuste.

### 9.2 Export

- **Manuscrit éditeur** : mise en page normalisée pour envoi à une maison d'édition.
- **EPUB**.
- **PDF** (lecture, impression, envoi aux bêta-lecteurs).
- **Bible du roman** : export des modules (personnages, monde, structure, chronologie…) en document.

---

## 10. Collaboration (après la v1)

Pas dans la v1, mais à ne pas rendre impossible :

- **Bêta-lecteurs** : lecture du manuscrit et commentaires.
- **Éditeur humain** : annotations aux côtés du mentor IA, distinguables de celles du mentor.

La co-écriture à plusieurs auteurs est hors périmètre.

---

## 11. Périmètre par version

### v1 (hypothèse à confirmer)

Le minimum pour que l'auteur commence réellement à écrire son roman avec l'outil :

- Projets multiples, création vide ou par import.
- Éditeur par scènes et chapitres, variantes de scènes, historique.
- Modules **Méta**, **Personnages**, **Structure** (avec modèles narratifs optionnels), **Règles du monde**.
- Suivi simple des **indices et fausses pistes** (voir §12).
- Mentor : voix unique, mode mixte, statuts, bottom-up, annotations en marge et liste de points à traiter, chat libre, niveau d'aide rédactionnelle minimal.
- Correction de la langue.

### v2

- Modules **Lieux et objets**, **Chronologie**, **Relations**, **Style et voix**, **Thèmes et motifs**, **Documentation**, **Carnet d'idées**.
- Top-down complet (liste, surlignage, plan de révision).
- Niveaux d'intervention et d'aide rédactionnelle réglables.
- Mémoire de progression.
- Exports.

### Plus tard

- Version publique avec adaptation débutant / confirmé.
- Collaboration (bêta-lecteurs, éditeur humain).
- Autres langues.

---

## 12. Cas de test : le roman de l'auteur

Le roman qui servira à éprouver l'outil mêle **littérature générale, polar et science-fiction**. Conséquences fonctionnelles :

- **Littérature générale** : profondeur psychologique des personnages, arcs intérieurs, voix et style.
- **Polar** : suivi des **indices**, des **fausses pistes** et de ce que le lecteur sait à chaque moment. Le mentor doit vérifier qu'un indice posé est exploité, qu'une révélation est préparée, qu'une fausse piste est résolue.
- **SF** : module **Règles du monde** indispensable dès la v1, avec détection des incohérences entre le texte et les règles posées.

Un module ou une vue **« Indices et révélations »** est à envisager (voir §13).

---

## 13. Questions ouvertes

1. **Périmètre exact de la v1** : la proposition du §11 est une hypothèse, à valider.
2. **Niveaux supérieurs d'aide rédactionnelle** (§6.4) : que peut faire le mentor au-delà des pistes et des exemples d'une phrase, sans écrire le livre ?
3. **Indices et révélations** : module à part entière, ou vue transversale sur Structure et Chronologie ?
4. **Profil de l'auteur** : comment l'outil détermine-t-il le niveau débutant / confirmé (déclaratif, déduit, réglable) ?
5. **Fréquence des signalements pendant l'écriture** : quels types de remarques sont jugés assez importants pour interrompre (même discrètement) ?
6. **Validation par lot** : quelle interface pour valider rapidement un grand nombre de propositions (cas de l'import d'un premier jet) ?
7. **Nom du mentor** : le mentor a-t-il un nom ou une personnalité propre dans l'interface ?
