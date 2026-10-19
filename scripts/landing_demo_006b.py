"""Warp-only disposable DB tooling. Migrations require the explicit migrate action.

create/verify/resume never migrate. No seeds, app startup or resource deletion.

Uses only the Python standard library. Private credentials stay outside the repo.
"""
import argparse
import hashlib
import shutil
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import uuid
from urllib.parse import urlparse

IMAGE = 'postgis/postgis:16-3.4'
LABEL = 'pollos.demo006b.run'
CONTEXT = 'desktop-linux'


def require(condition):
    if not condition:
        raise ValueError('Isolation check failed; no application writes permitted')


def docker(*args):
    # Never print raw Docker errors: inspect output may contain credentials.
    result = subprocess.run(['docker', '--context', CONTEXT, *args],
                            capture_output=True, text=True, timeout=300)
    if result.returncode:
        raise ValueError('Docker operation failed; inspect the task-owned resource locally')
    return result.stdout.strip()


def validate(state, info, database_url):
    """Pure guard: verify exact owned resource and URL before any later DB write."""
    require(bool(re.fullmatch('[a-f0-9]{32}', state['run'])))
    require(state['name'] == 'landing-demo-006b-' + state['run'])
    require(state['database'] == 'landing_demo_006b_' + state['run'])
    require(state['user'] == 'demo006b')
    require(bool(re.fullmatch('[a-f0-9]{64}', state['password'])))
    require(bool(re.fullmatch('[a-f0-9]{64}', state['container'])))
    require(info['Id'] == state['container'])
    require(info['Name'] == '/' + state['name'])
    require(info['Config']['Image'] == IMAGE)
    require(info['Config']['Labels'].get(LABEL) == state['run'])
    require(info['State']['Running'] is True)
    require(info['HostConfig']['RestartPolicy']['Name'] == 'no')
    # --tmpfs is represented in HostConfig.Tmpfs, not necessarily Mounts.
    require(info['HostConfig'].get('Tmpfs') == {'/var/lib/postgresql/data': 'rw'})
    require(len(info['Mounts']) <= 1)
    for mount in info['Mounts']:
        require(mount['Type'] == 'tmpfs')
        require(mount['Destination'] == '/var/lib/postgresql/data')
    bindings = info['NetworkSettings']['Ports']['5432/tcp']
    require(len(bindings) == 1 and bindings[0]['HostIp'] == '127.0.0.1')
    port = int(bindings[0]['HostPort'])
    require(1024 <= port <= 65535)
    url = urlparse(database_url)
    require(url.scheme == 'postgresql' and url.hostname == '127.0.0.1')
    require(url.port == port and url.path == '/' + state['database'])
    require(url.username == state['user'] and url.password == state['password'])
    require(not url.query and not url.fragment and not url.params)
    return port


def save_private(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        handle.write(value)


def local_context():
    context = json.loads(docker('context', 'inspect', CONTEXT))[0]
    require(context['Endpoints']['docker']['Host'].startswith('unix://'))


def verify(directory):
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink())
    require(directory.stat().st_uid == os.getuid())
    require(directory.stat().st_mode & 0o077 == 0)
    state = json.loads((directory / 'state.json').read_text())
    local_context()
    info = json.loads(docker('inspect', state['container']))[0]
    validate(state, info, state['database_url'])
    report = database_identity(state, info)
    # Safe evidence only; no environment, DSN, password or token.
    (directory / 'isolation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    print('PRIVATE_STATE_DIRECTORY=' + str(directory))
    return report


def database_identity(state, info):
    # Read-only database identity; never create extensions or modify app data here.
    identity = docker('exec', state['container'], 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                      '-U', state['user'], '-d', state['database'], '-At', '-F', '|',
                      '-c', 'SELECT current_database(), current_user, PostGIS_Version();')
    database, user, postgis = identity.split('|')
    require(database == state['database'] and user == state['user'])
    require(postgis.startswith('3.4'))
    return {
        'gate': 'ISOLATION_VERIFIED_NO_APP_WRITES', 'context': CONTEXT,
        'container': state['container'], 'name': state['name'],
        'database': database, 'binding': '127.0.0.1:' + info['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort'],
        'image': IMAGE, 'imageId': info['Image'], 'postgis': postgis.split()[0],
        'storage': 'tmpfs; stop/restart loses database',
        'migrations': 'NOT_RUN', 'seed': 'NOT_RUN',
    }


def verified_original(directory, expected_container, expected_port):
    """Read and validate one original manifest and its live resource, without writes."""
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink())
    require(directory.stat().st_uid == os.getuid())
    require(directory.stat().st_mode & 0o077 == 0)
    manifest = directory / 'created.json'
    require(manifest.is_file() and not manifest.is_symlink())
    require(manifest.stat().st_uid == os.getuid())
    require(manifest.stat().st_mode & 0o077 == 0)
    state = json.loads(manifest.read_text())
    require(set(state) == {'run', 'name', 'container', 'database', 'user', 'password'})
    require(bool(re.fullmatch('[a-f0-9]{64}', expected_container or '')))
    require(state['container'] == expected_container)
    require(isinstance(expected_port, int) and 1024 <= expected_port <= 65535)
    local_context()
    # Pin lookup to both the original manifest ID and explicit operator ID.
    info = json.loads(docker('inspect', expected_container))[0]
    state['database_url'] = ('postgresql://' + state['user'] + ':' + state['password']
                             + '@127.0.0.1:' + str(expected_port) + '/' + state['database'])
    require(validate(state, info, state['database_url']) == expected_port)
    report = database_identity(state, info)
    return state, info, report


