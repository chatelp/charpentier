/**
 * The corpus the « never writes the novel » detector is measured on
 * (guard.corpus.test.ts): answers that write the novel, and answers of a
 * mentor that do not. Written by hand, in the voice the prompts ask for.
 */

/** What the author wrote: their scene, their messages. */
export const CORPUS_AUTHOR = [
  'Il pleuvait sur Nantes. Hélène regardait la Loire monter, sans un mot.',
  'Son père avait fermé l’atelier avant la crue. Elle ne répondit rien et serra la rambarde.',
  '— Tu ne partiras pas, dit-il.',
  '— Je reste jusqu’à la crue, répondit Hélène.',
  'Je voudrais que la scène du pont soit plus tendue.',
].join('\n');

/** What the author validated in their sheets (sheetsSummary). */
export const CORPUS_SHEETS = [
  'meta.pitch: Une batelière refusait de quitter le fleuve qui avait pris sa mère.',
  'characters [c1] name: Hélène; summary: Batelière têtue. Elle gardait la barque de sa mère et ne parlait à personne.',
].join('\n');

/** Answers that write the novel: each must be refused. */
export const WRITES_THE_NOVEL: readonly string[] = [
  // Plain narration, announced or not.
  'Voici la scène que vous demandez :\n\nHélène descendit vers le fleuve. La pluie tombait toujours sur les quais.\n\nElle s’arrêta devant la barque de son père et posa la main sur le bois mouillé. Rien ne bougeait.',
  'Hélène poussa la porte de l’atelier. Une odeur de goudron flottait dans l’air. Elle avança entre les coques renversées, le cœur battant.',
  'La nuit tombait sur le port. Les lampes s’allumaient une à une le long du quai, et l’eau prenait la couleur du fer.',
  'Bien sûr. Le vent se leva vers minuit. Hélène n’avait pas fermé l’œil. Elle écoutait le fleuve cogner contre les piles du pont.',
  'Voici une proposition :\n\nLe vieux batelier attendait sur la berge, sa pipe éteinte entre les dents.',
  'Je marchais le long du fleuve quand la sirène retentit. Je m’arrêtai net. Personne ne courait, personne ne criait.',
  'Elle ouvrit la lettre. Ses mains tremblaient. Dehors, la crue montait encore, et les voisins partaient un à un.',
  'Voici le début :\n\nIl faisait froid ce matin-là.',
  'Voilà une version plus tendue :\n\nHélène courut jusqu’au pont. L’eau léchait déjà les planches.',
  'Les hommes arrivèrent à l’aube. Ils portaient des cordes et des gaffes, et ne dirent pas un mot en passant devant la maison.',
  'Son père était mort en novembre. Depuis, la maison restait fermée, et les barques pourrissaient sous l’appentis.\n\nHélène revint au printemps. Elle trouva la clef sous la pierre.',
  'Avec plaisir.\n\nPaul attendait depuis une heure. Il regardait sa montre, puis la porte, puis sa montre encore. Enfin elle entra.',
  'Le fleuve avait tout pris. Il restait un mur, une cheminée, le cadre d’une fenêtre où pendait un rideau.',
  'Elle se retourna. Il était là, immobile sous la pluie, et il la regardait comme on regarde une étrangère.',
  // Narration in the present.
  'Hélène pousse la porte. La pièce est vide, les volets clos. Elle avance jusqu’à la table et pose la lampe. Sur le mur, la carte du fleuve se décolle par un coin. Elle la lisse du plat de la main, longuement, comme on calme une bête. Dehors, quelqu’un appelle, mais elle ne se retourne pas.',
  'La barque glisse entre les saules. Hélène tient la gaffe à deux mains et ne quitte pas la rive des yeux. Un héron s’envole sans bruit. Le courant porte la barque vers le pont, où une lanterne tremble. Elle sait que son père attend là, debout, depuis la tombée du jour, et que rien ne sera dit.',
  // Dialogue with dashes.
  'Voici la scène :\n— Je ne partirai pas, dit Hélène.\n— Alors reste, répondit Paul.',
  '— Le fleuve monte, murmura Hélène.\n— Il monte toujours, répondit son père.',
  '— je reste, dit-elle.',
  '— Vous ne partirez pas.\n— Et qui m’en empêchera ?',
  '– Je reste.\n– Tu es folle.',
  '-- Tu viens ?\n-- Non.',
  '- Ferme cette porte ! s’écria Paul.',
  '— Tais-toi !\n— Jamais.',
  'Une possibilité :\n— Où est ta mère ?\n— Au fleuve.',
  '— Il est tard, Hélène.\n— Je sais.',
  // Dialogue with quotation marks.
  '« Je reste », dit Hélène.',
  '« Tu viens ? » demanda-t-elle.',
  '« Jamais », murmura-t-il en détournant les yeux.',
  '« Je ne partirai pas, dit-elle, tant que la barque est là. »',
  'Par exemple : « Rends-moi la clef », lança Paul.',
  '“Je reste”, répondit Hélène.',
  // English.
  '"I’m not leaving," she said.',
  '"Then stay," Paul replied.\n"I will," she said.',
  'She walked down to the river. The rain was still falling. Paul waited on the bridge.',
  'Here is the scene:\n\nHelen opened the door. The room was empty.',
  // Foreign quoted passages.
  'Vous pourriez écrire : « La pluie tombait toujours sur Nantes quand Hélène descendit vers le fleuve, les mains enfoncées dans les poches de son ciré, sans un regard pour les barques que le courant arrachait une à une à leurs amarres, et sans entendre la voix de son père qui l’appelait depuis le pont, de plus en plus loin, de plus en plus faible. »',
  '> La pluie tombait toujours sur Nantes quand Hélène descendit vers le fleuve, les mains dans les poches.',
  'Essayez ceci : « Hélène s’arrêta. Le fleuve grondait. Elle n’avait plus peur, seulement froid, et cette envie de rire qui lui venait toujours trop tard. »',
  'Quelque chose comme « Elle descendit vers le fleuve sans se presser, parce qu’elle savait déjà ce qu’elle y trouverait » poserait le ton.',
  // Mixed: a mentor's sentence, then the novel.
  'Je comprends votre demande. Voici la suite :\n\nHélène ne dormit pas cette nuit-là. Elle resta assise près de la fenêtre.',
  'Votre scène manque d’un geste. Hélène serra la rambarde. Le bois était froid. Elle ferma les yeux et compta les vagues.',
  'D’accord, juste un court passage pour vous lancer.\n\nLe pont tremblait sous ses pas. En bas, l’eau charriait des arbres entiers.',
  'Le père entra sans frapper. Il posa son chapeau sur la table et la regarda longtemps.\n\nQu’en pensez-vous ?',
  'Il était une fois une batelière qui ne voulait pas quitter son fleuve. Chaque matin, elle comptait les barques.',
];

