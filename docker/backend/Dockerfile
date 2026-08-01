FROM node:24.14.1-alpine

WORKDIR /app/backend

COPY backend/package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm ci --no-audit --no-fund

COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
COPY shared ../shared

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start:prod"]