def resume(directory, expected_container, expected_port):
    """Read-only recovery; no new files or database data."""
    _, _, report = verified_original(directory, expected_container, expected_port)
    print(json.dumps(report, indent=2))
    print('RESUME_READ_ONLY: original manifest preserved; no files or application data written')
    return report


class MigrationFailure(ValueError):
    """Only sanitized migration phase and Prisma error code may reach stdout."""


def stage_migrations(repo, directory):
    source = repo / 'backend/prisma'
    paths = [source / 'schema.prisma', source / 'migrations/migration_lock.toml']
    migrations = sorted(source.glob('migrations/*/migration.sql'))
    require(bool(migrations))
    paths.extend(migrations)
    hashes = {}
    for path in paths:
        require(path.is_file() and not path.is_symlink())
        require(not path.parent.is_symlink() and not source.is_symlink())
        target = directory / 'prisma' / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        hashes[str(path.relative_to(source))] = hashlib.sha256(target.read_bytes()).hexdigest()
    # Prisma runs from a standalone package/schema directory without repository .env.
    save_private(directory / 'package.json', '{"name":"landing-demo-migration-stage","private":true}')
    return {'migrationCount': len(migrations), 'sha256': hashes}


def migration_step(repo, directory, state, phase):
    require(phase in ['deploy', 'status'])
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR'] if key in os.environ}
    env.update({'OPENSSL_CONF': '/dev/null', 'NODE_ENV': 'test',
                'DATABASE_URL': state['database_url'], 'CFDI_ENABLED': 'false',
                'FISCAL_PROVIDER': 'NONE',
                'NPM_CONFIG_USERCONFIG': str(directory / 'npm-user.conf'),
                'NPM_CONFIG_GLOBALCONFIG': str(directory / 'npm-global.conf')})
    args = ['npm', '--prefix', str(repo / 'backend'), '--offline', '--yes=false',
            '--ignore-scripts', 'exec', '--', 'prisma', 'migrate', phase,
            '--schema', str(directory / 'prisma/schema.prisma')]
    result = subprocess.run(args, cwd=directory, env=env, capture_output=True,
                            text=True, timeout=600)
    if result.returncode:
        codes = re.findall(r'\bP[0-9]{4}\b', (result.stdout or '') + (result.stderr or ''))
        code = codes[0] if codes else 'NO_SAFE_ERROR_CODE'
        raise MigrationFailure('BLOCKED_MIGRATION phase=' + phase + ' code=' + code
                               + '; migration may be partial; no automatic retry or reset')


