# Vérifications sur le vrai X250

À faire une fois, à la main, après la première installation (docs/PLAN.md, phases 5.4 à 5.13). Chaque ligne cochée permet de passer la phase à « Réalisé ». Ce qui ne marche pas : le noter tel quel (ce qu'on a fait, ce qu'on a vu), avec une photo de l'écran si possible.

Une fois le X250 installé, la phase 5.10 bis rejoue la plupart de ces vérifications depuis le Yoga L13 (dernière partie) ; restent à la main le rabat, les vraies touches, la clé USB, le Bluetooth et le téléphone.

## Avant de commencer

- [ ] BIOS du X250 (F1 au démarrage) : Secure Boot désactivé ; pour l'installation par le réseau, « UEFI IPv4 Network Stack » activé.
- [ ] L'adresse MAC de la carte Ethernet du X250, relevée dans le BIOS ou sur l'étiquette (pour l'installation par le réseau) : ____.
- [ ] La clé d'installation est prête (image construite sur le Yoga L13 avec l'app à jour).
- [ ] Le chargeur est branché, le Wi-Fi de la maison et son mot de passe sont sous la main.
- [ ] Une clé USB vide (pour la copie des textes), un casque ou un clavier Bluetooth, une imprimante allumée si possible.

## 5.9 bis · L'installation

- [ ] F12 au démarrage, choisir la clé : l'installateur s'affiche dans la matière du système (fond sombre, chasse fixe).
- [ ] Le clavier choisi à l'accueil est bien celui qu'on tape ensuite.
- [ ] Le disque proposé est le bon (modèle et taille), l'effacement demande ⏎ ⏎.
- [ ] Le mot de passe du disque, tapé deux fois. Le noter sur papier, rangé loin de l'ordinateur.
- [ ] La copie va au bout, « retirez la clé pour continuer », puis redémarrage.
- [ ] Durée de l'installation : ____ min.

## 5.9 ter · L'installation par le réseau (au lieu de la clé)

Préalables sur le prodesk2021 (infra/README.md, « Installer le X250 par le réseau ») : `NETBOOT_SECRET` et `NETBOOT_MACS` dans le `.env`, serveur redéployé, pare-feu ouvert, Pixiecore allumé.

- [ ] Le X250 branché par câble sur le réseau de la maison, F12 puis la carte réseau : l'installateur s'affiche (sans parler de clé) en environ une minute.
- [ ] La suite comme avec la clé (ci-dessus), jusqu'à « ⏎ redémarrer ».
- [ ] Une autre machine qui démarre sur le réseau (le Mac ne compte pas) ne reçoit rien.
- [ ] Pixiecore arrêté ensuite.

## 5.9 · Le démarrage

- [ ] L'écran du mot de passe du disque : fond sombre, « charpentier · x250 », « mot de passe du disque : », un point par caractère, net et à la bonne taille sur l'écran du X250.
- [ ] Un mot de passe faux : « mot de passe refusé » sur une ligne inversée ; le bon ouvre le disque.
- [ ] Le passage de cet écran à l'app se fait sans texte de démarrage ni écran noir prolongé.
- [ ] Temps entre le mot de passe validé et l'app prête à écrire : ____ s.
- [ ] Aucune autre fenêtre, ni barre, ni bordure : l'app est tout l'écran.

## 5.6 · Le premier démarrage et le verrou

- [ ] Au premier démarrage, le choix « téléphone ⏎ » ou « clavier Échap ». Par le clavier : Wi-Fi, code, synchronisation, Compagnon ; chaque étape peut être remise à plus tard (Échap). Le téléphone : partie 5.13.
- [ ] Le Wi-Fi de la maison se rejoint depuis l'étape Wi-Fi.
- [ ] Un code de verrouillage choisi (deux fois).
- [ ] La connexion au serveur de synchro (`https://charpentier.chatel.pm`, ton compte) : « Synchronisé » dans le pied, et ton roman apparaît dans la bibliothèque.
- [ ] Quitter l'app (ou redémarrer le X250) : la connexion à la synchro est toujours là au retour, sans se reconnecter.
- [ ] La clé du Compagnon (si tu la donnes) est toujours là après un redémarrage.
- [ ] Rabattre l'écran, attendre quelques secondes, le rouvrir : le code est demandé, aucun texte n'est visible avant.
- [ ] Un code faux : le champ tremble une fois et se vide.

## 5.13 · Le premier démarrage depuis le téléphone

À faire sur un X250 neuf (ou réinstallé), à la place du premier démarrage au clavier.

