FROM node:24.14.1-alpine AS build

ARG VITE_API_URL=/api
ARG VITE_MAP_STYLE_URL
ARG REQUIRE_PUBLIC_MAP_STYLE=false
ENV VITE_API_BASE_URL=${VITE_API_URL}
ENV VITE_MAP_STYLE_URL=${VITE_MAP_STYLE_URL}

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm cache clean --force \
  && npm ci --prefer-online --no-audit --no-fund --cache /tmp/npm-cache
COPY frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
COPY shared /app/shared

RUN if [ "${REQUIRE_PUBLIC_MAP_STYLE}" = "true" ] && [ -z "${VITE_MAP_STYLE_URL}" ]; then \
      echo "VITE_MAP_STYLE_URL is required for production frontend images" >&2; \
      exit 1; \
    fi
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
RUN printf '%s\n' \
  'proxy_cache_path /var/cache/nginx/maps levels=1:2 keys_zone=maps_cache:10m max_size=256m inactive=1d use_temp_path=off;' \
  'server {' \
  '  listen 3000;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  client_max_body_size 1m;' \
  '  add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data: blob:; font-src '\''self'\'' data:; connect-src '\''self'\''; worker-src '\''self'\'' blob:; object-src '\''none'\''; base-uri '\''self'\''; frame-ancestors '\''none'\'';" always;' \
  '  add_header X-Content-Type-Options nosniff always;' \
  '  add_header Referrer-Policy strict-origin-when-cross-origin always;' \
  '  location /maps/ {' \
  '    proxy_pass http://tileserver:8080/;' \
  '    proxy_http_version 1.1;' \
  '    proxy_set_header Host frontend;' \
  '    proxy_set_header X-Real-IP $remote_addr;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '    proxy_set_header X-Forwarded-Proto $scheme;' \
  '    proxy_set_header X-Forwarded-Prefix /maps;' \
  '    proxy_cache maps_cache;' \
  '    proxy_cache_valid 200 1h;' \
  '    proxy_cache_valid 404 1m;' \
  '    add_header Cache-Control "public, max-age=3600" always;' \
  '  }' \
  '  location /api/ {' \
  '    proxy_pass http://backend:4000/api/;' \
  '    proxy_http_version 1.1;' \
  '    proxy_set_header Host $host;' \
  '    proxy_set_header X-Real-IP $remote_addr;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '    proxy_set_header X-Forwarded-Proto $scheme;' \
  '    proxy_set_header X-Request-ID $request_id;' \
  '    proxy_set_header Upgrade $http_upgrade;' \
  '    proxy_set_header Connection "upgrade";' \
  '  }' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '  location /api/socket.io {' \
  '    proxy_pass http://backend:4000/api/socket.io;' \
  '    proxy_http_version 1.1;' \
  '    proxy_set_header Host $host;' \
  '    proxy_set_header X-Real-IP $remote_addr;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '    proxy_set_header X-Forwarded-Proto $scheme;' \
  '    proxy_set_header Upgrade $http_upgrade;' \
  '    proxy_set_header Connection "upgrade";' \
  '    proxy_read_timeout 75s;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
