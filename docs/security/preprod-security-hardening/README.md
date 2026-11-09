# Preproduction security candidate — review handoff

**Preparation only. No independent approval, commit, publication or production GO.**

This directory retains a deliberately small, sanitized evidence handoff outside
the ignored `Audit/` directory. It is intended for a future authorized review/PR,
not a runtime dependency or a substitute for fresh CI and independent inspection.
The historical reports and raw local evidence remain unchanged in Audit.

## What to inspect

1. `initial-candidate.json`: all 47 initial paths, content hashes, modes,
   cumulative change counts, reasons and remediation history. All fourteen
   initial untracked files are included; tracked-only diffs are insufficient.
2. `verification.json`: bounded check outcomes, their scopes, remaining risks
   and the source-manifest binding. It deliberately contains no raw argv,
   workstation paths, usernames, database credentials, tokens or full logs.
3. The complete candidate diff, including intended new files, and the current
   `Audit/ERP-PREPROD-CANDIDATE-HARDENING-001.md` local report.

The source-manifest binding excludes this derived handoff directory to avoid
self-referential hashes. The local full manifest additionally covers these
handoff files. Hashes establish custody; they never constitute a review receipt.

## Evidence retention

Keep the original RED results, failed preparations, sanitized terminal logs,
image inventories and checksums in controlled operator storage. Do not copy the
whole Audit tree into Git or change `.gitignore` automatically. When publication
is authorized, attach a reviewed sanitized evidence archive as an access-controlled
CI artifact bound to that exact commit, with the full manifest and checksums.
Artifact upload, storage access and retention require operator approval; none
is provisioned or uploaded by this preparation task. The committed handoff is
only an index/summary, and no permanent test may depend on Audit or an old
temporary source copy.

## Proposed PR sequence — not executed

- Proposed branch: `preprod/security-hardening`; proposed target: `main`.
- Require explicit authorization before creating/switching the branch, staging,
  committing, pushing, opening a PR or merging. Preserve the dirty tree/index
  until then. Use conventional commits without AI attribution.
- Freeze all intended files and normalize before independent review. Include
  all initial untracked policy/session/test/client/runner files and subsequent
  hardening files. Review authorization, realtime isolation/recovery, generic
  authentication errors and bounded health work as one integrated security
  candidate; separate dependency/packaging and typing hunks for reviewer focus.
- Follow only supported native review transitions. An inaccessible native route
  is not bypassed by fabricating a receipt or silently substituting PR review.
  A PR-based alternative requires an explicit documented operator decision.
- Obtain independent security review and run Quality Gate on the **new** exact
  commit. An older main SHA's green check approves neither this worktree nor a
  later commit. Capture branch-protection requirements with sufficient access;
  a 403 is unknown state, not proof of protection.
- Before merge, resolve or explicitly disposition all documented blockers,
  preserve test/coverage/security thresholds, and verify migration/bootstrap,
  image inventory, Caddy, health, package locks and secret scans.
- Main merge can trigger Release Images. Confirm that consequence and the real
  approved public origin before authorizing merge/publication. Do not invent a
  public origin to make release validation succeed. Local loopback test images
  are not deployable release artifacts.
- Eventual publication requires immutable registry digests and a consistent
  digest manifest for the exact validated SHA. Deployment remains a separate
  authorization; no production GO follows from this PR preparation.

## Required checks before merge

Quality Gate/CI Gate; backend/frontend lint and production typecheck; explicitly
dispositioned full-test TypeScript debt; coverage at unchanged thresholds;
security001/002/003 and related functional regressions on disposable PostgreSQL;
frozen npm/pnpm installations; Prisma/schema/migration checks; dependency and
secret scans; supported workflow/script contracts; image/toolchain inventory;
independent candidate acceptance. Full commercial-screen Chromium, production
HTTPS/proxy/load and operational acceptance remain separate evidence tiers.
