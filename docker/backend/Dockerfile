FROM node:24.14.1-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/nest-cli.json backend/tsconfig*.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src

RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi
RUN npm run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start:prod"]
