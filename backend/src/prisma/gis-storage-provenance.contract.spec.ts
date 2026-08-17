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
const environmentExample = readFileSync(
  resolve(repositoryRoot, '.env.example'),
  'utf8',
);
const common = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/map-preprocessing-common.sh'),
  'utf8',
);
const provenanceTool = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/map-provenance.py'),
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
const storageTest = readFileSync(
  resolve(
    repositoryRoot,
    'scripts/maps/test-storage-provenance-disk-safety.sh',
  ),
  'utf8',
);
const candidateValidator = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/validate-candidates.sh'),
  'utf8',
);
const refreshManifestTool = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/map-refresh.py'),
  'utf8',
);

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

describe('GIS storage, provenance, and disk safety contract', () => {
  it('keeps production GIS mounts on one required persistent root outside the checkout', () => {
    for (const service of ['photon', 'osrm', 'tileserver']) {
      const block = serviceBlock(service);
      expect(block).toContain(
        '${MAP_DATA_DIR:?MAP_DATA_DIR is required for production}',
      );
      expect(block).not.toContain('./.map-data');
    }
    expect(productionCompose).not.toContain('${MAP_DATA_DIR:-./.map-data}');
    expect(developmentCompose).toContain('${MAP_DATA_DIR:-./.map-data}');
    expect(common).toContain('outside the repository checkout');
    expect(common).toContain('temporary filesystem');
    expect(common).toContain('Production MAP_DATA_DIR must already exist');
  });

  it('requires independent provenance inputs for Photon, OSRM, rendering, and fonts', () => {
    for (const variable of [
      'PHOTON_DATASET_VERSION=',
      'PHOTON_DATA_SHA256=',
      'OSRM_DATASET_VERSION=',
      'OSRM_PBF_SHA256=',
      'RENDERING_DATASET_VERSION=',
      'RENDERING_PBF_SHA256=',
      'FONT_DATASET_VERSION=',
      'OPENMAPTILES_FONT_SHA256=',
    ]) {
      expect(environmentExample).toContain(variable);
    }
    expect(provenanceTool).toContain('component');
    expect(provenanceTool).toContain('datasetVersion');
    expect(provenanceTool).toContain('sourceUrl');
    expect(provenanceTool).toContain('sha256');
    expect(provenanceTool).toContain('preparedAt');
    expect(provenanceTool).toContain('artifactPaths');
    expect(provenanceTool).toContain('identity');
    for (const script of [preparePhoton, prepareOsrm, prepareRendering]) {
      expect(script).toContain('map_plan_source');
      expect(script).toContain('map_write_component_manifest');
      expect(script).toContain('map_promote_component');
      expect(script).not.toContain('if [[ ! -s "${PBF_FILE}" ]]');
    }
  });

  it('does not reuse filename-only sources and preserves rollback/history', () => {
    expect(common).toContain('sources/${component}/${MAP_SOURCE_IDENTITY}');
    expect(common).toContain('map_source_cache_is_valid');
    expect(common).toContain('map_cleanup_history');
    expect(common).toContain('target_dir}.previous');
    expect(common).toContain('active and rollback data were restored');
    expect(prepareRendering).not.toContain('SOURCE_DIR}/mexico.osm.pbf');
    expect(prepareRendering).not.toContain('if [[ ! -s "${PBF_FILE}" ]]');
    expect(storageTest).toContain('URL change reused old source cache');
    expect(storageTest).toContain('version change reused old source cache');
    expect(storageTest).toContain('checksum change reused old source cache');
  });

  it('runs disk preflight before preparation and validates candidates before promotion', () => {
    for (const script of [preparePhoton, prepareOsrm, prepareRendering]) {
      expect(script).toContain('map_disk_preflight');
      expect(script.indexOf('map_disk_preflight')).toBeLessThan(
        script.indexOf('map_fetch_planned_source'),
      );
    }
    expect(common).toContain('MAP_MIN_FREE_GB');
    expect(common).toContain('MAP_RESERVED_HOST_GB');
    expect(common).toContain('MAP_RESERVED_POSTGRES_GB');
    expect(common).toContain('MAP_RESERVED_PERCENT');
    expect(common).toContain('MAP_STAGING_SAFETY_FACTOR');
    expect(common).toContain('GIS disk preflight FAILED');
    expect(refreshMonthly.indexOf('map_refresh_disk_preflight')).toBeLessThan(
      refreshMonthly.indexOf('"${SCRIPT_DIR}/prepare-all.sh"'),
    );
    expect(refreshMonthly).toContain('MAP_REFRESH_CANDIDATE_ONLY=1');
    expect(refreshMonthly).toContain('"${SCRIPT_DIR}/validate-candidates.sh"');
    expect(refreshMonthly).toContain(
      'map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" PROMOTING',
    );
    expect(refreshMonthly).not.toMatch(/docker compose[^\n]*(stop|down)/);
    expect(candidateValidator).toContain(
      'Starting isolated OSRM candidate smoke',
    );
    expect(candidateValidator).toContain(
      'Starting isolated Photon candidate smoke',
    );
    expect(candidateValidator).toContain(
      'Starting isolated TileServer candidate smoke',
    );
    expect(refreshManifestTool).toContain('PREPARING');
    expect(refreshManifestTool).toContain('VALIDATED');
    expect(refreshManifestTool).toContain('PROMOTING');
    expect(refreshManifestTool).toContain('ACTIVE');
    expect(refreshManifestTool).toContain('ROLLED_BACK');
    expect(storageTest).toContain('insufficient-space preflight');
  });

  it('keeps the production host-port boundary unchanged', () => {
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
  });
});