- [ ] Le choix « téléphone » est allumé (la carte Wi-Fi du X250 sait ouvrir un réseau) ; ⏎.
- [ ] Le QR code se lit avec l'appareil photo du téléphone : le téléphone rejoint `charpentier-xxxx`, l'étape 1 se coche seule, la ligne système dit `wifi temporaire`.
- [ ] Le second QR code ouvre la page sur le téléphone ; l'adresse tapée à la main demande le code à six chiffres affiché.
- [ ] Le gestionnaire de mots de passe du téléphone remplit le Wi-Fi de la maison, le compte et la clé du Compagnon.
- [ ] Envoyer : le réseau temporaire disparaît (il n'est plus dans la liste du téléphone), chaque ligne se coche sur le X250.
- [ ] Un mot de passe Wi-Fi faux : « Corriger depuis le téléphone ⏎ » rouvre le réseau temporaire, le reste est gardé.
- [ ] Le code du verrou, au clavier, puis « Écrire ⏎ » : le roman synchronisé s'ouvre, sans avoir tapé un mot de passe sur le X250.

## 5.4 · L'essentiel du système

- [ ] La ligne système en haut : Wi-Fi, luminosité, volume, batterie, heure, sans rien de coupé.
- [ ] Le Wi-Fi : la liste des réseaux, rejoindre, oublier un réseau.
- [ ] Les touches de luminosité : la jauge bouge, le segment s'allume une seconde ; jamais d'écran noir.
- [ ] Les touches de volume et de muet : même chose.
- [ ] La batterie : les deux batteries du X250 (interne et amovible) apparaissent, avec niveau et usure ; débrancher le chargeur affiche le temps restant.
- [ ] La mise en veille, le redémarrage et l'arrêt depuis le menu du système (⊞).
- [ ] « À propos » : X250, NixOS, disque chiffré : oui.

## 5.5 · Le moniteur

- [ ] Le segment `cpu` suit la charge ; un clic (ou ⊞M) ouvre le moniteur.
- [ ] Les huit cadrans et leurs courbes s'affichent ; le ventilateur et les températures du X250 sont lus.
- [ ] Pendant qu'on tape, le segment ne bouge pas.

## 5.7 · Les périphériques et le confort

- [ ] Brancher une clé USB : « clé branchée » dans la ligne ; « Copier mes textes » (⊞U) écrit un dossier `Charpentier/<date>` en Markdown ; éjecter.
- [ ] Imprimer une scène (⊞P) : l'imprimante du réseau est trouvée, la page sort en Literata double interligne.
- [ ] Appairer un casque ou un clavier Bluetooth depuis les réglages.
- [ ] Brancher un écran externe : l'app s'y affiche, la taille se règle.
- [ ] Le mode nuit s'active à l'heure dite (ou le forcer dans les réglages) : l'écran devient plus chaud.

## 5.8 · L'app elle-même

- [ ] Écrire une scène, la fermer, la rouvrir : rien n'est perdu.
- [ ] La correction orthographique française souligne une faute.
- [ ] Une phrase écrite sur le X250 arrive sur le Mac, et inversement.

## 5.12 · Les mises à jour (après la première release de l'app)

- [ ] Après une release, le X250 (ailleurs qu'à la maison, par exemple sur le partage de connexion du téléphone) dit « mise à jour prête · ⊞R redémarrer » dans l'heure, et `maj x.y.z` reste dans la ligne.
- [ ] « À propos » : la version installée et sa date, la carte « Version x.y.z prête », Vérifier maintenant.
- [ ] ⊞R puis ⏎ ⏎ : l'écran du disque porte « mise à jour x.y.z », puis « à jour · x.y.z » ; le texte écrit juste avant est là, et sur le Mac.
- [ ] « Revenir à la version précédente » depuis « À propos » : redémarrage, « revenu à … · … mise de côté » ; puis repasser à la version mise de côté.

## 5.10 et 5.10 bis · Depuis le Yoga L13

- [ ] Une mise à jour du X250 depuis le Yoga L13 (version développement), sans le toucher.
- [ ] Les essais automatiques passent sur le vrai X250, avec le compte rendu et les captures ; le temps de démarrage relevé.
- [ ] La version d'écriture réinstallée ensuite : plus aucun accès par le réseau (SSH refusé).

## Ce qu'on note pour la suite

- Ce qui a raté, et à quelle étape :
- Ce qui est lent ou gênant :
- L'écran du X250 : 1920 × 1080 ou 1366 × 768 ? (voir « À propos » ou l'étiquette sous l'ordinateur)
