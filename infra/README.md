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
