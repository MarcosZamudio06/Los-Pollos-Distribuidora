import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const productionCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.production.yml'),
  'utf8',
);
const environmentExample = readFileSync(
  resolve(repositoryRoot, '.env.example'),
  'utf8',
);
const operationsRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/docker-operations.md'),
  'utf8',
);
const backendRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/backend-deployment.md'),
  'utf8',
);

const longLivedServices = [
  'postgres',
  'backend',
  'frontend',
  'object-storage',
  'photon',
  'osrm',
  'vroom',
  'tileserver',
] as const;

const oneShotServices = ['migrate', 'bootstrap'] as const;

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

describe('production logging and restart contract', () => {
  it('defines one bounded json-file policy and applies it to every long-lived service', () => {
    expect(productionCompose).toContain(
      'x-production-logging: &production-logging',
    );
    expect(productionCompose).toContain('driver: json-file');
    expect(productionCompose).toContain(
      'max-size: "${DOCKER_LOG_MAX_SIZE:-10m}"',
    );
    expect(productionCompose).toContain(
      'max-file: "${DOCKER_LOG_MAX_FILE:-5}"',
    );
    expect(environmentExample).toContain('DOCKER_LOG_MAX_SIZE=10m');
    expect(environmentExample).toContain('DOCKER_LOG_MAX_FILE=5');

    for (const service of longLivedServices) {
      expect(serviceBlock(service)).toContain('logging: *production-logging');
    }
  });

  it('keeps long-lived services recoverable and one-shot jobs non-restarting', () => {
    for (const service of longLivedServices) {
      expect(serviceBlock(service)).toContain('restart: unless-stopped');
    }

    for (const service of oneShotServices) {
      const block = serviceBlock(service);
      expect(block).toContain('restart: "no"');
      expect(block).not.toContain('logging:');
    }
  });

  it('probes the frontend Nginx HTTP listener locally without new exposure', () => {
    const frontend = serviceBlock('frontend');

    expect(frontend).toContain('healthcheck:');
    expect(frontend).toContain('wget -q -O /dev/null');
    expect(frontend).toContain('http://127.0.0.1:3000/');
    expect(frontend.toLowerCase()).not.toContain('cloudflare');
    expect(frontend.toLowerCase()).not.toContain('caddy');
    expect(frontend).toContain('127.0.0.1:${FRONTEND_PORT:-3000}:3000');
  });

  it('preserves the private production port boundary', () => {
    expect(productionCompose.match(/^\x20{4}ports:\n/gm)).toHaveLength(2);
    expect(serviceBlock('object-storage')).toContain('127.0.0.1:8333:8333');

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
  });

  it('documents host daemon defaults and recovery verification', () => {
    expect(operationsRunbook).toContain('/etc/docker/daemon.json');
    expect(operationsRunbook).toContain('"log-driver": "json-file"');
    expect(operationsRunbook).toContain(
      "docker compose -f docker-compose.production.yml exec -T frontend sh -c 'kill -9 1'",
    );
    expect(operationsRunbook).toContain('BusyBox `wget`');
    expect(backendRunbook).toContain(
      '[`docker-operations.md`](./docker-operations.md)',
    );
  });
});
