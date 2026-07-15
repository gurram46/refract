import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITIES, isRecognizedVisualKind, getRecognizedVisualKinds } from "./artifactCapabilities.js";

test("recognizes every schema-1 visual kind from the shared manifest", () => {
  for (const kind of CAPABILITIES.visualKinds.schema1) {
    assert.equal(isRecognizedVisualKind(kind), true, `${kind} must be recognized`);
  }
});

test("rejects unknown visual kinds", () => {
  assert.equal(isRecognizedVisualKind("stack"), false);
  assert.equal(isRecognizedVisualKind("tree"), false);
  assert.equal(isRecognizedVisualKind("graph"), false);
  assert.equal(isRecognizedVisualKind("flowchart"), false);
  assert.equal(isRecognizedVisualKind("sequence"), false);
  assert.equal(isRecognizedVisualKind("timeline"), false);
});

test("does not recognize schema-2 visual kinds (none implemented)", () => {
  assert.deepEqual(CAPABILITIES.visualKinds.schema2, []);
});

test("projection exactly matches expected manifest values (backend/frontend agreement)", () => {
  assert.deepEqual(CAPABILITIES.schemaVersions, [1, 2]);
  assert.deepEqual(CAPABILITIES.visualKinds.schema1, ["queue"]);
  assert.deepEqual(CAPABILITIES.visualKinds.schema2, []);

  assert.deepEqual(CAPABILITIES.primitiveKinds, ["worker-queue"]);

  assert.deepEqual(CAPABILITIES.semanticEventTypes, [
    "channel.send", "channel.send-blocked", "worker.receive", "worker.complete"
  ]);

  assert.deepEqual(CAPABILITIES.animationPresets, [
    "enqueue-from-producer", "show-blocked", "dequeue-to-worker", "worker-complete", "idle"
  ]);

  assert.deepEqual(CAPABILITIES.traceEvents, [
    "channel.send", "channel.send-blocked", "worker.receive", "worker.complete"
  ]);

  assert.deepEqual(CAPABILITIES.labKinds, ["code"]);
  assert.deepEqual(CAPABILITIES.checkpointKinds, ["prediction"]);
  assert.deepEqual(CAPABILITIES.experimentKinds, ["bounded-number"]);
  assert.deepEqual(CAPABILITIES.experimentIds, ["worker-count", "channel-capacity"]);
  assert.deepEqual(CAPABILITIES.experienceModes, ["guided-lab"]);
  assert.deepEqual(CAPABILITIES.completionRuleKinds, ["required-scenes", "required-checkpoints"]);
  assert.deepEqual(CAPABILITIES.evaluationKinds, ["go-tests"]);
  assert.deepEqual(CAPABILITIES.primitiveStatuses, ["ready", "idle", "busy", "blocked"]);
  assert.deepEqual(CAPABILITIES.primitiveSpecVersions, [1]);

  assert.deepEqual(CAPABILITIES.eventTargetRoles, {
    "channel.send": ["channel"],
    "channel.send-blocked": ["producer"],
    "worker.receive": ["worker"],
    "worker.complete": ["worker"]
  });
});

test("getRecognizedVisualKinds returns schema-1 set", () => {
  const kinds = getRecognizedVisualKinds();
  assert.deepEqual(kinds.sort(), [...CAPABILITIES.visualKinds.schema1].sort());
});

test("frontend projection structure is frozen and immutable", () => {
  assert.throws(() => { CAPABILITIES.primitiveKinds = ["evil"]; }, TypeError);
  assert.throws(() => { CAPABILITIES.visualKinds.schema1.push("flowchart"); }, TypeError);
});