/** Answers of a mentor: none may be refused. */
export const MENTORS: readonly string[] = [
  'Que veut Hélène à ce moment ? Montrez-le par un geste plutôt que de le nommer.',
  'Votre phrase « Hélène regardait la Loire monter, sans un mot » installe bien le silence.\n\nQue veut-elle, à cet instant ? Si vous le savez, le lecteur le sentira.',
  'Quelques questions pour trouver votre fin :\n- Que signifie un sas ouvert dans votre monde ? Qu’est-ce qui risque d’entrer ?\n- Que risquent les serres si le sas reste ouvert pendant que la Loire monte ?\n- Hélène va-t-elle fermer cette porte ? Le faire ou ne pas le faire est un choix.',
  'Trois pistes pour tendre la scène du pont :\n– Que risque Hélène si elle reste ?\n– Qui la regarde, et que croit-il voir ?\n– Quel objet pourrait porter la menace à sa place ?',
  'Je vois trois points à travailler :\n– Le désir d’Hélène : il n’apparaît qu’à la fin.\n– L’obstacle : le père ne s’oppose pas assez tôt.\n– Le rythme : les phrases longues ralentissent la crue.',
  'Pour la suite, je vous propose :\n– Resserrer l’ouverture.\n– Garder le silence d’Hélène.\n– Faire entrer le père plus tôt.',
  '– Hélène veut rester.\n– Son père veut qu’elle parte.\n– La crue décide pour eux.\n\nLe conflit tient en ces trois lignes : laquelle votre scène montre-t-elle le moins ?',
  'Votre fiche dit qu’Hélène est une « Batelière têtue ». Dans la scène, je la vois surtout silencieuse. Où son entêtement se voit-il ?',
  'Vous avez noté dans sa fiche : « Elle gardait la barque de sa mère et ne parlait à personne. » La scène du pont pourrait s’appuyer sur cette barque.',
  'Votre pitch, « Une batelière refusait de quitter le fleuve qui avait pris sa mère », contient déjà le conflit. La scène le fait-elle sentir ?',
  'Vous écrivez :\n> Son père avait fermé l’atelier avant la crue. Elle ne répondit rien et serra la rambarde.\n\nLe geste dit tout. Faut-il encore le silence juste avant ?',
  'La réplique « Tu ne partiras pas, dit-il » arrive sans préparation. Qu’a vu Hélène, juste avant, qui rende cette phrase menaçante ?',
  'Dans votre texte, « — Je reste jusqu’à la crue, répondit Hélène. » répond trop vite. Un silence, un geste entre les deux répliques donnerait du poids à sa décision.',
  'Je préfère ne pas proposer de texte pour votre roman : c’est votre voix qui compte. Dites-moi ce qui vous retient dans ce passage, et cherchons ensemble.',
  'Je ne l’écrirai pas à votre place : cette scène doit porter votre voix. Mais dites-moi : que voit Hélène en premier quand elle arrive sur le pont ?',
  'Ce qui fonctionne : la pluie, dès la première phrase, donne le ton. Ce qui résiste : on ne sait pas encore ce qu’Hélène risque.\n\nQue perdrait-elle si elle partait ?',
  'Le principe est simple : un personnage se révèle par ce qu’il fait sous la pression. Votre Hélène ne fait rien encore. Quel geste pourrait la trahir ?',
  'Flaubert relisait ses pages à voix haute pour en éprouver le rythme. Vous pourriez essayer sur ce paragraphe : où votre voix bute-t-elle ?',
  'Dans « L’Étranger », Camus ouvre sur une phrase sèche qui installe la distance du narrateur. Votre ouverture cherche-t-elle cette distance, ou son contraire ?',
  'Simenon posait un décor en deux lignes et laissait le reste au lecteur. Il se méfiait des adjectifs. Qu’est-ce que votre première page pourrait retirer ?',
  'Vous aviez choisi le présent pour ce chapitre. Ici, le texte passe à l’imparfait : est-ce voulu ?',
  'Le père pourrait entrer plus tôt. S’il était là dès la première ligne, le silence d’Hélène deviendrait un refus.',
  'Si Hélène savait déjà que la barque avait disparu, sa réaction changerait. Que sait-elle exactement quand la scène commence ?',
  'Hier, vous disiez que le père était mort avant le début du roman. Aujourd’hui il parle dans la scène. Laquelle des deux versions gardez-vous ?',
  'Dans la version précédente, Hélène partait à la fin. Maintenant elle reste. Ce changement sert-il ce que vous voulez dire du fleuve ?',
  'Bonne question. Le point de vue interne vous oblige à ne montrer que ce qu’Hélène perçoit. Tout ce qu’elle ignore, le lecteur l’ignore aussi.',
  'Deux choses.\n\nD’abord, la scène tient : on voit le pont, on sent la crue.\n\nEnsuite, la fin arrive trop vite. Que se passerait-il si Hélène hésitait une seconde de plus ?',
  'Oui.',
  'Je ne sais pas encore. Pouvez-vous me dire ce que vous vouliez que le lecteur ressente à la fin de cette scène ?',
  'Un dialogue avance quand chaque réplique veut quelque chose. Regardez les vôtres : que veut le père quand il dit « Tu ne partiras pas » ?',
  'La métaphore du fer revient trois fois. La première frappe ; la troisième s’use. Laquelle garderiez-vous ?',
  'Attention à la chronologie : au chapitre 2, la crue commençait en mars ; ici, vous parlez de novembre. Est-ce une autre crue ?',
  'Ce paragraphe explique ce que le précédent montrait déjà. Le lecteur a compris ; faites-lui confiance.',
  'Votre héroïne garde le silence pendant toute la scène. C’est une force, à condition que ce silence coûte quelque chose à quelqu’un. À qui ?',
  'Pour l’acte II, trois questions :\n1. Qu’est-ce qu’Hélène croit vouloir ?\n2. De quoi a-t-elle besoin, en vérité ?\n3. Qui se tient entre les deux ?',
  '**Ce qui tient** : le décor, posé en deux phrases.\n\n**Ce qui manque** : un enjeu visible avant la fin de la page.',
  'The scene holds. What does Helen want when she reaches the bridge? Show it through a gesture rather than naming it.',
  'I would rather not write it for you: the scene needs your voice. Tell me what Helen sees first, and we will work from there.',
  'Your sentence "Hélène regardait la Loire monter, sans un mot" sets the silence well. What does the silence cost her?',
  'On dit souvent « montrer, ne pas dire ». Le principe a ses limites : un résumé bien placé fait gagner dix pages.',
  'La scène du pont est plus tendue qu’avant. Le père arrive tôt, et son silence pèse. Reste la dernière phrase : que voulez-vous qu’on emporte ?',
  'Hélène refuse de partir parce qu’elle a peur de trahir sa mère. C’est ce que dit votre fiche. La scène, elle, donne une autre raison : laquelle est la vraie ?',
  'Le père ne dit rien, et c’est bien. Mais Hélène non plus, et deux silences s’annulent. Lequel des deux devrait céder ?',
  'Vous m’avez demandé hier si le passé simple convenait. Il donne de la distance ; l’imparfait installe la durée. Votre scène a besoin des deux.',
  'Relisez la phrase « Elle ne répondit rien et serra la rambarde » : le geste remplace la réplique. C’est exactement ce que la scène demande ailleurs.',
  'Je note que le père « avait fermé l’atelier avant la crue ». Pourquoi avant ? Ce détail peut devenir un indice.',
];

