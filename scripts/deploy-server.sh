#!/bin/sh
# Deploys the sync server to a Docker host over SSH (docs/PLAN.md, phase 4.5):
# builds the bundle, copies the compose file and the image's context, then
# starts or updates the containers. The first time, writes the host's .env
# with a random Postgres password (it never leaves the host).
#
#   CHARPENTIER_HOST=charpentier.example.org BACKUP_ARCHIVE=/srv/backups/charpentier \
#   ADMIN_NETWORKS=192.168.1.0/24,100.64.0.0/10,fd7a:115c:a1e0::/48 \
#     scripts/deploy-server.sh <ssh host> <directory on the host>
#
# ADMIN_NETWORKS (who reaches /admin) has no default here, on purpose: the
# private ranges would include Docker's bridges, through which a direct IPv6
# connection arrives, so anyone would pass (infra/README.md, Administration).
# The home network and Tailscale are named, one by one.
set -eu
cd "$(dirname "$0")/.."
target=${1:?ssh host}
dir=${2:?directory on the host}

# Before building or copying anything: what the host's .env needs is there.
# shellcheck disable=SC2029
ssh "$target" sh -s -- "$dir" "${CHARPENTIER_HOST:-}" "${BACKUP_ARCHIVE:-}" "${ADMIN_NETWORKS:-}" <<'REMOTE'
set -eu
if [ ! -f "$1/.env" ]; then
  [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] || {
    echo "First deployment: set CHARPENTIER_HOST, BACKUP_ARCHIVE and ADMIN_NETWORKS" >&2
    echo "(ADMIN_NETWORKS: the networks that reach /admin, comma-separated CIDR, e.g." >&2
    echo "192.168.1.0/24,100.64.0.0/10,fd7a:115c:a1e0::/48; see infra/README.md)." >&2
    exit 1
  }
elif ! grep -q '^ADMIN_NETWORKS=.' "$1/.env"; then
  echo "$1/.env on the host has no ADMIN_NETWORKS, which the server needs since the" >&2
  echo "administration page: add the networks that reach /admin (infra/.env.example)." >&2
  exit 1
fi
REMOTE

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

ssh "$target" sh -s -- "$dir" "${CHARPENTIER_HOST:-}" "${BACKUP_ARCHIVE:-}" "${ADMIN_NETWORKS:-}" <<'REMOTE'
set -eu
cd "$1"
if [ ! -f .env ]; then
  # Checked above, before the build.
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
    echo "CHARPENTIER_HOST=$2"
    echo "BACKUP_ARCHIVE=$3"
    echo "ADMIN_NETWORKS=$4"
    echo "SERVER_CONTEXT=./server"
  } > .env
  mkdir -p "$3"
fi
# The secret that seals the keys the accounts provide (phase 4.8): drawn once, kept in
# this .env only (never in the base nor its backups). Lost, the keys must be pasted again.
if ! grep -q '^COMPAGNON_SECRET=.' .env; then
  echo "COMPAGNON_SECRET=$(openssl rand -hex 32)" >> .env
fi
docker compose up -d --build
docker compose ps
REMOTE
