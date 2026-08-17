FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS deps

WORKDIR /app/backend

COPY backend/package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm ci --no-audit --no-fund

FROM deps AS build

COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
COPY shared ../shared

RUN npx prisma generate
RUN npm run build

# Prisma migrations and the production bootstrap are one-shot operations that
# intentionally share this image with the runtime. Keep only their operational
# CLIs after the application build; test/lint/tooling dependencies are pruned.
RUN npm prune --omit=dev \
  && mkdir -p /tmp/production-tools \
  && npm install --prefix /tmp/production-tools --omit=dev --no-save --package-lock=false \
    prisma@6.19.3 ts-node@10.9.2 typescript@5.7.3 \
  && cp -a /tmp/production-tools/node_modules/. ./node_modules/ \
  && rm -rf /tmp/production-tools

FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS runtime

WORKDIR /app/backend

ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/backend/package*.json ./
COPY --from=build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --from=build --chown=node:node /app/backend/prisma ./prisma
COPY --from=build --chown=node:node /app/backend/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node \
  /app/backend/src/common/authorization/permissions.ts \
  ./src/common/authorization/permissions.ts

USER node

CMD ["npm", "run", "start:prod"]
