# Hosting Relay on one server

Runs the storage server, three `PROJECT_BASELINE` relayers, the Memory Steward and the web client behind Caddy with automatic HTTPS. Everything is in `deploy/`.

> **Status:** the images and compose file are validated (hadolint, `docker compose config`, `caddy validate`, a clean lockfile install and web build, and `pnpm smoke:services`, which runs every service with its container command and environment). The images have **not** been built with Docker on the build machine, because Docker isn't installed there. The first `docker compose up --build` on the server is the first real image build.

## What you need

- A Linux server with Docker Engine and the Compose plugin; ports 80 and 443 open. 1 vCPU / 2 GB RAM is plenty for testnet.
- Three DNS names pointing at the server, for example `relay.example.com`, `storage.relay.example.com`, `steward.relay.example.com`.
- From the build machine (these never go in git): `.relay-testnet/relayers/identities.json` (relayer keys) and `.relay-testnet/storage/` (ciphertext and public keys of the existing testnet capsules).

## 1. On the build machine: split the relayer keys

```bash
pnpm exec tsx apps/relayer/src/relayer.ts split --dir .relay-testnet/relayers --out deploy/secrets
```

This writes one key file per relayer (`relayer-1.json` …), so each container mounts only its own key.

## 2. Copy to the server

```bash
git clone https://github.com/Dotman-Bei/relay.git && cd relay        # on the server
scp -r deploy/secrets  server:relay/deploy/secrets                    # from the build machine
scp -r .relay-testnet/storage server:relay/deploy/seed-storage        # existing testnet data
```

## 3. Configure and start

```bash
cd relay/deploy
cp .env.example .env && nano .env        # domains, ACME email, optional ANTHROPIC_API_KEY
sudo ./setup.sh seed-storage             # data dirs owned by uid 1000, secrets locked to 0400
docker compose up -d --build
docker compose ps                        # storage and steward should turn healthy
docker compose logs -f relayer-1         # "PROJECT_BASELINE relayer relayer-1 0xE0CF…"
```

Caddy obtains certificates on first request. Check `https://storage.<domain>/health` and `https://steward.<domain>/health`.

## 4. Point the deployment record at the public endpoints

The storage and steward URLs are off-chain, so this needs no redeploy. On the build machine:

```bash
pnpm endpoints:set --network testnet --storage https://storage.relay.example.com --steward https://steward.relay.example.com
git commit -am "Point testnet deployment at hosted storage and steward" && git push
```

Then on the server:

```bash
git pull && docker compose restart relayer-1 relayer-2 relayer-3 steward web
```

The web container mounts `deployments/testnet.json` over its runtime copy, so no rebuild is needed. Record the change in DECISIONS.md and WHAT_IS_REAL.md.

## Operating it

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Relayer activity | `docker compose logs --since 1h relayer-1 relayer-2 relayer-3` |
| Release latency | `pnpm metrics --deployment deployments/testnet.json` (from any machine) |
| Verify every capsule | `pnpm verify:testnet` (from any machine; needs no access to this server) |
| Update | `git pull && docker compose up -d --build` |
| Stop | `docker compose down` (data stays in `deploy/data/`) |

**Backups.** `deploy/data/storage` holds every capsule's ciphertext and every member's public key. Losing it means sealed capsules can never be opened. Back it up daily. It is content-addressed, so `rsync --ignore-existing` to another host is a correct incremental backup, and any copy can be checked by hashing each file against its name. `deploy/secrets/` holds the relayer keys: keep an offline copy. Losing them loses those relayers' shares; see docs/runbooks/relayer.md.

**Security.** Only Caddy publishes ports. Storage, the steward and the relayers are reachable only on the compose network, and Caddy exposes storage and the steward on their domains. All three relayers run on one host under one operator, which is exactly why they're labelled `PROJECT_BASELINE`. Moving one relayer to a different operator and host is the first step toward an independent quorum.

## Web client elsewhere (optional)

To host the web app on Vercel instead, set the root directory to `apps/web`, install with pnpm, and set `NEXT_PUBLIC_RELAY_NETWORK=testnet`. Drop the `web` service and its Caddy block from the server. The prebuild step copies `deployments/testnet.json` into the build, so redeploy the web app after `endpoints:set`.