def migrate(directory, expected_container, expected_port):
    """Explicit schema-only writes, bound to a freshly verified original resource."""
    state, _, report = verified_original(directory, expected_container, expected_port)
    os.umask(0o077)
    stage = Path(tempfile.mkdtemp(prefix='landing-demo-006-migrations-', dir='/tmp'))
    print('MIGRATION_STAGE_DIRECTORY=' + str(stage), flush=True)
    repo = Path(__file__).resolve().parents[1]
    source_manifest = stage_migrations(repo, stage)
    save_private(stage / 'source-manifest.json', json.dumps(source_manifest, indent=2))
    for phase in ['deploy', 'status']:
        # Recheck immediately before each child, and use the same in-memory URL.
        current, _, _ = verified_original(directory, expected_container, expected_port)
        require(current == state)
        migration_step(repo, stage, state, phase)
    report = dict(report, gate='MIGRATIONS_DEPLOYED_NO_SEED', migrations='DEPLOY_AND_STATUS_PASS',
                  migrationCount=source_manifest['migrationCount'])
    save_private(stage / 'result.json', json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


def create():
    os.umask(0o077)
    local_context()
    directory = Path(tempfile.mkdtemp(prefix='landing-demo-006b-', dir='/tmp'))
    print('PRIVATE_STATE_DIRECTORY=' + str(directory), flush=True)
    run = uuid.uuid4().hex
    state = {'run': run, 'name': 'landing-demo-006b-' + run,
             'database': 'landing_demo_006b_' + run,
             'user': 'demo006b', 'password': secrets.token_hex(32)}
    env_file = directory / 'postgres.env'
    save_private(env_file, 'POSTGRES_DB=' + state['database'] + '\nPOSTGRES_USER=' + state['user'] + '\nPOSTGRES_PASSWORD=' + state['password'] + '\n')
    # Same image as repository disposable harness. Explicit amd64 emulation avoids
    # assuming this tag publishes an ARM64 variant. No existing volumes attached.
    state['container'] = docker('run', '--detach', '--platform', 'linux/amd64',
                                '--name', state['name'], '--label', LABEL + '=' + run,
                                '--restart=no', '--tmpfs', '/var/lib/postgresql/data:rw',
                                '--publish', '127.0.0.1::5432', '--env-file', str(env_file), IMAGE)
    # Persist exact owned ID before readiness checks. No automatic cleanup on failure.
    save_private(directory / 'created.json', json.dumps(state))
    info = json.loads(docker('inspect', state['container']))[0]
    binding = info['NetworkSettings']['Ports']['5432/tcp']
    require(len(binding) == 1 and binding[0]['HostIp'] == '127.0.0.1')
    state['database_url'] = 'postgresql://' + state['user'] + ':' + state['password'] + '@127.0.0.1:' + binding[0]['HostPort'] + '/' + state['database']
    validate(state, info, state['database_url'])
    save_private(directory / 'state.json', json.dumps(state))
    save_private(directory / 'connection.env', 'DATABASE_URL=' + state['database_url'] + '\n')
    for _ in range(90):
        probe = subprocess.run(['docker', '--context', CONTEXT, 'exec', state['container'],
                                'pg_isready', '-h', '127.0.0.1', '-U', state['user'], '-d', state['database']],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if probe.returncode == 0:
            return verify(directory)
        time.sleep(1)
    raise ValueError('Owned database not ready; preserve private state and report blocker')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['create', 'verify', 'resume', 'migrate'])
    parser.add_argument('directory', nargs='?')
    parser.add_argument('--expected-container')
    parser.add_argument('--expected-port', type=int)
    parser.add_argument('--confirm-migrations', action='store_true')
    args = parser.parse_args()
    if args.action == 'migrate':
        require(bool(args.directory) and args.confirm_migrations)
        migrate(args.directory, args.expected_container, args.expected_port)
    elif args.action == 'resume':
        require(bool(args.directory))
        resume(args.directory, args.expected_container, args.expected_port)
    elif args.action == 'verify':
        require(bool(args.directory))
        verify(args.directory)
    else:
        require(args.directory is None)
        create()


if __name__ == '__main__':
    try:
        main()
    except MigrationFailure as error:
        print(str(error))
        raise SystemExit(1)
    except (ValueError, KeyError, IndexError, TypeError, OSError, subprocess.SubprocessError):
        # Do not leak raw errors, credentials, URLs or inspect payloads.
        print('BLOCKED_ENVIRONMENT: operation failed. Preserve private state and any printed stage; do not retry automatically. An explicit migration may be partial. No seed or resource cleanup performed.')
        raise SystemExit(1)
