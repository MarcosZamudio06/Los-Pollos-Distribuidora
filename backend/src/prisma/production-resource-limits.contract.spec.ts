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
const resourceRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/resource-limits.md'),
  'utf8',
);
const dockerOperationsRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/docker-operations.md'),
  'utf8',
);
const mapsRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/maps-deployment.md'),
  'utf8',
);
const preprocessingCommon = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/map-preprocessing-common.sh'),
  'utf8',
);
const prepareAll = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/prepare-all.sh'),
  'utf8',
);
const preparePhoton = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/prepare-photon.sh'),
  'utf8',
);
const prepareOsrm = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/prepare-osrm.sh'),
  'utf8',
);
const prepareRendering = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/prepare-rendering.sh'),
  'utf8',
);
const refreshMonthly = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/refresh-monthly.sh'),
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

const expectedResources = {
  postgres: { memoryGiB: 3.5, cpus: 1.25 },
  backend: { memoryGiB: 2, cpus: 1.25 },
  frontend: { memoryGiB: 0.5, cpus: 0.5 },
  'object-storage': { memoryGiB: 0.75, cpus: 0.5 },
  photon: { memoryGiB: 6, cpus: 1.5 },
  osrm: { memoryGiB: 5, cpus: 1.5 },
  vroom: { memoryGiB: 1, cpus: 0.5 },
  tileserver: { memoryGiB: 1.5, cpus: 0.5 },
} as const;

function serviceBlock(service: string): string {
  const start = productionCompose.search(
    new RegExp(`^\x20{2}${service}:\\n`, 'm'),
  );
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

describe('production resource limits contract', () => {
  it('guards every long-lived service with configurable memory and CPU limits', () => {
    const resourceVariables = [
      'POSTGRES_MEM_LIMIT',
      'POSTGRES_CPUS',
      'BACKEND_MEM_LIMIT',
      'BACKEND_CPUS',
      'FRONTEND_MEM_LIMIT',
      'FRONTEND_CPUS',
      'OBJECT_STORAGE_MEM_LIMIT',
      'OBJECT_STORAGE_CPUS',
      'PHOTON_MEM_LIMIT',
      'PHOTON_CPUS',
      'OSRM_MEM_LIMIT',
      'OSRM_CPUS',
      'VROOM_MEM_LIMIT',
      'VROOM_CPUS',
      'TILESERVER_MEM_LIMIT',
      'TILESERVER_CPUS',
    ];

    for (const variable of resourceVariables) {
      expect(environmentExample).toContain(`${variable}=`);
    }

    for (const service of longLivedServices) {
      const block = serviceBlock(service);
      expect(block).toContain('mem_limit:');
      expect(block).toContain('cpus:');
      expect(block).toContain('restart: unless-stopped');
      expect(block).toContain('logging: *production-logging');
    }
  });

  it('keeps the nominal budget below host capacity with explicit headroom', () => {
    const totalMemoryGiB = longLivedServices.reduce(
      (total, service) => total + expectedResources[service].memoryGiB,
      0,
    );
    const totalCpus = longLivedServices.reduce(
      (total, service) => total + expectedResources[service].cpus,
      0,
    );

    expect(totalMemoryGiB).toBe(20.25);
    expect(24 - totalMemoryGiB).toBeGreaterThanOrEqual(3.5);
    expect(totalCpus).toBe(7.5);
    expect(totalCpus).toBeLessThanOrEqual(8);
    expect(resourceRunbook).toContain('3.75 GiB RAM');
    expect(resourceRunbook).toContain('0.5 nominal CPU');
  });

  it('keeps Photon and Node heaps below their container caps', () => {
    const photon = serviceBlock('photon');
    const backend = serviceBlock('backend');

    expect(photon).toContain(
      'JAVA_TOOL_OPTIONS: "-Xms${PHOTON_JAVA_XMS:-1g} -Xmx${PHOTON_JAVA_XMX:-4g}"',
    );
    expect(environmentExample).toContain('PHOTON_JAVA_XMS=1g');
    expect(environmentExample).toContain('PHOTON_JAVA_XMX=4g');
    expect(4).toBeLessThan(6);

    expect(backend).toContain(
      'NODE_OPTIONS: "--max-old-space-size=${BACKEND_NODE_MAX_OLD_SPACE_MB:-1536}"',
    );
    expect(environmentExample).toContain('BACKEND_NODE_MAX_OLD_SPACE_MB=1536');
    expect(1536).toBeLessThan(2048);
  });

  it('keeps migration and bootstrap one-shot and preserves the private port boundary', () => {
    for (const service of ['migrate', 'bootstrap']) {
      const block = serviceBlock(service);
      expect(block).toContain('restart: "no"');
      expect(block).not.toContain('restart: unless-stopped');
    }

    expect(productionCompose.match(/^\x20{4}ports:\n/gm)).toHaveLength(2);
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

  it('limits heavy GIS jobs and prevents concurrent preparation', () => {
    expect(preprocessingCommon).toContain('--memory');
    expect(preprocessingCommon).toContain('--cpus');
    expect(preprocessingCommon).toContain('.map-preprocessing.lock');
    expect(preprocessingCommon).toContain(
      'Another GIS preprocessing job already owns',
    );
    expect(prepareAll).toContain('map_acquire_preprocessing_lock');
    expect(prepareOsrm).toContain('map_docker_run_limited');
    expect(prepareRendering).toContain('map_docker_run_limited');
    expect(preparePhoton).toContain('PHOTON_PREP_IMAGE');
    expect(preparePhoton).toContain('map_docker_run_limited');
    expect(preparePhoton).not.toContain('tar -xjf "${ARCHIVE}"');
    expect(refreshMonthly).toContain('map_acquire_preprocessing_lock');
    expect(environmentExample).toContain('MAP_PREPROCESS_MEMORY_LIMIT=4g');
    expect(environmentExample).toContain('MAP_PREPROCESS_CPUS=2');
  });

  it('documents measurement, dataset sizing, and safe limit changes', () => {
    for (const marker of [
      'docker stats --no-stream',
      'free -h',
      'vmstat 1 5',
      'docker events --since 1h --filter event=oom',
      'real Mexico dataset',
      'docker compose -f docker-compose.production.yml up -d --force-recreate',
    ]) {
      expect(resourceRunbook).toContain(marker);
    }
    expect(dockerOperationsRunbook).toContain(
      '[`resource-limits.md`](./resource-limits.md)',
    );
    expect(mapsRunbook).toContain(
      '[`resource-limits.md`](./resource-limits.md)',
    );
  });
});
