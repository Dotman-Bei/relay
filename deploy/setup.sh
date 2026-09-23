#!/usr/bin/env bash
# Prepare deploy/ on the server before `docker compose up`.
#   ./setup.sh [existing-storage-dir]
# Checks the relayer secrets and .env exist, creates data directories owned by the containers'
# user (uid 1000), locks down the secret files, and optionally seeds storage from an existing store
# (for example the build machine's .relay-testnet/storage, which holds testnet capsules' ciphertext).
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker is not installed on this host."; exit 1; }
docker compose version >/dev/null || { echo "The Docker Compose plugin is not installed."; exit 1; }
[ -f .env ] || { echo "Missing deploy/.env — copy .env.example and fill it in."; exit 1; }
for n in 1 2 3; do
  [ -f "secrets/relayer-$n.json" ] || { echo "Missing secrets/relayer-$n.json — create them on the machine holding the relayer identities with: pnpm exec tsx apps/relayer/src/relayer.ts split --dir .relay-testnet/relayers --out deploy/secrets"; exit 1; }
done

mkdir -p data/storage data/relayer-1 data/relayer-2 data/relayer-3 data/steward
if [ "${1:-}" != "" ]; then
  [ -d "$1/blobs" ] || { echo "$1 has no blobs/ directory"; exit 1; }
  cp -an "$1/." data/storage/
  echo "Seeded storage from $1 ($(ls data/storage/blobs | wc -l) blobs)."
fi

# Containers run as uid 1000 (the node user). Secrets: readable by that user only.
chown -R 1000:1000 data secrets
chmod 700 secrets
chmod 400 secrets/*.json

echo "Ready. Next: docker compose up -d --build   (then: docker compose ps)"
