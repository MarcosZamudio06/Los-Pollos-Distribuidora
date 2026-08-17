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

    expect(activeConfig).not.toMatch(/\b(?:rewrite|uri|handle_path)\b/);
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
  });
});
