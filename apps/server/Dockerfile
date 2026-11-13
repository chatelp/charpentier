# The sync server, bundled into one file by `pnpm --filter @charpentier/server build`
# (run from the repository root before `docker compose build`, see infra/README.md).
FROM node:22-alpine
WORKDIR /app
COPY dist/main.js ./main.js
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
CMD ["node", "main.js"]
