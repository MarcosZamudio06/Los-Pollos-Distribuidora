import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const docker = process.env.DOCKER_BIN || 'docker';
const name = `operational-seed-test-${randomUUID()}`;
const cwd = resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let started = false;

function dockerCommand(args: string[]) {
  return execFileSync(docker, args, { encoding: 'utf8' }).trim();
}

async function main() {
  try {
    console.log(
      'Starting disposable PostGIS; migrations and demo writes run only in this container.',
    );
    dockerCommand([
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '-e',
      'POSTGRES_USER=seed_test',
      '-e',
      'POSTGRES_PASSWORD=disposable_only',
      '-e',
      'POSTGRES_DB=operational_seed_test',
      '-p',
      '127.0.0.1::5432',
      'postgis/postgis:16-3.4',
    ]);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const probe = spawnSync(
        docker,
        [
          'exec',
          name,
          'pg_isready',
          '-h',
          '127.0.0.1',
          '-U',
          'seed_test',
          '-d',
          'operational_seed_test',
        ],
        { stdio: 'ignore' },
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await setTimeout(1000);
    }
    if (!ready) throw new Error('Disposable PostGIS did not become ready');
    const address = dockerCommand(['port', name, '5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(address))
      throw new Error('Unexpected disposable database binding');
    const url = `postgresql://seed_test:disposable_only@${address}/operational_seed_test`;
    const env = {
      ...process.env,
      OPENSSL_CONF: '/dev/null',
      NODE_ENV: 'test',
      DATABASE_URL: url,
      E2E_DATABASE_URL: url,
      E2E_DATABASE_DISPOSABLE: 'true',
    };
    // Never read or use the caller's database URL; both child processes get this container's URL.
    for (const args of [
      ['exec', '--', 'prisma', 'migrate', 'deploy'],
      [
        'test',
        '--',
        '--config',
        './test/jest-operational-seed.json',
        '--runInBand',
      ],
    ]) {
      const result = spawnSync(npm, args, { cwd, env, stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Disposable seed verification failed (exit ${result.status})`,
        );
    }
  } finally {
    if (started) dockerCommand(['stop', name]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
