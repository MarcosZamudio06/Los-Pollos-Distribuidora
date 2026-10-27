import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const library = resolve("scripts/erp-ci-gis.sh");
function shell(code) {
  const dir = mkdtempSync(resolve(tmpdir(), "gis-contract-"));
  const child = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -euo pipefail; source "$1"; GIS_DIAG_DIR="$2"; photon=p; osrm=o; vroom=v; PHOTON_URL=http://127.0.0.1:1; OSRM_URL=$PHOTON_URL; VROOM_URL=$PHOTON_URL; ${code}`,
      "contract",
      library,
      dir,
    ],
    { encoding: "utf8" },
  );
  return { ...child, dir };
}
test("a dead GIS container fails immediately and retains safe state/logs", () => {
  const result = shell(
    `fake_docker() { case "$*" in *State.Running*) echo false;; *State*) echo '{"Running":false,"ExitCode":77,"OOMKilled":false}';; *logs*) echo provider-exited;; esac; }; docker_bin=fake_docker; gis_readiness 90; echo CHROMIUM_STARTED`,
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes("CHROMIUM_STARTED"));
  assert.equal(
    JSON.parse(readFileSync(resolve(result.dir, "photon-state.json"), "utf8"))
      .ExitCode,
    77,
  );
  assert.match(
    readFileSync(resolve(result.dir, "photon.log"), "utf8"),
    /provider-exited/,
  );
});
test("a running but never-ready GIS stack fails its explicit deadline", () => {
  const result = shell(
    `fake_docker() { case "$*" in *State.Running*) echo true;; *State*) echo '{}';; esac; }; docker_bin=fake_docker; curl() { echo 000; return 7; }; gis_readiness 0; echo CHROMIUM_STARTED`,
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes("CHROMIUM_STARTED"));
  assert.equal(
    JSON.parse(readFileSync(resolve(result.dir, "readiness.json"), "utf8"))
      .photon,
    false,
  );
});
test("port lookup failures cannot be hidden by export", () => {
  const result = shell(
    `fake_docker() { case "$*" in *State.Running*) echo true;; *port*) return 19;; esac; }; docker_bin=fake_docker; URL="$(gis_url p 2322 photon)"; export URL; echo CHROMIUM_STARTED`,
  );
  assert.equal(result.status, 19);
  assert.ok(!result.stdout.includes("CHROMIUM_STARTED"));
});
test("diagnostic export removes secrets and never copies raw env files", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "gis-sanitize-"));
  mkdirSync(resolve(dir, "diagnostics"));
  const secret = "unique-secret-value-123456";
  writeFileSync(
    resolve(dir, "diagnostics/photon.log"),
    `${secret} Bearer fake-token postgresql://private:password@localhost/db key=original-command`,
  );
  writeFileSync(resolve(dir, "private.env"), "not-for-upload");
  const out = resolve(dir, "out");
  const result = spawnSync(
    "python3",
    ["scripts/export-rem003-diagnostics.py", dir, out],
    { env: { ...process.env, JWT_ACCESS_SECRET: secret }, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  const content = readFileSync(resolve(out, "photon.log"), "utf8");
  assert.ok(!content.includes(secret));
  assert.ok(!content.includes("fake-token"));
  assert.ok(!content.includes("password@"));
  assert.match(content, /original-command/);
});

test("both GIS runners retain non-root owned indexes and mandatory readiness", () => {
  for (const number of ["003", "004"]) {
    const runner = readFileSync(
      `scripts/test-erp-functional-remediation-${number}.sh`,
      "utf8",
    );
    assert.match(runner, /source "\$repo\/scripts\/erp-ci-gis\.sh"/);
    assert.match(runner, /volume create/);
    assert.ok(runner.includes('-v "$gis/photon:/source:ro"'));
    assert.ok(runner.includes("chown -R 1000:1000 /data"));
    assert.ok(runner.includes("gis_readiness 90"));
    assert.ok(runner.includes('volume rm "$photon_volume"'));
    assert.ok(!runner.includes('cp -R "$gis/photon" "$scratch/photon"'));
    assert.ok(!runner.includes('run --rm -d --name "$photon"'));
  }
});
