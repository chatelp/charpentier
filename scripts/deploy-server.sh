#!/bin/sh
# Deploys the sync server to a Docker host over SSH (docs/PLAN.md, phase 4.5):
# builds the bundle, copies the compose file and the image's context, then
# starts or updates the containers. The first time, writes the host's .env
# with a random Postgres password (it never leaves the host).
#
#   CHARPENTIER_HOST=charpentier.example.org BACKUP_ARCHIVE=/srv/backups/charpentier \
#     scripts/deploy-server.sh <ssh host> <directory on the host>
set -eu
cd "$(dirname "$0")/.."
target=${1:?ssh host}
dir=${2:?directory on the host}

# The app for the browser first (phase 4.7 a): the server's build copies it.
pnpm --filter @charpentier/web build >/dev/null
pnpm --filter @charpentier/server build >/dev/null
ssh "$target" "mkdir -p '$dir/server/dist'"
scp -q infra/docker-compose.yml "$target:$dir/docker-compose.yml"
scp -q apps/server/Dockerfile "$target:$dir/server/Dockerfile"
scp -q apps/server/dist/main.js "$target:$dir/server/dist/main.js"
# The administration page's style and font (phase 4.6).
scp -q -r apps/server/dist/admin "$target:$dir/server/dist/"
ssh "$target" "rm -rf '$dir/server/dist/web'"
scp -q -r apps/server/dist/web "$target:$dir/server/dist/"

ssh "$target" sh -s -- "$dir" "${CHARPENTIER_HOST:-}" "${BACKUP_ARCHIVE:-}" <<'REMOTE'
set -eu
cd "$1"
if [ ! -f .env ]; then
  [ -n "$2" ] && [ -n "$3" ] || { echo "First deployment: set CHARPENTIER_HOST and BACKUP_ARCHIVE." >&2; exit 1; }
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
    echo "CHARPENTIER_HOST=$2"
    echo "BACKUP_ARCHIVE=$3"
    echo "SERVER_CONTEXT=./server"
  } > .env
  mkdir -p "$3"
fi
docker compose up -d --build
docker compose ps
REMOTE
