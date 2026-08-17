import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const productionCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.production.yml'),
  'utf8',
);
const hardeningRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/container-hardening.md'),
  'utf8',
);
const backendDockerfile = readFileSync(
  resolve(repositoryRoot, 'docker/backend/Dockerfile'),
  'utf8',
);
const frontendDockerfile = readFileSync(
  resolve(repositoryRoot, 'docker/frontend/Dockerfile'),
  'utf8',
);
const photonDockerfile = readFileSync(
  resolve(repositoryRoot, 'docker/maps/photon/Dockerfile'),
  'utf8',
);

function serviceBlock(service: string): string {
  const start = productionCompose.search(new RegExp(`^  ${service}:\\n`, 'm'));
  if (start < 0) {
    throw new Error(`Production Compose has no ${service} service`);
  }

  const remaining = productionCompose.slice(start);
  const bodyOffset = remaining.indexOf('\n') + 1;
  const nextService = remaining
    .slice(bodyOffset)
    .search(/\n\x20{2}[A-Za-z0-9_-]+:\n|\nvolumes:\n|\nnetworks:\n/);

  return nextService < 0
    ? remaining
    : remaining.slice(0, bodyOffset + nextService);
}

describe('production container hardening contract', () => {
  it('applies the stateless security profile without granting new privileges', () => {
    expect(productionCompose).toContain(
      'x-security-stateless: &security-stateless',
    );
    expect(productionCompose).toContain(
      'x-security-stateful: &security-stateful',
    );

    for (const service of [
      'migrate',
      'bootstrap',
      'backend',
      'frontend',
      'photon',
      'osrm',
      'vroom',
      'tileserver',
    ]) {
      const block = serviceBlock(service);
      expect(block).toContain('<<: *security-stateless');
    }

    expect(productionCompose).not.toContain('privileged: true');
    expect(productionCompose).not.toContain('network_mode: host');
    expect(productionCompose).not.toContain('cap_add:');
  });

  it('keeps stateful services writable only where their runtime requires it', () => {
    for (const service of ['postgres', 'object-storage']) {
      const block = serviceBlock(service);
      expect(block).toContain('<<: *security-stateful');
      expect(block).not.toContain('read_only: true');
    }

    const photon = serviceBlock('photon');
    expect(photon).toContain('<<: *security-stateless');
    expect(photon).toContain('/photon:/data');
    expect(photon).not.toContain('/photon:/data:ro');

    expect(serviceBlock('postgres')).toContain(
      'postgres_data:/var/lib/postgresql/data',
    );
    expect(serviceBlock('object-storage')).toContain(
      'object_storage_data:/data',
    );
    expect(hardeningRunbook).toContain('stateful');
    expect(hardeningRunbook).toContain('PostgreSQL');
    expect(hardeningRunbook).toContain('SeaweedFS');
    expect(hardeningRunbook).toContain('Photon');
  });

  it('protects GIS consumers and preserves read-only dataset mounts', () => {
    expect(serviceBlock('osrm')).toContain('user: "65534:65534"');
    expect(serviceBlock('osrm')).toContain('/osrm:/data:ro');
    expect(serviceBlock('vroom')).toContain('user: "node:node"');
    expect(serviceBlock('vroom')).toContain('VROOM_LOG: /tmp/vroom');
    expect(serviceBlock('vroom')).toContain('entrypoint: ["/bin/sh", "-c"]');
    expect(serviceBlock('vroom')).toContain(
      'mkdir -p /tmp/vroom && exec node /vroom-express/src/index.js',
    );
    expect(serviceBlock('vroom')).toContain(
      './docker/maps/vroom/config.yml:/vroom-express/config.yml:ro',
    );
    expect(serviceBlock('tileserver')).toContain(
      '/rendering:/data/rendering:ro',
    );
    expect(serviceBlock('tileserver')).toContain(
      '/rendering/fonts:/data/fonts:ro',
    );
  });

  it('builds the backend as a non-root production runtime while retaining one-shot tooling', () => {
    expect(backendDockerfile).toContain('AS deps');
    expect(backendDockerfile).toContain('AS build');
    expect(backendDockerfile).toContain('AS runtime');
    expect(backendDockerfile).toContain('npm prune --omit=dev');
    expect(backendDockerfile).toContain(
      'npm install --prefix /tmp/production-tools --omit=dev --no-save',
    );
    expect(backendDockerfile).toContain(
      'cp -a /tmp/production-tools/node_modules/. ./node_modules/',
    );
    expect(backendDockerfile).toContain('prisma@6.19.3');
    expect(backendDockerfile).toContain('ts-node@10.9.2');
    expect(backendDockerfile).toContain('typescript@5.7.3');
    expect(backendDockerfile).toContain('USER node');
    expect(backendDockerfile).toContain(
      'COPY --from=build --chown=node:node /app/backend/dist ./dist',
    );
    expect(backendDockerfile).toContain(
      'COPY --from=build --chown=node:node /app/backend/prisma ./prisma',
    );
    expect(serviceBlock('backend')).toContain('<<: *security-stateless');
    expect(serviceBlock('migrate')).toContain('restart: "no"');
    expect(serviceBlock('bootstrap')).toContain('restart: "no"');
  });

  it('runs frontend and Photon with explicit non-root users and writable tmpfs only', () => {
    expect(frontendDockerfile).toContain('USER nginx');
    expect(frontendDockerfile).toContain('pid /tmp/nginx.pid;');
    expect(frontendDockerfile).toContain('access_log /dev/stdout;');
    expect(frontendDockerfile).toContain('error_log /dev/stderr');
    expect(serviceBlock('frontend')).toContain(
      '/var/cache/nginx:uid=101,gid=101',
    );

    expect(photonDockerfile).toContain('addgroup -S -g 1000 photon');
    expect(photonDockerfile).toContain(
      'adduser -S -D -H -u 1000 -G photon photon',
    );
    expect(photonDockerfile).toContain('chown -R photon:photon');
    expect(photonDockerfile).toContain('USER photon');
    expect(productionCompose).toContain('  tmpfs:\n    - /tmp');
  });

  it('keeps the host port and one-shot boundaries unchanged', () => {
    expect(productionCompose.match(/^\x20{4}ports:\n/gm)).toHaveLength(2);
    expect(productionCompose).toContain(
      '127.0.0.1:${FRONTEND_PORT:-3000}:3000',
    );
    expect(productionCompose).toContain('127.0.0.1:8333:8333');

    for (const service of [
      'postgres',
      'backend',
      'photon',
      'osrm',
      'vroom',
      'tileserver',
    ]) {
      expect(serviceBlock(service)).not.toContain('ports:');
    }

    for (const service of ['migrate', 'bootstrap']) {
      expect(serviceBlock(service)).not.toContain('restart: unless-stopped');
    }
  });
});
