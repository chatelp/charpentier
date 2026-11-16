# The sync server, bundled into one file by `pnpm --filter @charpentier/server build`
# (run from the repository root before `docker compose build`, see infra/README.md).
FROM node:24-alpine
WORKDIR /app
COPY dist/main.js ./main.js
# The administration page's style (docs/DESIGN.md §4.13).
COPY dist/admin/ ./admin/
# The app for the browser (phase 4.7 a), served on the public address.
COPY dist/web/ ./web/
ENV NODE_ENV=production PORT=8080 CACHE_DIR=/data/nix-cache
# The X250's binary cache (D-31): a volume, owned by the server's user.
RUN mkdir -p /data/nix-cache && chown node:node /data/nix-cache
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["node", "main.js"]
