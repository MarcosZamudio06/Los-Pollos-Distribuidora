import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const caddyfilePath = resolve(__dirname, '../../../Caddyfile.production');
const frontendDockerfilePath = resolve(
  __dirname,
  '../../../docker/frontend/Dockerfile',
);

describe('production Caddy contract', () => {
  it('exposes only the ERP and Object Storage loopback upstreams', () => {
    const caddyfile = readFileSync(caddyfilePath, 'utf8');
    const activeConfig = caddyfile.replace(/^\s*#.*$/gm, '');

    expect(caddyfile).toContain('https://erp.example.com {');
    expect(caddyfile).toContain('https://objects.example.com {');
    expect(caddyfile.match(/^[\t ]*reverse_proxy /gm)).toHaveLength(2);
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:3000 {');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:8333 {');
    expect(caddyfile).toContain('header_up Host {http.request.host}');
    expect(caddyfile).toContain('X-Forwarded-Proto');
    expect(caddyfile).toContain('X-Forwarded-For');
    expect(caddyfile).toContain('trusted_proxies static');
    expect(caddyfile).toContain('trusted_proxies_strict');
    expect(caddyfile).toContain('Cache-Control "private, no-store, max-age=0"');

    for (const forbiddenUpstream of [
      'backend:4000',
      'postgres:5432',
      'photon:2322',
      'osrm:5000',
      'vroom:3000',
      'tileserver:8080',
    ]) {
      expect(caddyfile).not.toContain(forbiddenUpstream);
    }

    expect(activeConfig).not.toMatch(/^\s*(?:rewrite|uri|handle_path)\b/m);
  });

  it('replaces the upstream CSP with the tenant Object Storage host only', () => {
    const caddyfile = readFileSync(caddyfilePath, 'utf8');
    const cspHeaders = caddyfile.match(/Content-Security-Policy/g) ?? [];
    const emittedPolicy = caddyfile.match(
      /^\s*>Content-Security-Policy "([^"]+)"$/m,
    );

    expect(
      caddyfile.match(/header_down -Content-Security-Policy/g),
    ).toHaveLength(1);
    expect(caddyfile.match(/^\s*>Content-Security-Policy /gm)).toHaveLength(1);
    expect(cspHeaders).toHaveLength(2);
    expect(emittedPolicy?.[1]).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://__OBJECT_STORAGE_CSP_HOST__; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
    );
  });

  it('keeps the forwarded HTTPS scheme through the frontend Nginx gateway', () => {
    const frontendDockerfile = readFileSync(frontendDockerfilePath, 'utf8');

    expect(
      frontendDockerfile.match(
        /proxy_set_header X-Forwarded-Proto \$maps_forwarded_proto;/g,
      ),
    ).toHaveLength(3);
    expect(frontendDockerfile).not.toContain(
      'proxy_set_header X-Forwarded-Proto $scheme;',
    );
    expect(frontendDockerfile).toContain('location /api/socket.io {');
    expect(frontendDockerfile).toContain(
      'proxy_pass http://backend:4000/api/socket.io;',
    );
    expect(frontendDockerfile).toContain(
      'proxy_set_header Upgrade $http_upgrade;',
    );
    expect(frontendDockerfile).toContain(
      'proxy_set_header Connection "upgrade";',
    );
  });
});
