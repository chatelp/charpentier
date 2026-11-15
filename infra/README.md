# Serveur de synchro Charpentier

Hocuspocus et Postgres en Docker (docs/SPEC.md, D-21 et D-22), derrière le Traefik de la machine hôte, avec une sauvegarde nocturne de la base. En service sur `prodesk2021.local`, à l'adresse publique `https://charpentier.chatel.pm`.

## Déployer ou mettre à jour

Depuis la racine du dépôt, sur le Mac :

```bash
CHARPENTIER_HOST=charpentier.chatel.pm BACKUP_ARCHIVE=/mnt/WD1000/Backups/Docker_volumes/charpentier \
  scripts/deploy-server.sh prodesk2021.local /home/pierre/Docker/charpentier
```

Le script construit le serveur (`pnpm --filter @charpentier/server build`), copie `docker-compose.yml`, le `Dockerfile` et le serveur dans `/home/pierre/Docker/charpentier`, puis lance `docker compose up -d --build`. Au premier déploiement, il écrit le `.env` de la machine (mot de passe Postgres tiré au hasard, qui ne quitte pas la machine) ; ensuite, il ne le touche plus et les deux variables ne sont plus nécessaires.

Ce que fait le `docker-compose.yml` :

- `server` : le serveur de synchro sur le port 8080, exposé seulement par Traefik (réseau `proxy`, point d'entrée `websecure`, certificat `cloudflare`), WebSocket compris ;
- `db` : Postgres 17, volume `charpentier_db`, sans port publié ;
- `backup` : une archive du volume chaque nuit à 3 h 30 dans `BACKUP_ARCHIVE`, gardée 30 jours ; Postgres est arrêté le temps de la copie.

Vérifier : `curl https://charpentier.chatel.pm/api/health` répond `{"ok":true}`. Un nouveau nom met environ une minute à obtenir son certificat (Cloudflare répond 526 en attendant).

## Comptes (D-21)

L'inscription est fermée : un compte se crée sur la machine, le mot de passe est saisi sans écho (12 caractères au moins).

```bash
ssh -t prodesk2021.local 'cd ~/Docker/charpentier && docker compose exec server node main.js create-user adresse@exemple.fr'
```

Mot de passe oublié : la même commande avec `reset-password` à la place de `create-user` (tous les appareils sont alors déconnectés). `create-user --admin` crée un administrateur ; le premier compte l'est toujours. La page `/admin` fait aussi tout cela (ci-dessous).

Dans l'app : ligne de commande (⌘K), « Se connecter à un serveur de synchro… », adresse `https://charpentier.chatel.pm`, puis l'e-mail et le mot de passe.

## Administration (phase 4.6, `/admin`)

Une page du serveur (docs/DESIGN.md §4.13) : comptes (créer, réinitialiser le mot de passe, désactiver, rôle d'administrateur), appareils (révoquer : la synchro de l'appareil s'arrête aussitôt), projets (export en Markdown, une archive `.zip`), sauvegardes (alerte au-delà de 48 h), journal. Réservée aux administrateurs : le premier compte l'est, les autres le deviennent par la page ou par `create-user --admin`. Le mot de passe d'un compte créé ou réinitialisé par la page est tiré au hasard et affiché une seule fois.

- **Qui l'atteint** : seulement le réseau de la maison et Tailscale. Le serveur prend pour client la dernière adresse de `X-Forwarded-For` (celle que Traefik ajoute) et répond 404 à toute autre ; réglage `ADMIN_NETWORKS` (CIDR séparés par des virgules ; par défaut les réseaux privés, `100.64.0.0/10` et `fd7a:115c:a1e0::/48`). Par Cloudflare, la dernière adresse est celle de Cloudflare : `/admin` n'existe pas depuis Internet.
- **Comment l'atteindre depuis la maison** : *à décider*. Le cookie de la page exige HTTPS (`__Host-`, `Secure`) ; il faut donc une adresse HTTPS qui ne passe pas par Cloudflare : `charpentier.chatel.pm` résolu vers le prodesk par le DNS de la maison, ou Tailscale Serve, ou un routeur Traefik à part. Rien n'est déployé tant que ce n'est pas choisi.
- **Sauvegardes** : le dossier `BACKUP_ARCHIVE` est monté en lecture seule dans le serveur (`BACKUP_DIR=/backups`) ; la page ne restaure jamais (voir plus bas).
- **Heures** : `ADMIN_TIMEZONE` (par défaut `Europe/Paris`).

## API

À côté de la synchro (WebSocket à la racine) : `POST /api/login`, `POST /api/logout`, `GET /api/devices`, `DELETE /api/devices/<id>`, `GET /api/health`.

## Versions du X250 (D-31, phase 5.11)

Le serveur garde aussi le cache binaire Nix des versions du X250 et le pointeur « dernière version » :

- `https://charpentier.chatel.pm/nix-cache/` : cache HTTP de Nix, fichiers dans le volume `charpentier_cache` (non sauvegardé : la CI le reconstruit). Lecture (GET, HEAD) par la CI ou un appareil du compte, écriture (PUT) par la CI seulement. Le jeton s'envoie en mot de passe HTTP Basic (login libre, ce que fait Nix avec un fichier netrc) ou en Bearer.
- `GET /api/updates/latest` (appareil ou CI) et `PUT /api/updates/latest` (CI) : `{ version, notes, systems: { azerty, qwerty }, publishedAt }`. Le serveur refuse une version dont un système n'est pas déjà dans le cache.

- `PUT /api/installer/<version>` (CI) : l'image de la clé d'installation de la version publiée (pas d'autre) ; `GET /api/installer/latest` (`{ version, size, sha256, publishedAt }`) et `GET /api/installer/<version>.iso` (reprise par `Range`), pour la CI ou un appareil. Les deux dernières images sont gardées, dans le même volume.
- **Envoi en morceaux** : Cloudflare refuse tout corps de requête de plus de 100 Mo (vérifié : 413). Un fichier plus gros s'envoie en morceaux de 95 Mo au plus, sur le même chemin, avec `X-Part: <n>/<total>` et `X-Checksum-SHA256` du fichier entier ; le serveur répond 202 jusqu'au dernier morceau, assemble, vérifie la somme (409 si elle est fausse) et range le fichier (201). Un morceau peut être renvoyé ; des morceaux orphelins sont effacés au bout d'un jour.

Le jeton de la CI se crée sur la machine et ne s'affiche qu'une fois ; il va dans les secrets GitHub de `chatelp/charpentier-os` (`CHARPENTIER_CACHE_TOKEN`). Recréer un jeton du même nom révoque l'ancien.

```bash
ssh -t prodesk2021.local 'cd ~/Docker/charpentier && docker compose exec server node main.js create-ci-token github-actions'
ssh -t prodesk2021.local 'cd ~/Docker/charpentier && docker compose exec server node main.js revoke-ci-token github-actions'
```

Avec des morceaux de 95 Mo au plus, ni Cloudflare ni le délai de Traefik (60 s par défaut en v3) ne devraient couper un envoi. Le nettoyage des anciennes versions n'est pas encore fait : surveiller la place du volume.

## Installer le X250 par le réseau (phase 5.9 ter, D-32)

Pixiecore (Apache 2.0) répond aux machines qui démarrent sur le réseau de la maison et demande au serveur quoi leur donner : seul le X250, reconnu à l'adresse MAC de sa carte Ethernet, reçoit l'installateur (le noyau et l'initrd de la version publiée, déposés par la CI sous `/api/netboot/<version>/`). Le serveur ne répond à Pixiecore que par 127.0.0.1:8081, avec un secret, et jamais à une requête venue par Traefik. Le service est **éteint par défaut**.

Une fois, dans le `.env` de la machine : `NETBOOT_SECRET` (au hasard, `openssl rand -hex 24`) et `NETBOOT_MACS` (l'adresse MAC Ethernet du X250, plusieurs séparées par des virgules), puis redéployer le serveur.

Pour une installation (X250 branché par câble, F12 puis la carte réseau ; BIOS : « UEFI IPv4 Network Stack » activé, Secure Boot désactivé) :

```bash
ssh prodesk2021.local 'cd ~/Docker/charpentier && docker compose --profile netboot up -d pixiecore'
ssh prodesk2021.local 'cd ~/Docker/charpentier && docker compose stop pixiecore'
```

Vérifié le 14 novembre 2026 sur le prodesk2021 : les ports UDP 67, 69 et 4011 et le port TCP 8082 sont libres ; le DHCP du Pi-hole est éteint, et son conteneur ne publie pas le port 67. Le Pi-hole tient `192.168.1.2:8081` ; le serveur prend `127.0.0.1:8081`, une autre adresse, sans conflit. L'image de Pixiecore n'a qu'une étiquette, `master` (2020), figée par son empreinte dans `docker-compose.yml`.

**Pare-feu** : ufw est actif sur la machine. Pixiecore étant sur le réseau de l'hôte, ufw s'applique à lui (contrairement aux ports publiés par Docker). Avant la première installation, regarder `sudo ufw status verbose` ; s'il ne laisse pas passer le démarrage réseau depuis la carte du réseau de la maison (`br0`), l'ouvrir sur cette carte seulement (le premier message DHCP du X250 part de 0.0.0.0, une règle « depuis 192.168.1.0/24 » ne le laisserait pas passer) :

```bash
ssh -t prodesk2021.local 'sudo ufw allow in on br0 to any port 67,69,4011 proto udp && sudo ufw allow in on br0 to any port 8082 proto tcp'
```

## Restaurer une sauvegarde

Une archive contient le volume sous `/backup/db` (vérifié le 13 novembre 2026 ; la restauration elle-même n'a pas encore été essayée).

```bash
ssh prodesk2021.local
cd ~/Docker/charpentier && docker compose stop server db
docker run --rm -v charpentier_db:/data -v /mnt/WD1000/Backups/Docker_volumes/charpentier:/archive alpine \
  sh -c 'rm -rf /data/* && tar -xzf /archive/<fichier>.tar.gz -C /data --strip-components=2'
docker compose start db server
```
