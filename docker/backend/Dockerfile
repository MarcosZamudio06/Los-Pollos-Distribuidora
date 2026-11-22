FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS node-toolchain

# npm bundles its tool dependencies. Pin and verify the whole artifact, then
# install offline without lifecycle scripts; application dependencies stay locked.
ADD --checksum=sha256:dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b https://registry.npmjs.org/npm/-/npm-11.21.1.tgz /tmp/npm-cli.tgz
# Compatible dependency-free patch for npm's bundled node-gyp (^6.25.0).
ADD --checksum=sha256:29c4b8e0b2d86cb8795571c1959012ce057a14ecfd34858335f47c31e770a04f https://registry.npmjs.org/undici/-/undici-6.29.1.tgz /tmp/npm-undici.tgz
RUN --network=none npm install --global --offline --ignore-scripts --no-audit --no-fund /tmp/npm-cli.tgz \
  && rm /tmp/npm-cli.tgz \
  && rm -rf /usr/local/lib/node_modules/npm/node_modules/undici \
  && mkdir /usr/local/lib/node_modules/npm/node_modules/undici \
  && tar -xzf /tmp/npm-undici.tgz -C /usr/local/lib/node_modules/npm/node_modules/undici --strip-components=1 \
  && rm /tmp/npm-undici.tgz \
  && test "$(npm --version)" = "11.21.1"

FROM node-toolchain AS deps

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

# Migrations/bootstrap share the runtime image. Their pinned CLIs are explicit
# production dependencies in the SAME lockfile; no unlocked post-prune overlay.
RUN npm prune --omit=dev

FROM node-toolchain AS runtime

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
