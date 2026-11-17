import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const runner = read("scripts/test-ci003-evidence-concurrency.sh");
const workflow = read(".github/workflows/quality-gate.yml");
const database = workflow.split("\n  database:")[1].split("\n  functional:")[0];
const gateScript = workflow.split("\n  gate:")[1].split("        run: |\n")[1];

const fakeTool = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const a = process.argv.slice(2), kind = process.env.FAKE_TOOL;
const state = JSON.parse(fs.readFileSync(process.env.STATE, 'utf8'));
const record = event => fs.appendFileSync(process.env.TRACE, JSON.stringify(event)+'\\n');
const save = () => fs.writeFileSync(process.env.STATE, JSON.stringify(state));
if (kind === 'npm') {
  if (a.includes('test')) { record({command:'jest'}); process.exit(Number(process.env.JEST_EXIT)); }
  process.exit(0);
}
const verb = a[0], value = flag => a[a.indexOf(flag)+1];
const find = id => Object.values(state).find(x=>x.id===id || x.name===id);
if (verb === 'run') {
  const name=value('--name'), label=a.filter((x,i)=>a[i-1]==='--label').find(x=>x.startsWith('ci003.owner='));
  const id=crypto.createHash('sha256').update(name).digest('hex');
  state[name]={name,id,owner:label?.split('=')[1],running:true};
  if (process.env.SCENARIO==='foreign' && name.endsWith('-pg')) state[name].owner='foreign';
  save(); record({command:'run',id}); console.log(id);
  if (process.env.SCENARIO==='run-error' && name.endsWith('-storage'))process.exit(23);
} else if (verb === 'port') {
  console.log('127.0.0.1:'+process.env.PORT);
} else if (verb === 'ps') {
  const filter=value('--filter');
  if (process.env.SCENARIO==='absent') { for(const key of Object.keys(state))delete state[key]; save(); }
  for(const x of Object.values(state))if(filter===('name=^/'+x.name+'$')||filter===('id='+x.id))console.log(x.id);
} else if (verb === 'inspect') {
  if (process.env.SCENARIO==='inspect-error')process.exit(32);
  const x=find(a.at(-1)); if (!x)process.exit(1); console.log(x.owner ?? '');
} else if (verb === 'stop' || verb === 'rm') {
  const x=find(a.at(-1)); record({command:verb,id:a.at(-1),owner:x?.owner});
  if (process.env.SCENARIO==='docker-error')process.exit(31);
  if (!x)process.exit(1);
  if (verb==='stop')x.running=false; else delete state[x.name]; save();
} else if (verb !== 'exec')process.exit(99);
`;

async function runFixture({
  scenario = "success",
  jestExit = 0,
  port = 1,
  stalled = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ci003-runner-contract-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "backend"));
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "backend/test"));
    writeFileSync(
      join(dir, "backend/test/no-local-env.cjs"),
      "// No dotenv files exist in this contract fixture.\n",
    );
    writeFileSync(join(dir, "scripts/runner.sh"), runner);
    writeFileSync(join(dir, "tool.cjs"), fakeTool);
    const executable = (name, body) =>
      writeFileSync(join(dir, "bin", name), `#!/bin/sh\n${body}\n`, {
        mode: 0o755,
      });
    executable("docker", 'FAKE_TOOL=docker exec "$NODE_EXE" "$TOOL" "$@"');
    executable("npm", 'FAKE_TOOL=npm exec "$NODE_EXE" "$TOOL" "$@"');
    executable("sleep", "exit 0");
    executable("seq", "echo 1"); // One probe in the fixture; production keeps its finite budget.
    executable("curl", stalled ? 'exec /usr/bin/curl "$@"' : "exit 0");
    writeFileSync(join(dir, "state"), "{}");
    writeFileSync(join(dir, "trace"), "");
    const child = spawn("/bin/bash", [join(dir, "scripts/runner.sh")], {
      env: {
        PATH: `${join(dir, "bin")}:/bin:/usr/bin:${process.env.PATH}`,
        HOME: dir,
        DOCKER_BIN: join(dir, "bin/docker"),
        NODE_EXE: process.execPath,
        TOOL: join(dir, "tool.cjs"),
        STATE: join(dir, "state"),
        TRACE: join(dir, "trace"),
        SCENARIO: scenario,
        JEST_EXIT: String(jestExit),
        PORT: String(port),
        TMPDIR: dir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }, 7000);
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (status, signal) => resolve({ status, signal }));
    });
    clearTimeout(timer);
    return {
      ...result,
      stdout,
      stderr,
      state: JSON.parse(readFileSync(join(dir, "state"), "utf8")),
      trace: readFileSync(join(dir, "trace"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [scenario, jestExit, expected] of [
  ["success", 0, 0],
  ["success", 7, 7],
  ["docker-error", 0, 1],
  ["docker-error", 7, 7],
  ["absent", 0, 0],
  ["foreign", 0, 1],
  ["run-error", 0, 23],
  ["inspect-error", 0, 1],
]) {
  test(`runner exit and ownership: ${scenario}, Jest ${jestExit}`, async () => {
    const result = await runFixture({ scenario, jestExit });
    assert.equal(result.status, expected, result.stderr);
    if (["success", "absent", "run-error"].includes(scenario))
      assert.deepEqual(result.state, {});
    if (scenario === "foreign") {
      const foreign = Object.values(result.state).find(
        (x) => x.owner === "foreign",
      );
      assert.ok(foreign);
      assert.ok(
        !result.trace.some(
          (x) => ["stop", "rm"].includes(x.command) && x.id === foreign.id,
        ),
      );
    }
    if (scenario === "docker-error") {
      assert.match(result.stderr, /cleanup failed/u);
      if (jestExit) assert.match(result.stderr, /command_exit=7/u);
    }
    if (["run-error", "inspect-error"].includes(scenario))
      assert.ok(
        !result.trace.some(
          (x) => x.command === "jest" && scenario === "run-error",
        ),
      );
    if (scenario === "inspect-error")
      assert.ok(!result.trace.some((x) => ["stop", "rm"].includes(x.command)));
  });
}

test("an accepted connection with no response times out, skips Jest and cleans owned resources", async () => {
  const sockets = new Set();
  let accepted = 0;
  const server = createServer((socket) => {
    accepted++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const started = Date.now();
    const result = await runFixture({
      port: server.address().port,
      stalled: true,
    });
    assert.ok(accepted > 0, "the endpoint must really accept the connection");
    assert.equal(result.status, 1, result.stderr);
    assert.ok(
      Date.now() - started < 6000,
      "readiness must be bounded, not killed by fixture timeout",
    );
    assert.ok(!result.trace.some((x) => x.command === "jest"));
    assert.deepEqual(result.state, {});
    assert.equal(result.trace.filter((x) => x.command === "rm").length, 2);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the database job requires the isolated six-case runner within its time budget", () => {
  assert.match(database, /timeout-minutes: 20/u);
  assert.match(
    database,
    /- name: Run six mandatory PostgreSQL and S3 evidence regressions\n\s+timeout-minutes: 5\n\s+run: bash scripts\/test-ci003-evidence-concurrency\.sh/u,
  );
  assert.ok(
    database.includes(
      "node --test scripts/ci003-evidence-runner.contract.test.mjs",
    ),
  );
  assert.doesNotMatch(
    database,
    /continue-on-error|--testNamePattern|--passWithNoTests/u,
  );
  assert.match(
    workflow.split("\n  gate:")[1],
    /needs: \[[^\]]*database[^\]]*\]/u,
  );
});

test("the exact CI Gate predicate rejects database failure, cancellation and skipping", () => {
  for (const databaseResult of ["success", "failure", "cancelled", "skipped"]) {
    const env = Object.fromEntries(
      [
        "QUALITY",
        "DATABASE",
        "FUNCTIONAL",
        "BROWSER",
        "DOCKER",
        "SECURITY",
        "ISOLATION",
        "DISASTER_RECOVERY",
      ].map((key) => [
        `${key}_RESULT`,
        key === "DATABASE" ? databaseResult : "success",
      ]),
    );
    const result = spawnSync(
      "/bin/bash",
      ["-euo", "pipefail", "-c", gateScript],
      { env, encoding: "utf8" },
    );
    assert.equal(
      result.status,
      databaseResult === "success" ? 0 : 1,
      result.stderr,
    );
  }
});
