#!/usr/bin/env python3
"""Publish only bounded, sanitized diagnostics from a disposable REM003 run."""
import json, os, pathlib, re, sys
source, destination = map(pathlib.Path, sys.argv[1:3])
destination.mkdir(parents=True, exist_ok=True)
allowed = ['diagnostics/*-state.json', 'diagnostics/*.log', 'diagnostics/*-permissions.txt',
           'diagnostics/readiness.json', 'diagnostics/host-memory.json', 'diagnostics/index.json',
           'evidence/resistance.json', 'evidence/resistance-operations.json',
           'evidence/resistance-cycles.json', 'evidence/resistance-http.json',
           'evidence/planner-browser.json', 'evidence/new-process-persistence.json']
secrets = [v for k,v in os.environ.items() if re.search(r'SECRET|PASSWORD|TOKEN|ACCESS_KEY|DATABASE_URL|BROWSER_WS', k) and len(v)>3]
for pattern in allowed:
    for path in source.glob(pattern):
        if not path.is_file() or path.stat().st_size > 8_000_000:
            continue
        text = path.read_text(errors='replace')
        for value in secrets:
            text = text.replace(value, '[REDACTED]')
        for value in [str(source), os.environ.get('GITHUB_WORKSPACE',''), str(pathlib.Path.home())]:
            if value: text = text.replace(value, '[LOCAL_PATH]')
        text = re.sub(r'Bearer\s+\S+|postgres(?:ql)?://[^\s"\x27]+|wss?://[^\s"\x27]+', '[REDACTED]', text)
        text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED]', text)
        target = destination / path.name
        target.write_text(text)
(destination/'scope.json').write_text(json.dumps({'disposable':True,'productionData':False,'rawEnvironmentIncluded':False}))
