# Contrat des mises à jour du X250 (phase 5.12)

Entre le service de mise à jour du système (`charpentier-os`, sous root) et l'app (service `System`, `packages/platform-desktop/src/main/system/linux-system.ts`, sous l'utilisateur `auteur`). Le README de `charpentier-os` reprend ce texte ; toute modification se fait des deux côtés. Apparence : DESIGN §4.12 « Mises à jour ». Décisions : D-28, D-31.

## Le partage

- **Le service** vérifie, télécharge, vérifie la signature, installe la version comme génération du prochain démarrage, et écrit son état dans un fichier. Il ne parle jamais à l'auteur et ne redémarre jamais l'appareil.
- **L'app** lit ce fichier, l'annonce (segment `maj`, panneau `⊞R`, « À propos »), et demande au service seulement les trois gestes ci-dessous. Elle choisit le moment du redémarrage : après l'enregistrement et la synchronisation (10 s au plus).

## Le fichier d'état : `/run/charpentier/update.json`

Écrit par le service à chaque changement, de façon atomique (fichier temporaire dans le même dossier, puis `rename`), lisible par `auteur` (0644, dossier 0755). Réécrit au démarrage du service (`/run` est vidé à chaque démarrage). Absent : l'app ne montre rien des mises à jour.

```json
{
  "contract": 1,
  "installed": {
    "version": "0.6.0",
    "generation": 43,
    "installedAt": "2026-11-20T14:40:00Z",
    "notes": ["L’entretien avec le Compagnon, en tête de l’Atelier (⌘0)."],
    "dataFormat": 1
  },
  "ready": null,
  "previous": { "version": "0.5.0", "generation": 42, "dataFormat": 1 },
  "setAside": null,
  "lastCheck": "2026-11-20T14:41:00Z",
  "checking": false,
  "failure": null,
  "development": false
}
```

- `contract` : 1. Un autre nombre : l'app ne lit pas le fichier et ne montre rien.
- `installed` : la version qui tourne (celle du système, `X.Y.Z` ou `X.Y.Z-N`, D-31), sa génération NixOS, quand elle a été installée (premier démarrage sur elle), ses notes de version (lignes, telles que publiées dans `/api/updates/latest`), son `dataFormat`.
- `ready` : une version téléchargée, signature vérifiée, installée comme génération par défaut du prochain démarrage, ou `null`. Champs : `version`, `generation`, `publishedAt` (date du pointeur), `receivedAt`, `notes`.
- `previous` : la génération sur laquelle on peut revenir (celle d'avant `installed`, encore au menu de démarrage), ou `null`. Champs : `version`, `generation`, `dataFormat`.
- `setAside` : une version plus récente que `installed`, quittée par « Revenir à la version précédente » : on peut y repasser, et elle n'est plus annoncée comme prête. `null` sinon. Champs comme `previous`. Une version publiée plus récente qu'elle redevient `ready` normalement.
- `lastCheck` : la dernière vérification terminée (réussie ou non), ou `null`.
- `checking` : `true` pendant une vérification ou un téléchargement.
- `failure` : le dernier échec, ou `null` (remis à `null` quand une version arrive bien). Champs : `version`, `at`, `reason` parmi `signature` (signature invalide), `unreadable` (version illisible : pointeur, chemin ou closure incohérents), `disk-full`, `interrupted` (téléchargement interrompu, repris à la vérification suivante).
- `development` : `true` sur la version développement de 5.10 bis ; le service n'y installe jamais rien, l'app ne montre rien.
- `dataFormat` : le format des projets que cette version sait lire, lu dans le paquet de l'app de la génération (`<app>/share/charpentier/data-format`, un entier ; absent = 1). Il vient de `apps/desktop/resources/data-format`, à augmenter quand une version enregistre les projets d'une façon que les précédentes ne savent plus relire. L'app ne propose pas de revenir à une version dont le `dataFormat` est inférieur à celui de la version installée (bouton grisé, aide qui dit pourquoi).

## Les gestes de l'app

Permis à `auteur` sans mot de passe par une règle polkit limitée à ces unités (`org.freedesktop.systemd1.manage-units`, verbe `start`) :

1. **Vérifier maintenant** : `systemctl start --no-block charpentier-update-check.service`. Le même service que le minuteur horaire (toutes les heures, réseau présent) ; s'il tourne déjà, rien de plus.
2. **Revenir à la version précédente / repasser à la version mise de côté** : `systemctl start charpentier-update-boot@<génération>.service`, la génération étant celle de `previous` ou de `setAside`. Le service fait de cette génération celle du prochain démarrage, met l'autre dans `setAside` (ou la retire de `setAside` si on y repasse), réécrit le fichier, et se termine avec le code 0 ; toute autre génération : code non nul, rien ne change. Puis l'app redémarre.
3. **Redémarrer** : `systemctl reboot`, déjà permis par logind.

Rien d'autre : l'app n'écrit jamais dans `/run/charpentier`, ne lance ni `nix` ni `nixos-rebuild`.

## Ce que l'app en fait

- `ready` apparaît : message « mise à jour prête · ⊞R redémarrer », segment `maj 0.6.0` jusqu'au redémarrage.
- `failure` nouveau (version, raison et date différentes du précédent) : « mise à jour écartée · signature invalide » (« … · disque plein », « … · version illisible ») ; `interrupted` va seulement au journal (« 0.6.0 : téléchargement interrompu »).
- Au démarrage, l'app compare `installed.version` à la dernière qu'elle a vue (gardée dans son `system.json`) : nouvelle et égale à l'ancien `ready` → « redémarrage pour la mise à jour » puis « à jour · 0.6.0 » ; l'ancienne version dans `setAside` → « revenu à 0.5.0 · 0.6.0 mise de côté ».
- « À propos » : version installée et date, carte « Version 0.6.0 prête » ou « Nouveautés de 0.6.0 », vérification (dernière heure, Vérifier maintenant, l'échec en clair), revenir ou repasser.

## L'écran du mot de passe du disque

Quand le démarrage se fait sur une génération qui n'a encore jamais démarré (l'ancien `ready`), l'écran Plymouth porte la ligne « mise à jour 0.6.0 » au-dessus du champ (DESIGN §4.12). Le disque n'étant pas encore ouvert, l'information doit venir de la génération elle-même (par exemple un paramètre du noyau de son entrée de démarrage, passé à Plymouth par `plymouth update --status=…` dans l'initrd) : le moyen est laissé à `charpentier-os`. Rien d'autre sur cet écran : ni barre de progression, ni pourcentage.