/**
 * Held out: written after the rules were settled, and never used to adjust
 * them. What the detector gets wrong here stays wrong, and is named in the test.
 */
export const HELD_OUT_NOVEL: readonly string[] = [
  'Marc gara la voiture devant la gendarmerie. Personne ne l’attendait. Il coupa le moteur et resta un moment les mains sur le volant.',
  'Très bien, voici un essai :\n\nLa neige recouvrait le col depuis la veille. Les mules refusaient d’avancer.',
  'Ils se retrouvèrent à la gare. Elle portait le manteau gris de leur première rencontre, et il comprit qu’elle avait déjà choisi.',
  '« Tu mens », souffla Claire.',
  '— Asseyez-vous, docteur.\n— Je préfère rester debout.',
  'J’avais douze ans quand la guerre arriva au village. Ma mère cousait des pièces d’or dans l’ourlet de nos manteaux.',
  'Le commissaire Vasseur détestait les dimanches. Celui-ci commençait mal : un corps dans le canal, et pas de café.',
  'Voici comment je l’écrirais.\n\nAnna s’assoit au bord du lit. Elle regarde ses mains, puis la valise ouverte. Rien n’y manque, sauf l’envie de partir.',
  '"Where were you?" Tom asked.\n"Out," she said.',
  'L’enfant courait sur la digue en riant, et derrière lui la mer montait, grise, patiente.\n\nPersonne ne le rappela.',
  '— Qu’est-ce que tu as fait de l’argent ?\n— Quel argent ?',
  'Un exemple de ce que cela pourrait donner : « Le train s’ébranla. Sur le quai, sa mère agitait un mouchoir qu’il ne voyait déjà plus, et il sut qu’il ne reviendrait pas. »',
  'Le matin se lève sur la ferme. Jeanne trait les vaches dans le noir, les doigts gourds. Le lait fume dans le seau. Au loin, un coq s’égosille, et le chien du voisin lui répond. Elle pense à la lettre restée sur la table, et à ce qu’elle dira quand il rentrera.',
  'Il y eut un long silence. Puis la porte grinça, et une silhouette parut sur le seuil.',
  'Reprenons autrement.\n\n« Vous n’avez pas le droit », dit-elle d’une voix blanche.\n\nIl haussa les épaules.',
];

