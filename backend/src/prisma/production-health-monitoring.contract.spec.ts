import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const healthService = readFileSync(
  resolve(repositoryRoot, 'backend/src/modules/health/health.service.ts'),
  'utf8',
);
const healthController = readFileSync(
  resolve(repositoryRoot, 'backend/src/modules/health/health.controller.ts'),
  'utf8',
);
const productionCompose = readFileSync(
  resolve(repositoryRoot, 'docker-compose.production.yml'),
  'utf8',
);
const environmentExample = readFileSync(
  resolve(repositoryRoot, '.env.example'),
  'utf8',
);
const monitorScript = readFileSync(
  resolve(repositoryRoot, 'scripts/monitoring/monitor-production.py'),
  'utf8',
);
const monitorService = readFileSync(
  resolve(
    repositoryRoot,
    'docs/runbooks/systemd/pollos-distribuidor-monitor.service',
  ),
  'utf8',
);
const monitorTimer = readFileSync(
  resolve(
    repositoryRoot,
    'docs/runbooks/systemd/pollos-distribuidor-monitor.timer',
  ),
  'utf8',
);

function serviceBlock(service: string): string {
  const start = productionCompose.search(
    new RegExp(`^\\x20{2}${service}:\\n`, 'm'),
  );
  if (start < 0) throw new Error(`Missing production service: ${service}`);
  const remaining = productionCompose.slice(start);
  const bodyOffset = remaining.indexOf('\n') + 1;
  const nextService = remaining
    .slice(bodyOffset)
    .search(/\n\x20{2}[A-Za-z0-9_-]+:\n|\nvolumes:\n|\nnetworks:\n/);
  return nextService < 0
    ? remaining
    : remaining.slice(0, bodyOffset + nextService);
}

describe('production health and monitoring contract', () => {
  it('keeps liveness, core readiness, and dependency health separate', () => {
    expect(healthController).toContain("@Get('live')");
    expect(healthController).toContain("@Get('ready')");
    expect(healthController).toContain("@Get('dependencies')");
    expect(healthService).toContain('SELECT 1');
    expect(healthService).toContain('HEALTH_DEPENDENCY_TIMEOUT_MS');
    for (const dependency of [
      'database',
      'photon',
      'osrm',
      'vroom',
      'tileserver',
      'objectStorage',
    ]) {
      expect(healthService).toContain(dependency);
    }
    expect(healthService).toContain("'degraded'");
    expect(healthService).toContain("'error'");
    expect(healthService).not.toContain('error.stack');
    expect(healthService).not.toContain('OBJECT_STORAGE_SECRET_ACCESS_KEY');
  });

  it('does not gate the backend or frontend startup on optional GIS dependencies', () => {
    expect(serviceBlock('backend')).toContain(
      'postgres:\n        condition: service_healthy',
    );
    const backendDependsOn =
      serviceBlock('backend').match(
        /\n\s{4}depends_on:\n([\s\S]*?)\n\s{4}healthcheck:/,
      )?.[1] ?? '';
    for (const dependency of [
      'photon',
      'osrm',
      'vroom',
      'tileserver',
      'object-storage',
    ]) {
      expect(backendDependsOn).not.toContain(`${dependency}:`);
    }
    const frontendDependsOn =
      serviceBlock('frontend').match(
        /\n\s{4}depends_on:\n([\s\S]*?)\n\s{4}healthcheck:/,
      )?.[1] ?? '';
    expect(frontendDependsOn).not.toContain('tileserver:');
    expect(serviceBlock('frontend')).toContain(
      'backend:\n        condition: service_healthy',
    );
  });

  it('keeps the existing public topology while adding no host ports', () => {
    expect(serviceBlock('frontend')).toContain('127.0.0.1:${FRONTEND_PORT');
    expect(serviceBlock('object-storage')).toContain('127.0.0.1:8333:8333');
    for (const service of [
      'backend',
      'postgres',
      'photon',
      'osrm',
      'vroom',
      'tileserver',
    ]) {
      expect(serviceBlock(service)).not.toMatch(/^\s{4}ports:/m);
    }
  });

  it('defines configurable bounded monitoring thresholds and safe state inputs', () => {
    for (const variable of [
      'MONITOR_DISK_WARN_PERCENT',
      'MONITOR_DISK_CRITICAL_PERCENT',
      'MONITOR_MEMORY_WARN_PERCENT',
      'MONITOR_MEMORY_CRITICAL_PERCENT',
      'MONITOR_CPU_WARN_PERCENT',
      'MONITOR_CPU_WARN_DURATION_SECONDS',
      'MONITOR_BACKUP_MAX_AGE_HOURS',
      'MONITOR_GIS_MAX_AGE_DAYS',
      'MONITOR_ALERT_WEBHOOK_URL',
    ]) {
      expect(environmentExample).toContain(`${variable}=`);
      expect(monitorScript).toContain(variable);
    }
    for (const marker of [
      'OOMKilled',
      'RestartCount',
      'docker system df',
      'health/dependencies',
      'restore-drills',
      'refreshes',
      'webhook',
    ]) {
      expect(monitorScript).toContain(marker);
    }
    expect(monitorScript).toContain('return 0 if report["status"] == "ok"');
    expect(monitorScript).not.toContain('OBJECT_STORAGE_SECRET_ACCESS_KEY');
  });

  it('provides a host systemd service and five-minute timer example', () => {
    expect(monitorService).toContain('Type=oneshot');
    expect(monitorService).toContain('monitor-production.py');
    expect(monitorService).toContain('docker.service');
    expect(monitorTimer).toContain('OnUnitActiveSec=5min');
    expect(monitorTimer).toContain('Unit=pollos-distribuidor-monitor.service');
  });
});
