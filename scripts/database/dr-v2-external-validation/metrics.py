"""Validate attested external observation contracts; never creates runtime proof."""
import math
import datetime as dt
import time
from contextlib import contextmanager
from contracts import Blocked, number, require, utc
import re

PHASES=('frontier_validation','host_loss_witness','target_provisioning','images_and_secrets',
        'repository_transfer','postgres_restore','wal_replay','historical_objects',
        'schema_migration_compatibility','backend_frontend_start','gis_ready','api_socket_health',
        'sales_reconciliation','receivables_reconciliation','inventory_reconciliation',
        'settlement_reconciliation','staging_service_validation','cleanup')


class PhaseRecorder:
    """For an independent observer; it measures, but cannot authenticate an adapter."""
    def __init__(self, clock_id):
        require(isinstance(clock_id,str) and bool(clock_id));self.clock_id=clock_id;self.records=[]

    @contextmanager
    def phase(self, name, evidence_sha256):
        require(name in PHASES and re.fullmatch(r'[a-f0-9]{64}',evidence_sha256 or ''))
        start=time.monotonic_ns();stamp=dt.datetime.now(dt.timezone.utc).isoformat();status='FAIL'
        try:
            yield
            status='PASS'
        finally:
            end=time.monotonic_ns()
            self.records.append({'phase':name,'observer_clock_id':self.clock_id,'status':status,
                                 'started_at':stamp,'finished_at':dt.datetime.now(dt.timezone.utc).isoformat(),
                                 'start_monotonic_ns':start,'end_monotonic_ns':end,
                                 'seconds':(end-start)/1e9,'evidence_sha256':evidence_sha256})


def validate_measurement(m):
    try:
        require(m['schema']=='dr2-measurement/v1')
        require(m['authenticated_external_receipts'] is True,'EXTERNAL_RECEIPTS_REQUIRED')
        require(m['source_host']!=m['target_host'] and m['source_loss_verified'] is True,'HOST_LOSS_REQUIRED')
        require(m['public_traffic_open'] is False and m['traffic_cutover_performed'] is False,'TRAFFIC_NOT_CLOSED')
        error=number(m['clock_error_seconds'],0,1)
        t0=utc(m['incident_utc']);frontier=utc(m['frontier_utc']);end=utc(m['service_utc'])
        elapsed=(end-t0).total_seconds();age=(t0-frontier).total_seconds()
        number(age);number(elapsed)
        require(isinstance(m['observer_clock_id'],str) and bool(m['observer_clock_id']))
        for k in ('incident_monotonic_ns','service_monotonic_ns'):require(type(m[k]) is int and m[k]>=0)
        mono=(m['service_monotonic_ns']-m['incident_monotonic_ns'])/1e9
        require(mono>=0 and abs(mono-elapsed)<=2*error,'CLOCK_DISAGREEMENT')
        require(len(m['phases'])==len(PHASES) and {p['phase'] for p in m['phases']}==set(PHASES),'SERVICE_PHASES_INCOMPLETE')
        for p in m['phases']:
            require(p['status']=='PASS' and re.fullmatch(r'[a-f0-9]{64}',p['evidence_sha256'] or ''))
            number(p['seconds'])
        rpo=age+2*error;rto=max(mono,elapsed)+2*error
        require(rpo<=300,'RPO_EXCEEDED');require(rto<=3600,'SERVICE_RTO_EXCEEDED')
    except (TypeError,KeyError,ValueError):raise Blocked('MEASUREMENT_INVALID') from None
    return {'status':'MEASUREMENT_CONTRACT_VALID_NOT_AUTHENTICATOR','rpo_upper_seconds':rpo,
            'rto_upper_seconds':rto,'production_authorized':False}


def validate_negative(v):
    try:
        require(v['injected'] is True and v['healthy_control'] is True,'INJECTION_NOT_PROVEN')
        require(v['expected_stage']==v['observed_stage'] and v['expected_code']==v['observed_code'] and
                v['observed_code'] not in ('GENERIC_EXCEPTION','TIMEOUT','UNKNOWN'),'CAUSAL_REJECTION_NOT_PROVEN')
        require(v['accepted'] is False and v['promoted'] is False and v['public_traffic_open'] is False,'INVALID_CANDIDATE_ACCEPTED')
        require(re.fullmatch(r'[a-f0-9]{64}',v['evidence_sha256'] or '') is not None,'EVIDENCE_REQUIRED')
    except (KeyError,TypeError):raise Blocked('NEGATIVE_EVIDENCE_INVALID') from None
    return {'status':'NEGATIVE_CONTRACT_VALID_NOT_RUNTIME_PROOF'}


def p95(values):
    for value in values:number(value)
    return sorted(values)[math.ceil(.95*len(values))-1] if len(values)>=20 else None
