FROM docker.io/library/node:24 as base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/clients/package.json packages/clients/
COPY packages/db/package.json packages/db/
COPY apps/pipeline/package.json apps/pipeline/
COPY apps/server/package.json apps/server/

FROM base AS development
RUN corepack enable && pnpm install
COPY . .
CMD ["pnpm", "start"]
