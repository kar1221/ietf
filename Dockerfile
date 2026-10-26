FROM docker.io/library/node:24 as base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS development
RUN corepack enable && pnpm install
COPY . .
CMD ["pnpm", "start"]
