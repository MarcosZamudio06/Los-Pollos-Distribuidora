import unittest
from unittest.mock import patch
from recovery import Rejection, RecoveryLab, accept_negative, validate_relative_path
from lab import Lab


class RecoveryContracts(unittest.TestCase):
    def test_only_expected_injected_failure_can_pass(self):
        e=Rejection('MISSING_OBJECT','object_preflight',{'native_code':'NoSuchVersion'})
        self.assertTrue(accept_negative(e,'MISSING_OBJECT','object_preflight',True))
        for code,stage,injected in [('WRONG_HASH','object_preflight',True),('MISSING_OBJECT','setup',True),('MISSING_OBJECT','object_preflight',False)]:
            with self.assertRaises(RuntimeError):accept_negative(e,code,stage,injected)

    def test_generic_exception_or_empty_native_evidence_is_not_rejection(self):
        for e in [RuntimeError('unrelated'),Rejection('MISSING_OBJECT','object_preflight',{})]:
            with self.assertRaises(RuntimeError):accept_negative(e,'MISSING_OBJECT','object_preflight',True)

    def test_materialization_rejects_traversal(self):
        for value in ['../a','/a','a/../../x','a//b','a/./b','']:
            with self.assertRaises(ValueError):validate_relative_path(value)
        self.assertEqual(validate_relative_path('archive/lab/16-1/file.zst'),'archive/lab/16-1/file.zst')

    def test_unrelated_repository_error_never_means_outage(self):
        obj=object.__new__(RecoveryLab);obj.probe_entry={}
        with patch.object(obj,'s3op',return_value={'ok':False,'native_code':'NoSuchKey'}):
            with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_REPOSITORY_FAILURE'):obj.probe_repository()

    def test_restore_pins_completed_backup_label_instead_of_second_granularity_selector(self):
        from recovery import restore_arguments
        payload={'target_time':'2026-10-28 03:41:50.550626+00','backup_label':'20261028-033804F'}
        self.assertIn('--set=20261028-033804F',restore_arguments(payload))
        self.assertIn('--target=2026-10-28 03:41:50.550626+00',restore_arguments(payload))

    def test_failure_origin_survives_cleanup_stage(self):
        obj=object.__new__(RecoveryLab);obj.result={'phases':[]};obj.active_scenario='positive';obj.stage='setup'
        with self.assertRaises(RuntimeError):obj.span('postgres_restore',lambda:(_ for _ in ()).throw(RuntimeError('native failure')))
        obj.stage='scenario_cleanup'
        self.assertEqual(obj.result['failure_origin']['stage'],'postgres_restore')

    def test_missing_native_timing_is_unknown_not_zero(self):
        from recovery import native_wal_timing
        self.assertIsNone(native_wal_timing('no INFO timing lines')['reported_ms'])
        self.assertEqual(native_wal_timing('archive-get command end: completed successfully (35ms)')['reported_ms'],35)

    def test_multiline_exec_events_omit_the_entire_command(self):
        obj=object.__new__(Lab);obj.redactions=[];obj.access='a-secret';obj.secret='b-secret'
        text=obj.sanitize('12 exec_start: python3 -c first\nhidden_argument\nlast signal= exitCode=\n13 exec_die signal= exitCode=2')
        self.assertNotIn('hidden_argument',text)
        self.assertIn('exitCode=2',text)


if __name__=='__main__':unittest.main()
