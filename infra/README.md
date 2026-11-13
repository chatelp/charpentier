# Serveur de synchro Charpentier

Hocuspocus et Postgres en Docker (docs/SPEC.md, D-22). Le guide complet de déploiement sur `prodesk2021.local` derrière le reverse proxy en HTTPS viendra avec la phase 4.5.

En bref, depuis la racine du dépôt :

```bash
pnpm install
pnpm --filter @charpentier/server build
cp infra/.env.example infra/.env   # puis choisir un mot de passe Postgres
docker compose -f infra/docker-compose.yml up -d --build
```

Le serveur écoute sur le port `CHARPENTIER_PORT` (8080 par défaut) ; le reverse proxy doit transmettre les WebSocket (`Upgrade`).

## Comptes (D-21)

L'inscription est fermée : le premier compte se crée sur le serveur, le mot de passe est saisi sans écho (12 caractères au moins).

```bash
docker compose -f infra/docker-compose.yml exec server node main.js create-user adresse@exemple.fr
```

Mot de passe oublié : `node main.js reset-password adresse@exemple.fr` (tous les appareils sont alors déconnectés).

L'API du serveur, à côté de la synchro : `POST /api/login`, `POST /api/logout`, `GET /api/devices`, `DELETE /api/devices/<id>`, `GET /api/health`.
