FROM node:24.14.1-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN corepack enable \
  && corepack pnpm install --filter backend... --frozen-lockfile --prefer-offline

WORKDIR /app/backend

COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
COPY shared ../shared

RUN corepack pnpm exec prisma generate --schema prisma/schema.prisma
RUN corepack pnpm run build

ENV NODE_ENV=production

CMD ["corepack", "pnpm", "run", "start:prod"]
