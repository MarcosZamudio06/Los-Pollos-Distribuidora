import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const productionCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.production.yml'),
  'utf8',
);
const developmentCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.yml'),
  'utf8',
);
const developmentEnv = readFileSync(
  resolve(repositoryRoot, '.env.example'),
  'utf8',
);
const productionEnv = readFileSync(
  resolve(repositoryRoot, '.env.production.example'),
  'utf8',
);
const gitignore = readFileSync(resolve(repositoryRoot, '.gitignore'), 'utf8');
const releaseWorkflow = readFileSync(
  resolve(repositoryRoot, '.github/workflows/release-images.yml'),
  'utf8',
);

function serviceBlock(compose: string, service: string): string {
  const start = compose.search(new RegExp(`^\\x20{2}${service}:\\n`, 'm'));
  if (start < 0) throw new Error(`Compose has no ${service} service`);

  const remaining = compose.slice(start);
  const bodyOffset = remaining.indexOf('\n') + 1;
  const nextService = remaining
    .slice(bodyOffset)
    .search(/\n\x20{2}[A-Za-z0-9_-]+:\n|\nvolumes:\n|\nnetworks:\n/);

  return nextService < 0
    ? remaining
    : remaining.slice(0, bodyOffset + nextService);
}

describe('production release contract', () => {
  it('publishes only after the quality gate with minimum GHCR permissions', () => {
    expect(releaseWorkflow).toContain('workflow_run:');
    expect(releaseWorkflow).toContain('workflows: [Quality Gate]');
    expect(releaseWorkflow).toContain('types: [completed]');
    expect(releaseWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(releaseWorkflow).toContain("head_branch == 'main'");
    expect(releaseWorkflow).toContain('contents: read');
    expect(releaseWorkflow).toContain('packages: write');
    expect(releaseWorkflow).not.toContain('packages: read');
    expect(releaseWorkflow).not.toMatch(/\bPAT\b|PERSONAL_ACCESS_TOKEN/);
    expect(releaseWorkflow).toContain('secrets.GITHUB_TOKEN');
  });

  it('publishes versioned tags and records immutable digests for the release', () => {
    expect(releaseWorkflow).toContain('RELEASE_TAG: sha-');
    expect(releaseWorkflow).toContain('RELEASE_ALIAS: main-');
    expect(releaseWorkflow).not.toMatch(/:latest\b/);
    expect(releaseWorkflow).toContain('steps.backend.outputs.digest');
    expect(releaseWorkflow).toContain('steps.frontend.outputs.digest');
    expect(releaseWorkflow).toContain('release-digests.json');
    expect(releaseWorkflow).toContain('actions/upload-artifact@v4');

    for (const image of [
      'backend',
      'frontend',
      'photon',
      'osrm',
      'tileserver',
    ]) {
      expect(releaseWorkflow).toContain(
        '${{ env.IMAGE_NAMESPACE }}/' + image + ':${{ env.RELEASE_TAG }}',
      );
    }
  });

  it('requires the same backend image reference for runtime and one-shot jobs', () => {
    const backendImage =
      'image: ${BACKEND_IMAGE:?BACKEND_IMAGE is required for production}';
    expect(productionCompose.split(backendImage).length - 1).toBe(3);
    expect(serviceBlock(productionCompose, 'backend')).not.toContain('build:');
    expect(serviceBlock(productionCompose, 'frontend')).toContain(
      'image: ${FRONTEND_IMAGE:?FRONTEND_IMAGE is required for production}',
    );

    for (const service of ['migrate', 'bootstrap', 'backend']) {
      expect(serviceBlock(productionCompose, service)).toContain(backendImage);
    }
    expect(developmentCompose).toContain(
      'dockerfile: docker/backend/Dockerfile',
    );
    expect(developmentCompose).toContain(
      'dockerfile: docker/frontend/Dockerfile',
    );
    expect(productionCompose).not.toMatch(/^\s+build:\s*$/m);
  });

  it('requires immutable custom release images and pins third-party production images', () => {
    for (const service of ['photon', 'osrm', 'tileserver']) {
      expect(serviceBlock(productionCompose, service)).toContain(
        `image: \${${service.toUpperCase()}_IMAGE:?${service.toUpperCase()}_IMAGE is required for production}`,
      );
    }

    for (const line of [
      'postgis/postgis:16-3.5-alpine@sha256:',
      'chrislusf/seaweedfs:4.29@sha256:',
      'ghcr.io/vroom-project/vroom-docker:v1.15.0@sha256:',
    ]) {
      expect(productionCompose).toContain(line);
    }
    expect(productionCompose).not.toMatch(/image:[^\n]*:latest\b/);

    for (const variable of [
      'BACKEND_IMAGE=ghcr.io/',
      'FRONTEND_IMAGE=ghcr.io/',
      'PHOTON_IMAGE=ghcr.io/',
      'OSRM_IMAGE=ghcr.io/',
      'TILESERVER_IMAGE=ghcr.io/',
    ]) {
      expect(productionEnv).toContain(variable);
    }
    expect(
      productionEnv.match(/@sha256:REPLACE_WITH_RELEASE_DIGEST/g),
    ).toHaveLength(5);
  });

  it('keeps Dockerfile bases immutable without removing local development builds', () => {
    for (const relativePath of [
      'docker/backend/Dockerfile',
      'docker/frontend/Dockerfile',
      'docker/maps/photon/Dockerfile',
      'docker/maps/osrm/Dockerfile',
      'docker/maps/tileserver/Dockerfile',
    ]) {
      const dockerfile = readFileSync(
        resolve(repositoryRoot, relativePath),
        'utf8',
      );
      const fromLines = dockerfile
        .split('\n')
        .filter(
          (line) =>
            line.startsWith('FROM ') &&
            !/^FROM\s+[A-Za-z0-9_-]+\s+AS\s+/i.test(line),
        );
      expect(fromLines.length).toBeGreaterThan(0);
      fromLines.forEach((line) => {
        expect(line).toMatch(/@sha256:[0-9a-f]{64}/);
      });
    }
    expect(developmentCompose).toContain('build:');
    expect(developmentCompose).toContain(
      'dockerfile: docker/maps/photon/Dockerfile',
    );
    expect(developmentCompose).toContain(
      'dockerfile: docker/maps/osrm/Dockerfile',
    );
    expect(developmentCompose).toContain(
      'dockerfile: docker/maps/tileserver/Dockerfile',
    );
  });

  it('separates development and production environment contracts', () => {
    expect(gitignore).toContain('!.env.production.example');
    expect(developmentEnv).toContain('NODE_ENV=development');
    expect(developmentEnv).toContain('MAP_ENVIRONMENT=development');
    expect(developmentEnv).toContain('MAP_DATA_DIR=./.map-data');
    expect(developmentEnv).toContain('CORS_ORIGIN=http://localhost:3000');
    expect(developmentEnv).toContain('TRUST_PROXY_HOPS=0');
    expect(developmentEnv).toContain(
      'OBJECT_STORAGE_ENDPOINT=http://object-storage:8333',
    );
    expect(developmentEnv).toContain(
      'OBJECT_STORAGE_PUBLIC_ENDPOINT=http://127.0.0.1:8333',
    );
    expect(developmentEnv).not.toContain('REPLACE_WITH_RELEASE_DIGEST');

    expect(productionEnv).toContain('NODE_ENV=production');
    expect(productionEnv).toContain('MAP_ENVIRONMENT=production');
    expect(productionEnv).toContain(
      'MAP_DATA_DIR=/srv/pollos-distribuidor/maps',
    );
    expect(productionEnv).toContain('CORS_ORIGIN=https://erp.example.com');
    expect(productionEnv).toContain('TRUST_PROXY_HOPS=1');
    expect(productionEnv).toContain(
      'DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}',
    );
    expect(productionEnv).toContain('DATABASE_SSL=false');
    expect(productionEnv).toContain(
      'OBJECT_STORAGE_ENDPOINT=http://object-storage:8333',
    );
    expect(productionEnv).toContain(
      'OBJECT_STORAGE_PUBLIC_ENDPOINT=https://objects.example.com',
    );
    expect(productionEnv).toContain(
      'OBJECT_STORAGE_PUBLIC_ORIGIN=https://objects.example.com',
    );
    expect(productionEnv).toContain('BACKUP_S3_ENDPOINT=');
    expect(productionEnv).toContain('BACKUP_S3_ACCESS_KEY_ID=');
    expect(productionEnv).toContain('BACKUP_S3_SECRET_ACCESS_KEY=');
  });

  it('keeps the production host-port boundary unchanged', () => {
    expect(productionCompose.match(/^ {4}ports:\n/gm)).toHaveLength(2);
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
      expect(serviceBlock(productionCompose, service)).not.toContain('ports:');
    }
  });

  it('does not put runtime secrets in release workflow or production templates', () => {
    for (const key of [
      'POSTGRES_PASSWORD',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'OBJECT_STORAGE_ACCESS_KEY_ID',
      'OBJECT_STORAGE_SECRET_ACCESS_KEY',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'SEED_ADMIN_PASSWORD',
    ]) {
      expect(productionEnv).toMatch(new RegExp(`^${key}=$`, 'm'));
    }
    expect(releaseWorkflow).not.toMatch(
      /POSTGRES_PASSWORD|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|OBJECT_STORAGE_SECRET_ACCESS_KEY|BACKUP_S3_SECRET_ACCESS_KEY/,
    );
  });
});
