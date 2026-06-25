FROM node:24.14.1-alpine AS build

ARG VITE_API_URL=http://localhost:4000/api
ENV VITE_API_BASE_URL=${VITE_API_URL}

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
RUN printf '%s\n' \
  'server {' \
  '  listen 3000;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
