"""Offline guard tests. Never invoke Docker or connect to a database."""
import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch
from contextlib import redirect_stdout
import io
import subprocess

SPEC = importlib.util.spec_from_file_location('demo006b', Path(__file__).parents[1] / 'landing_demo_006b.py')
demo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(demo)


class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.state = {
            'run': 'a' * 32, 'container': 'b' * 64,
            'name': 'landing-demo-006b-' + 'a' * 32,
            'database': 'landing_demo_006b_' + 'a' * 32,
            'user': 'demo006b', 'password': 'c' * 64,
        }
        self.info = {
            'Id': self.state['container'], 'Name': '/' + self.state['name'],
            'Config': {'Image': demo.IMAGE, 'Labels': {demo.LABEL: self.state['run']}},
            'State': {'Running': True},
            'HostConfig': {'RestartPolicy': {'Name': 'no'}, 'Tmpfs': {'/var/lib/postgresql/data': 'rw'}},
            'Mounts': [{'Type': 'tmpfs', 'Destination': '/var/lib/postgresql/data'}],
            'NetworkSettings': {'Ports': {'5432/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '55432'}]}},
        }
        self.url = 'postgresql://demo006b:' + self.state['password'] + '@127.0.0.1:55432/' + self.state['database']

    def test_private_file_is_exclusive_and_restricted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            demo.save_private(path, 'private')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): demo.save_private(path, 'other')
            self.assertEqual(path.read_text(), 'private')

    def test_remote_docker_context_rejected(self):
        with patch.object(demo, 'docker', return_value=json.dumps([{'Endpoints': {'docker': {'Host': 'tcp://remote:2375'}}}])):
            with self.assertRaises(ValueError): demo.local_context()

    def test_foreign_identity_stops_before_sql(self):
        with tempfile.TemporaryDirectory() as directory:
            state = dict(self.state, database_url=self.url)
            (Path(directory) / 'state.json').write_text(json.dumps(state))
            self.info['Id'] = 'd' * 64
            with patch.object(demo, 'local_context'), patch.object(demo, 'docker', return_value=json.dumps([self.info])) as command:
                with self.assertRaises(ValueError): demo.verify(directory)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(command.call_args.args[0], 'inspect')

    def test_observed_docker_tmpfs_shape(self):
        # Exact storage representation returned by the user's Docker inspect.
        self.info['Mounts'] = []
        self.assertEqual(demo.validate(self.state, self.info, self.url), 55432)

    def test_missing_or_extra_tmpfs_rejected(self):
        self.info['Mounts'] = []
        for tmpfs in [{}, {'/other': 'rw'}, {'/var/lib/postgresql/data': 'rw', '/other': 'rw'}]:
            self.info['HostConfig']['Tmpfs'] = tmpfs
            with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_readonly_resume_from_original_manifest(self):
        self.info['Mounts'] = []
        self.info['Image'] = 'sha256:offline-test'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'created.json'
            demo.save_private(path, json.dumps(self.state))
            before = path.read_bytes()
            output = io.StringIO()
            context = json.dumps([{'Endpoints': {'docker': {'Host': 'unix:///local/docker.sock'}}}])
            sql = self.state['database'] + '|demo006b|3.4 USE_GEOS=1'
            with patch.object(demo, 'docker', side_effect=[context, json.dumps([self.info]), sql]) as command, redirect_stdout(output):
                result = demo.resume(directory, self.state['container'], 55432)
            self.assertEqual(result['gate'], 'ISOLATION_VERIFIED_NO_APP_WRITES')
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['created.json'])
            self.assertNotIn(self.state['password'], output.getvalue())
            self.assertNotIn('postgresql://', output.getvalue())
            self.assertEqual([c.args[0] for c in command.call_args_list], ['context', 'inspect', 'exec'])
            self.assertIn('SELECT current_database()', command.call_args_list[-1].args[-1])

    def test_resume_wrong_expected_container_stops_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            demo.save_private(Path(directory) / 'created.json', json.dumps(self.state))
            with patch.object(demo, 'docker') as command:
                with self.assertRaises(ValueError): demo.resume(directory, 'd' * 64, 55432)
                command.assert_not_called()

    def test_resume_wrong_port_stops_before_sql(self):
        with tempfile.TemporaryDirectory() as directory:
            demo.save_private(Path(directory) / 'created.json', json.dumps(self.state))
            with patch.object(demo, 'local_context'), patch.object(demo, 'docker', return_value=json.dumps([self.info])) as command:
                with self.assertRaises(ValueError): demo.resume(directory, self.state['container'], 63865)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(command.call_args.args[0], 'inspect')

    def test_migration_guard_failure_prevents_child_process(self):
        with patch.object(demo, 'verified_original', side_effect=ValueError('guard')), patch.object(demo.subprocess, 'run') as child:
            with self.assertRaises(ValueError): demo.migrate('/unused', self.state['container'], 55432)
            child.assert_not_called()

    def test_migration_stage_contains_only_schema_and_migration_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'repo'
            source = root / 'backend/prisma'
            (source / 'migrations/001_init').mkdir(parents=True)
            (source / 'schema.prisma').write_text('datasource db {}')
            (source / 'migrations/migration_lock.toml').write_text('provider = "postgresql"')
            (source / 'migrations/001_init/migration.sql').write_text('SELECT 1;')
            (source / '.env').write_text('DO_NOT_COPY=private')
            target = Path(directory) / 'stage'
            target.mkdir()
            result = demo.stage_migrations(root, target)
            self.assertEqual(result['migrationCount'], 1)
            self.assertEqual(sorted(str(p.relative_to(target)) for p in target.rglob('*') if p.is_file()),
                             ['package.json', 'prisma/migrations/001_init/migration.sql', 'prisma/migrations/migration_lock.toml', 'prisma/schema.prisma'])

    def test_migration_child_environment_and_failure_redaction(self):
        state = dict(self.state, database_url=self.url)
        with patch.object(demo.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'P3009 secret ' + self.url)) as child:
            with self.assertRaises(demo.MigrationFailure) as failure:
                demo.migration_step(Path('/repo'), Path('/private-stage'), state, 'deploy')
            self.assertNotIn(self.state['password'], str(failure.exception))
            self.assertIn('P3009', str(failure.exception))
            kwargs = child.call_args.kwargs
            self.assertEqual(kwargs['cwd'], Path('/private-stage'))
            self.assertEqual(kwargs['env']['DATABASE_URL'], self.url)
            self.assertNotIn(self.url, str(child.call_args.args))
            self.assertTrue(kwargs['capture_output'])
            args = child.call_args.args[0]
            self.assertIn('--offline', args)
            self.assertIn('--yes=false', args)
            self.assertNotIn('reset', args)
            self.assertNotIn('seed', args)

    def test_migrate_rechecks_each_phase_and_never_runs_seed(self):
        state = dict(self.state, database_url=self.url)
        report = {'seed': 'NOT_RUN'}
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / 'stage'
            stage.mkdir()
            with patch.object(demo, 'verified_original', return_value=(state, self.info, report)) as guard, patch.object(demo.tempfile, 'mkdtemp', return_value=str(stage)), patch.object(demo, 'stage_migrations', return_value={'migrationCount': 1, 'sha256': {}}), patch.object(demo, 'migration_step') as child, redirect_stdout(io.StringIO()):
                result = demo.migrate(directory, self.state['container'], 55432)
            self.assertEqual(guard.call_count, 3)
            self.assertEqual([call.args[3] for call in child.call_args_list], ['deploy', 'status'])
            self.assertEqual(result['seed'], 'NOT_RUN')
            self.assertEqual(result['gate'], 'MIGRATIONS_DEPLOYED_NO_SEED')

    def test_migrate_deploy_failure_does_not_retry_or_run_status(self):
        state = dict(self.state, database_url=self.url)
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / 'stage'
            stage.mkdir()
            with patch.object(demo, 'verified_original', return_value=(state, self.info, {})), patch.object(demo.tempfile, 'mkdtemp', return_value=str(stage)), patch.object(demo, 'stage_migrations', return_value={'migrationCount': 1, 'sha256': {}}), patch.object(demo, 'migration_step', side_effect=demo.MigrationFailure('blocked')) as child, redirect_stdout(io.StringIO()):
                with self.assertRaises(demo.MigrationFailure): demo.migrate(directory, self.state['container'], 55432)
            self.assertEqual(child.call_count, 1)
            self.assertFalse((stage / 'result.json').exists())

    def test_valid_identity(self):
        self.assertEqual(demo.validate(self.state, self.info, self.url), 55432)

    def test_foreign_container_rejected(self):
        self.info['Id'] = 'd' * 64
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_wrong_label_rejected(self):
        self.info['Config']['Labels'][demo.LABEL] = 'other'
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_public_binding_rejected(self):
        self.info['NetworkSettings']['Ports']['5432/tcp'][0]['HostIp'] = '0.0.0.0'
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_host_volume_rejected(self):
        self.info['Mounts'][0]['Type'] = 'volume'
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_foreign_database_and_url_rejected(self):
        for url in [self.url.replace(self.state['database'], 'customers'), self.url + '?schema=public', self.url.replace('127.0.0.1', 'example.com'), self.url.replace(':55432/', ':5432/')]:
            with self.assertRaises(ValueError): demo.validate(self.state, self.info, url)

    def test_stopped_container_rejected(self):
        self.info['State']['Running'] = False
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)

    def test_wrong_name_or_image_rejected(self):
        self.info['Name'] = '/existing'
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)
        self.info['Name'] = '/' + self.state['name']
        self.info['Config']['Image'] = 'postgres:latest'
        with self.assertRaises(ValueError): demo.validate(self.state, self.info, self.url)


if __name__ == '__main__':
    unittest.main()
