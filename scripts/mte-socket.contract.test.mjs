import assert from "node:assert/strict";
import test from "node:test";
import {
  fleetNamespaceRejected,
  transportDiagnostic,
} from "../backend/test/mte-socket-contract.ts";

test("namespace middleware CONNECT_ERROR is explicit rejection", () => {
  assert.equal(
    fleetNamespaceRejected([
      '44/fleet,{"message":"Unauthorized socket session"}',
    ]),
    true,
  );
});
test("transport close, timeout, HTTP errors and an accepted namespace are not authorization proof", () => {
  for (const packets of [
    ["1"],
    ["41/fleet,"],
    ["HTTP 400"],
    [],
    ['40/fleet,{"sid":"synthetic"}'],
    ["44/fleet,broken"],
  ])
    assert.equal(fleetNamespaceRejected(packets), false);
});
test("transport diagnostics never serialize exception messages, URL, body or arbitrary codes", () => {
  const diagnostic = transportDiagnostic(
    {
      name: "TypeError",
      message: "Bearer secret",
      cause: { code: "ECONNREFUSED", message: "token secret" },
    },
    "namespace-poll",
    5001.1,
  );
  assert.deepEqual(JSON.parse(diagnostic), {
    phase: "namespace-poll",
    durationMs: 5001,
    name: "TypeError",
    code: "ECONNREFUSED",
  });
  assert.ok(
    !transportDiagnostic(
      { name: "secret", cause: { code: "secret" } },
      "engine-open",
      1,
    ).includes("secret"),
  );
});
