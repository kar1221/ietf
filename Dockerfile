FROM node:24
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS development
RUN corepack enable && pnpm install
COPY . .
CMD ["tsx", "src/index.ts"]
