FROM node:24.14.1-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci --no-audit --no-fund
COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src

RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi
RUN npm run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start:prod"]