export const HELD_OUT_MENTORS: readonly string[] = [
  'Votre commissaire déteste les dimanches : c’est un bon trait, parce qu’il promet une humeur. Comment cette humeur pèse-t-elle sur sa première décision ?',
  'Je vous arrête sur un point de chronologie. Marc arrive à la gendarmerie avant d’avoir reçu l’appel. Est-ce une erreur, ou sait-il déjà quelque chose ?',
  'Le chapitre 3 répète ce que le chapitre 2 avait établi. Vous pouvez couper sans perte, ou donner à la répétition une raison d’être.',
  'Trois choses tiennent déjà :\n- la voix de la narratrice, sèche et drôle ;\n- le décor, qu’on voit sans effort ;\n- le secret, posé dès la première page.\n\nReste la fin de scène, qui explique trop.',
  'Tchekhov disait qu’un fusil accroché au mur au premier acte doit servir avant le dernier. Votre valise ouverte est ce fusil. Quand sert-elle ?',
  'Non, je ne crois pas qu’il faille changer de point de vue ici. Vous perdriez l’ignorance d’Anna, qui fait toute la tension.',
  'Vous me demandez d’écrire le début. Je ne le ferai pas, parce que ce début doit avoir votre oreille. En revanche, répondez à ceci : quelle est la première chose qu’Anna remarque en entrant ?',
  'La phrase est longue, mais elle se tient : chaque virgule ajoute un geste. Lisez-la à voix haute. Où reprenez-vous votre souffle ?',
  'Pour le personnage de Claire, je vous suggère de remplir d’abord deux lignes de sa fiche :\n– Ce qu’elle veut.\n– Ce qu’elle cache.',
  'Dans les polars de Fred Vargas, l’enquêteur avance par intuition et le lecteur le suit sans tout comprendre. Votre Vasseur raisonne beaucoup. Est-ce le ton que vous cherchez ?',
  'Bilan de la structure : les deux premiers actes sont nets. Le troisième arrive tard, et l’arc de Tom s’interrompt après la gare. Voulez-vous le refermer, ou l’abandon fait-il partie du propos ?',
  'Vous avez écrit ce matin que Jeanne « savait depuis toujours ». Depuis quand, exactement ? Le lecteur aura besoin d’une date, ou d’un souvenir.',
  'Une incise comme « dit-elle » suffit presque toujours. Les verbes plus colorés attirent l’œil sur l’auteur plutôt que sur la réplique.',
  'C’est mieux. La scène commence plus tard et finit plus tôt. Je regrette seulement la disparition du chien : il donnait une présence à la cour.',
  'Avant d’aller plus loin : qui raconte, et à quelle distance des événements ? Tant que ce n’est pas décidé, chaque phrase hésitera.',
];
