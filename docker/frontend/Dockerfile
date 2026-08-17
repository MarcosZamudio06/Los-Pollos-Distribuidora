FROM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS build

ARG VITE_MAP_STYLE_URL
ARG REQUIRE_PUBLIC_MAP_STYLE=false
ARG OBJECT_STORAGE_PUBLIC_ORIGIN
ENV VITE_API_BASE_URL=/api
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
RUN node -e 'const origin = process.argv[1]; let url; try { url = new URL(origin); } catch {} if (!url || !["http:", "https:"].includes(url.protocol) || url.origin !== origin || origin.includes("*")) { console.error("OBJECT_STORAGE_PUBLIC_ORIGIN must be an explicit HTTP(S) origin without wildcards"); process.exit(1); }' "${OBJECT_STORAGE_PUBLIC_ORIGIN}"
RUN npm run build

FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752

ARG OBJECT_STORAGE_PUBLIC_ORIGIN

COPY --from=build /app/frontend/dist /usr/share/nginx/html
RUN sed -i 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
  && mkdir -p /var/cache/nginx/maps \
  && chown -R nginx:nginx /var/cache/nginx
RUN printf '%s\n' \
  'proxy_cache_path /var/cache/nginx/maps levels=1:2 keys_zone=maps_cache:10m max_size=256m inactive=1d use_temp_path=off;' \
  'map $uri $maps_browser_cache_control {' \
  '  default "public, max-age=3600";' \
  '  ~^/maps/styles/[^/]+/style\.json$ "no-store";' \
  '  ~^/maps/data/[^/]+\.json$ "no-store";' \
  '}' \
  'map $http_x_forwarded_proto $maps_forwarded_proto {' \
  '  default $http_x_forwarded_proto;' \
  '  "" $scheme;' \
  '}' \
  'server {' \
  '  listen 3000;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  access_log /dev/stdout;' \
  '  error_log /dev/stderr warn;' \
  '  client_max_body_size 1m;' \
  "  add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${OBJECT_STORAGE_PUBLIC_ORIGIN}; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';\" always;" \
  '  add_header X-Content-Type-Options nosniff always;' \
  '  add_header Referrer-Policy strict-origin-when-cross-origin always;' \
  '  location /maps/ {' \
  '    proxy_pass http://tileserver:8080/;' \
  '    proxy_http_version 1.1;' \
  '    proxy_set_header Host $http_host;'\
  '    proxy_set_header X-Forwarded-Host $http_host;' \
  '    proxy_set_header X-Forwarded-Proto $maps_forwarded_proto;' \
  '    proxy_set_header X-Forwarded-Prefix /maps;' \
  '    proxy_set_header X-Real-IP $remote_addr;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '    proxy_cache maps_cache;' \
  '    proxy_cache_key "$maps_forwarded_proto://$http_host$request_uri";' \
  '    proxy_cache_valid 200 1h;' \
  '    proxy_cache_valid 404 1m;' \
  '    add_header Cache-Control $maps_browser_cache_control always;' \
  '  }' \
  '  location /api/ {' \
  '    proxy_pass http://backend:4000/api/;' \
  '    proxy_http_version 1.1;' \
  '    proxy_set_header Host $host;' \
  '    proxy_set_header X-Real-IP $remote_addr;' \
  '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
  '    proxy_set_header X-Forwarded-Proto $maps_forwarded_proto;' \
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
  '    proxy_set_header X-Forwarded-Proto $maps_forwarded_proto;' \
  '    proxy_set_header Upgrade $http_upgrade;' \
  '    proxy_set_header Connection "upgrade";' \
  '    proxy_read_timeout 75s;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

USER nginx

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
