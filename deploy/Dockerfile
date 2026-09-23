# syntax=docker/dockerfile:1.7
# Relay images. Build context: the repository root (see .dockerignore).
#   services — storage server, release relayer, Memory Steward (one image, different commands)
#   web      — the Next.js client, built for NEXT_PUBLIC_RELAY_NETWORK (default: testnet)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Install from the lockfile only, then from the full workspace, so dependency layers cache well.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline

FROM deps AS services
USER 1000:1000
EXPOSE 8697 8688
CMD ["./node_modules/.bin/tsx", "apps/relayer/src/storage-server.ts"]

FROM deps AS web
ARG RELAY_NETWORK=testnet
ENV NEXT_PUBLIC_RELAY_NETWORK=${RELAY_NETWORK}
RUN pnpm --filter @relay/web build && chown -R node:node /app/apps/web/.next
USER 1000:1000
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
