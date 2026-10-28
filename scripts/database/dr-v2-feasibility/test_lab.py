import copy
import hashlib
import hmac
import unittest
import tempfile
import subprocess
from pathlib import Path
from unittest.mock import patch
from lab import Lab, authenticate, canonical, validate_bytes


class Contracts(unittest.TestCase):
    def setUp(self):
        self.key=b'ephemeral-unit-test-only'
        self.payload={'company':'lab-company-a','objects':[]}
        self.envelope={'payload':self.payload,'signature':hmac.new(self.key,canonical(self.payload),hashlib.sha256).hexdigest()}

    def test_authentic_catalog(self):
        self.assertEqual(authenticate(self.envelope,self.key),self.payload)

    def test_tamper(self):
        e=copy.deepcopy(self.envelope);e['payload']['objects']=['tampered']
        with self.assertRaisesRegex(ValueError,'AUTHENTICATION'):authenticate(e,self.key)

    def test_wrong_key(self):
        with self.assertRaises(ValueError):authenticate(self.envelope,b'wrong')

    def test_company_denial(self):
        with self.assertRaisesRegex(ValueError,'COMPANY'):authenticate(self.envelope,self.key,'lab-company-b')

    def test_exact_bytes(self):
        validate_bytes(b'original',{'sha256':hashlib.sha256(b'original').hexdigest(),'size':8,'mime':'image/png'},'image/png')

    def test_hash_size_and_mime_fail_closed(self):
        base={'sha256':hashlib.sha256(b'original').hexdigest(),'size':8,'mime':'image/png'}
        for field,value in [('sha256','0'*64),('size',9),('mime','text/plain')]:
            with self.subTest(field=field):
                bad=dict(base);bad[field]=value
                with self.assertRaises(ValueError):validate_bytes(b'original',bad,'image/png')

    def test_canonical_order(self):
        self.assertEqual(canonical({'b':2,'a':1}),canonical({'a':1,'b':2}))


class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.lab=Lab(str(Path(self.tmp.name)/'evidence'),32768)

    def tearDown(self):
        if hasattr(self.lab,'private'):self.lab.private.cleanup()
        self.tmp.cleanup()

    def test_readiness_never_uses_bootstrap_unix_socket(self):
        calls=[]
        def cmd(*args,**kwargs):
            calls.append(args)
            if 'pg_isready' in args and '-h' not in args:return (0,'bootstrap socket ready')
            if 'pg_isready' in args:return (0,'TCP ready')
            return (0,'f')
        with patch.object(self.lab,'cmd',side_effect=cmd):self.lab.waitsql('owned')
        for call in calls:
            if 'pg_isready' in call or 'psql' in call:
                self.assertIn('-h',call);self.assertIn('127.0.0.1',call)

    def test_schema_and_full_payload_are_separate_stages(self):
        calls=[]
        def sql(name,query):
            calls.append((self.lab.stage,query))
            return '32768|1024|1024|33554432' if query.startswith('SELECT count') else ''
        with patch.object(self.lab,'sql',side_effect=sql):
            self.lab.create_schema('owned');self.lab.load_payload('owned')
        self.assertEqual([stage for stage,_ in calls],['schema_creation','synthetic_payload_load','synthetic_payload_verify'])
        self.assertNotIn('CREATE TABLE payload',calls[0][1])
        self.assertIn('32768',calls[1][1]);self.assertIn('generate_series(1,32)',calls[1][1])

    def test_timeout_persists_redacted_failure_without_raw_argv(self):
        secret=self.lab.secret
        with patch('lab.subprocess.run',side_effect=subprocess.TimeoutExpired(['docker','secret='+secret],1,output=secret,stderr='failed')):
            with self.assertRaisesRegex(RuntimeError,'TIMEOUT'):
                self.lab.cmd('exec','owned','psql',timeout=1)
        text=(self.lab.root/'commands.jsonl').read_text()
        self.assertNotIn(secret,text);self.assertIn('TIMEOUT',text)
        self.assertIn('elapsed_seconds',text)

    def test_secrets_not_persisted_in_evidence_directory(self):
        self.assertFalse((self.lab.root/'catalog-auth.bin').exists())

    def test_diagnostics_are_scoped_and_do_not_inspect_environment(self):
        self.lab.names=[self.lab.prefix+'-source',self.lab.prefix+'-s3']
        calls=[]
        def cmd(*args,**kwargs):calls.append(args);return (0,'{}')
        with patch.object(self.lab,'cmd',side_effect=cmd):self.lab.diagnostics('failure')
        self.assertTrue(any(c[0]=='logs' for c in calls))
        for c in calls:
            if c[0]=='inspect':self.assertIn('--format',c);self.assertNotIn('.Config.Env',' '.join(c))
            if c[0]=='events':self.assertIn('--filter',c)

    def test_cleanup_continues_after_container_exception(self):
        self.lab.names=[self.lab.prefix+'-a',self.lab.prefix+'-b']
        self.lab.volumes=[self.lab.prefix+'-data'];self.lab.net_created=True
        calls=[]
        def cmd(*args,**kwargs):
            calls.append(args)
            if 'inspect' in args:return (0,self.lab.prefix)
            if args[:2]==('rm','-f') and args[-1].endswith('-b'):raise OSError('daemon lost')
            return (0,'')
        with patch.object(self.lab,'cmd',side_effect=cmd):self.lab.cleanup()
        self.assertEqual(self.lab.result['cleanup'],'FAILED')
        self.assertTrue(any(c[:2]==('volume','rm') for c in calls))
        self.assertTrue(any(c[:2]==('network','rm') for c in calls))

    def test_diagnostics_failure_does_not_prevent_other_service_capture(self):
        self.lab.names=[self.lab.prefix+'-source',self.lab.prefix+'-s3']
        def cmd(*args,**kwargs):
            if args[0]=='logs':raise OSError('logs unavailable')
            return (0,'{}')
        with patch.object(self.lab,'cmd',side_effect=cmd):self.lab.diagnostics('failure')
        import json
        d=json.loads((self.lab.root/'diagnostics-failure.json').read_text())
        self.assertEqual(len(d['containers']),2)

    def test_redacts_private_material_and_connection_urls(self):
        text=self.lab.sanitize(self.lab.secret+' password=not-for-evidence postgresql://user:pass@host/db '+
            '-----BEGIN PRIVATE KEY-----\nprivate bytes\n-----END PRIVATE KEY-----')
        for value in [self.lab.secret,'not-for-evidence','user:pass','private bytes']:self.assertNotIn(value,text)

    def test_cleanup_refuses_other_owner(self):
        self.lab.names=[self.lab.prefix+'-source']
        calls=[]
        with patch.object(self.lab,'cmd',side_effect=lambda *a,**k:calls.append(a) or (0,'another-owner')):
            self.lab.cleanup()
        self.assertEqual(self.lab.result['cleanup'],'FAILED')
        self.assertFalse(any(c[0]=='rm' for c in calls))

    def test_event_action_cannot_leak_exec_arguments(self):
        value=self.lab.sanitize('123 exec_create: program --password hidden signal= exitCode=\n124 exec_die signal= exitCode=2')
        self.assertNotIn('hidden',value)
        self.assertIn('exec_create:[COMMAND_OMITTED]',value)
        self.assertIn('exitCode=2',value)


if __name__=='__main__':unittest.main()
