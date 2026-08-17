import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const refresh = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/refresh-monthly.sh'),
  'utf8',
);
const common = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/map-preprocessing-common.sh'),
  'utf8',
);
const candidateValidator = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/validate-candidates.sh'),
  'utf8',
);
const prepareOsrm = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/prepare-osrm.sh'),
  'utf8',
);
const fixture = readFileSync(
  resolve(repositoryRoot, 'scripts/maps/test-zero-downtime-refresh.sh'),
  'utf8',
);
const mapsRunbook = readFileSync(
  resolve(repositoryRoot, 'docs/runbooks/maps-deployment.md'),
  'utf8',
);

describe('GIS zero-downtime refresh contract', () => {
  it('prepares candidates before any component restart and never stops the backend', () => {
    expect(refresh).toContain('MAP_REFRESH_CANDIDATE_ONLY=1');
    expect(refresh).toContain('"${SCRIPT_DIR}/prepare-all.sh"');
    expect(refresh).toContain('"${SCRIPT_DIR}/validate-candidates.sh"');
    expect(refresh).toContain('map_promote_component_transactional');
    expect(refresh).toContain(
      'docker compose up -d --no-deps --force-recreate',
    );
    expect(refresh).not.toMatch(/docker compose[^\n]*(stop|down)/);
    expect(refresh).not.toContain(
      'force-recreate photon osrm vroom tileserver backend',
    );
    expect(refresh).toContain('map_backend_monitor_start');
    expect(refresh).toContain('map_backend_ready');
  });

  it('keeps candidate work outside active mounts and preserves transaction rollback state', () => {
    expect(common).toContain('Refresh candidate cannot be inside the active');
    expect(common).toContain('MAP_REFRESH_CANDIDATE_ROOT');
    expect(common).toContain('map_write_promotion_state');
    expect(common).toContain('PREPARED');
    expect(common).toContain('ACTIVE_MOVED');
    expect(common).toContain('promotions/${component}.state');
    expect(common).toContain('map_rollback_component_transactional');
    expect(common).toContain('map_remove_refresh_promotion_states');
    expect(candidateValidator).toContain('--network none');
    expect(candidateValidator).toContain(':/data:ro');
    expect(candidateValidator).toContain(':/data/rendering:ro');
    expect(candidateValidator).not.toContain(' -p ');
  });

  it('validates the actual multi-file OSRM MLD prefix instead of a nonexistent base file', () => {
    expect(prepareOsrm).toContain('mexico-latest.osrm.properties');
    expect(candidateValidator).toContain('mexico-latest.osrm.properties');
  });

  it('gives runtime candidates the same bounded startup allowance as production healthchecks', () => {
    expect(candidateValidator).toContain(
      'MAP_CANDIDATE_HEALTH_ATTEMPTS="${MAP_CANDIDATE_HEALTH_ATTEMPTS:-180}"',
    );
    expect(candidateValidator).toContain(
      'attempts < MAP_CANDIDATE_HEALTH_ATTEMPTS',
    );
  });

  it('records component and global refresh states and documents bounded switch behavior', () => {
    for (const state of [
      'PREPARING',
      'VALIDATED',
      'PROMOTING',
      'ACTIVE',
      'ROLLED_BACK',
      'FAILED',
    ]) {
      expect(refresh).toContain(state);
    }
    expect(refresh).toContain('backendDowntimeSeconds');
    expect(refresh).toContain('preparationDurationSeconds');
    expect(refresh).toContain('promotionDurationSeconds');
    expect(mapsRunbook).toContain('0 downtime de backend');
    expect(mapsRunbook).toContain('validate-candidates.sh');
    expect(mapsRunbook).toContain('ROLLED_BACK');
  });

  it('ships a fixture E2E that exercises v1, v2 promotion, v3 failure, and rollback', () => {
    expect(fixture).toContain('active-v1');
    expect(fixture).toContain('candidate-v2');
    expect(fixture).toContain('candidate-v3');
    expect(fixture).toContain('rollback');
    expect(fixture).toContain("'phase=ACTIVE_MOVED'");
    expect(fixture).toContain('backend');
  });
});
