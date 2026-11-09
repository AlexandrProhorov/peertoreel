# Node 24 + the system libraries Chrome Headless Shell needs, plus a pinned
# Remotion-managed browser at build time. Debian bookworm is the base used by
# the Debian packages below.
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/render-worker/package.json apps/render-worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/tiktok/package.json packages/tiktok/package.json

RUN pnpm install --frozen-lockfile --filter @peertoreel/render-worker... --filter @peertoreel/contracts

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/render-worker apps/render-worker

RUN pnpm --filter @peertoreel/contracts build \
  && pnpm --filter @peertoreel/render-worker build \
  && pnpm --filter @peertoreel/render-worker ensure-browser \
  && mkdir -p /app/apps/render-worker/out \
  && chown -R node:node /app

ENV HOME=/home/node
USER node

WORKDIR /app/apps/render-worker

CMD ["node", "dist/cli.js", "render-fixture"]
