# Vérifications sur le vrai X250

À faire une fois, à la main, après la première installation (docs/PLAN.md, phases 5.4 à 5.13). Chaque ligne cochée permet de passer la phase à « Réalisé ». Ce qui ne marche pas : le noter tel quel (ce qu'on a fait, ce qu'on a vu), avec une photo de l'écran si possible.

Une fois le X250 installé, la phase 5.10 bis rejoue la plupart de ces vérifications depuis le Yoga L13 (dernière partie) ; restent à la main le rabat, les vraies touches, la clé USB, le Bluetooth et le téléphone.

## Avant de commencer

- [x] BIOS du X250 (F1 au démarrage) : démarrage en **UEFI Only**, **CSM Support : No** (sinon F12 ne démarre pas la clé), Secure Boot désactivé ; pour l'installation par le réseau, « UEFI IPv4 Network Stack » activé et « PXE IPv4 First ». Wake on LAN reste désactivé.
- [x] L'adresse MAC de la carte Ethernet du X250, relevée dans le BIOS ou sur l'étiquette (pour l'installation par le réseau) : 68:f7:28:de:67:f9.
- [x] La clé d'installation est prête (image construite sur le Yoga L13 avec l'app à jour ; v0.1.0 écrite par Rufus en mode DD et relue à l'identique le 15 novembre 2026).
- [ ] Le chargeur est branché, le Wi-Fi de la maison et son mot de passe sont sous la main.
- [ ] Une clé USB vide (pour la copie des textes), un casque ou un clavier Bluetooth, une imprimante allumée si possible.

## 5.9 bis · L'installation

- [x] F12 au démarrage, choisir la clé : l'installateur s'affiche dans la matière du système (fond sombre, chasse fixe).
- [ ] Le clavier choisi à l'accueil est bien celui qu'on tape ensuite.
- [ ] Le disque proposé est le bon (modèle et taille), l'effacement demande ⏎ ⏎.
- [ ] Le mot de passe du disque, tapé deux fois. Le noter sur papier, rangé loin de l'ordinateur.
- [x] La copie va au bout, « retirez la clé pour continuer », puis redémarrage.
- [ ] Durée de l'installation : ____ min.

Constats de la première installation (15 novembre 2026) :
- Le système installé n'avait aucun micrologiciel, donc pas de Wi-Fi : corrigé côté `charpentier-os` (`hardware.enableRedistributableFirmware`, pull request `chatelp/charpentier-os#9`).
- La carte Wi-Fi de ce X250 est une Dell DW1830 (Broadcom BCM43602, pilote `brcmfmac`, Bluetooth BCM20703A1), pas l'Intel 7265 d'origine.
- Une fois, la carte n'apparaissait pas du tout (port PCIe 00:1c.1 absent) ; elle est revenue après un passage par le BIOS (redémarrage à chaud). À vérifier : un démarrage à froid. Si elle manque encore, deux parades : un redémarrage automatique unique quand le Wi-Fi manque, ou une carte Intel.
- L'écran de l'installateur clignote à chaque pourcentage, et l'effacement du disque reste figé environ une minute sans explication : à reprendre côté `charpentier-os`.
- Le disque portait un OpenCore (ancien macOS) qui démarrait à la place de la clé tant que le CSM était actif ; l'installation l'a effacé.

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

Premier essai le 15 novembre 2026 (Z Fold5, variante dev) : la configuration est passée, mais avec la PMF du point d'accès coupée à la main et une page qui expirait pendant qu'on allait chercher la clé du Compagnon. Les deux sont corrigés dans l'app (commits 570881a et f6153a6), pas encore installés sur le X250 : refaire cette partie avec l'app à jour avant de cocher.

## 5.4 · L'essentiel du système

- [x] La ligne système en haut : Wi-Fi, luminosité, volume, batterie, heure, sans rien de coupé.
- [x] Le Wi-Fi : la liste des réseaux, rejoindre, oublier un réseau.
- [x] Les touches de luminosité : la jauge bouge, le segment s'allume une seconde ; jamais d'écran noir.
- [x] Les touches de volume et de muet : même chose.
- [ ] La batterie : les deux batteries du X250 (interne et amovible) apparaissent, avec niveau et usure ; débrancher le chargeur affiche le temps restant.
- [ ] La mise en veille, le redémarrage et l'arrêt depuis le menu du système (⊞).
- [ ] « À propos » : X250, NixOS, disque chiffré : oui.
- [ ] Dans les réglages, cliquer dans le vide puis Échap : retour au texte (bug du 15 novembre, corrigé dans c70b019).
- [ ] Chaque panneau et chaque vue se ferme aussi à la souris, par sa croix (au survol, « Échap » sort à sa gauche) : réglages, moniteur, panneaux de la ligne système, Compagnon, manuscrit, ligne de commande, `Aa`.

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
- [x] Les sons de « Aa » (interface et frappe) s'entendent sur le haut-parleur du X250. Vérifié à l'oreille par l'auteur le 17 novembre 2026 avec l'app 43d2f0a, après correction : ils arrivaient au haut-parleur, mais bien trop bas (813690f, eebcdf6 : rien sous 300 Hz, +10 dB, puis +6 dB par un bus commun avec un limiteur).

## 5.12 · Les mises à jour (après la première release de l'app)

La v0.1.1 est publiée depuis le 15 novembre 2026 à 21:34 : c'est la release attendue ici. Le X250 doit être revenu à la version d'écriture (la version développement se met à jour depuis le Yoga L13, pas depuis le serveur).

- [ ] Après une release, le X250 (ailleurs qu'à la maison, par exemple sur le partage de connexion du téléphone) dit « mise à jour prête · ⊞R redémarrer » dans l'heure, et `maj x.y.z` reste dans la ligne.
- [ ] « À propos » : la version installée et sa date, la carte « Version x.y.z prête », Vérifier maintenant.
- [ ] ⊞R puis ⏎ ⏎ : l'écran du disque porte « mise à jour x.y.z », puis « à jour · x.y.z » ; le texte écrit juste avant est là, et sur le Mac.
- [ ] « Revenir à la version précédente » depuis « À propos » : redémarrage, « revenu à … · … mise de côté » ; puis repasser à la version mise de côté.

## 7.3 · Les réglages du système

- [x] ⊞, ouvre le tableau des Réglages du système, ⏎ sur Écran, l'échelle à 125 % : l'écran suit, Échap revient au tableau puis au texte. Fait le 18 novembre 2026 sur l'app 61e964a : `screenScale` enregistré à 125 à 08:54:32, eDP-1 à l'échelle 1.25 à 08:54:40 (surface 1536 × 864), la ligne affiche « 0.1.1 (61e964a) ».
- [x] Après un redémarrage, l'écran est toujours à 125 %. Vu par l'auteur le 18 novembre 2026. Le saut d'image au démarrage reste à traiter avec 5.21.

## 5.10 et 5.10 bis · Depuis le Yoga L13

- [x] Une mise à jour du X250 depuis le Yoga L13 (version développement), sans le toucher. Fait le 16 novembre 2026 (app a6b1421 puis c93bf0d, `switch` en 70 à 79 s), puis le 17 novembre (app 8df8efb en 57 s, puis 244f4ae en 59 s ; 4 essais sur 4 chaque fois).
- [x] Les essais automatiques passent sur le vrai X250, avec le compte rendu et les captures ; le temps de démarrage relevé. Le 16 novembre 2026 : 4 sur 4 (plein écran, ligne système, panneaux, Wi-Fi et Bluetooth) ; démarrage 1 min 03 dont 37 s pour l'écran du disque (saisie comprise), l'app seule en 3 s environ. Ils ont trouvé deux défauts de l'app (programmes de surveillance qui survivaient à l'app et gardaient son port d'essai, `swayidle` orphelins), corrigés dans c93bf0d et revérifiés sur le X250 ; et un du système (l'ancienne boucle de session survit à une mise à jour), à corriger dans `charpentier-os`.
- [ ] La version d'écriture réinstallée ensuite : plus aucun accès par le réseau (SSH refusé).

## Ce qu'on note pour la suite

- Ce qui a raté, et à quelle étape :
- Ce qui est lent ou gênant :
- L'écran du X250 : 1920 × 1080 (eDP-1, BOE 0x0691, relevé le 18 novembre 2026).
