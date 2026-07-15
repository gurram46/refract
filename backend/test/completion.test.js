import assert from "node:assert/strict";
import test from "node:test";

import { computeCompletion, ALLOWED_COMPLETION_RULE_KINDS } from "../src/memory/completion.js";

function fixture(overrides = {}) {
  return {
    schemaVersion: 2,
    artifactVersion: 1,
    profileId: "local-learner-a1b2",
    topicId: "backend.go.concurrency",
    title: "When a Go Worker Queue Fills",
    learningObjectives: ["x"],
    experience: {
      mode: "guided-lab",
      primitive: {
        kind: "worker-queue",
        specVersion: 1,
        initialState: {
          producer: { id: "producer-1", status: "ready" },
          channel: { id: "jobs", capacity: 3, items: [] },
          workers: [{ id: "worker-1", status: "idle" }]
        }
      },
      snippets: [
        { id: "send-loop", language: "go", file: "main.go", code: "a\nb", editable: false, annotations: [] }
      ],
      chapters: [
        {
          id: "backpressure",
          title: "Backpressure",
          scenes: [
            {
              id: "buffer-fills",
              title: "The producer gets ahead",
              steps: [
                {
                  id: "send-blocks",
                  event: {
                    type: "channel.send-blocked",
                    target: "producer-1",
                    payload: { item: { id: "job-4", label: "J4" } }
                  },
                  focus: ["producer-1", "jobs"],
                  snippet: { id: "send-loop", lines: [1] },
                  caption: "c",
                  narration: "n",
                  animationPreset: "show-blocked",
                  checkpoint: {
                    kind: "prediction",
                    question: "What lets the producer continue?",
                    options: [
                      { id: "receive", label: "A worker receives a job" },
                      { id: "time", label: "Time passes automatically" }
                    ],
                    answer: "receive",
                    explanation: "Receiving frees one channel slot."
                  }
                }
              ]
            }
          ]
        }
      ],
      experiments: [
        { id: "worker-count", kind: "bounded-number", min: 1, max: 4, default: 1 },
        { id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, default: 3 }
      ],
      completionRules: [
        { kind: "required-scenes", sceneIds: ["buffer-fills"] },
        { kind: "required-checkpoints", stepIds: ["send-blocks"] }
      ]
    },
    lab: {
      kind: "code",
      language: "go",
      title: "Build a fair worker queue",
      files: [{ path: "main.go", starterCode: "package main\n" }],
      evaluation: { kind: "go-tests", testSetId: "worker-queue-v1" },
      trace: {
        supportedEvents: ["channel.send", "channel.send-blocked", "worker.receive", "worker.complete"],
        sourceMapRequired: true
      }
    },
    chat: { suggestedQuestions: ["Why?"] },
    next: [],
    ...overrides
  };
}

test("ALLOWED_COMPLETION_RULE_KINDS exposes the capability allowlist only", () => {
  assert.deepEqual([...ALLOWED_COMPLETION_RULE_KINDS].sort(), ["required-checkpoints", "required-scenes"]);
});

test("computeCompletion returns complete:false and lists all missing requirements when progress is empty", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: [],
    checkpointStepIds: []
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.satisfied, []);
  assert.ok(result.missing.length >= 2, "lists both required scenes and checkpoints");
  assert.ok(result.missing.some((m) => m.kind === "required-scenes" && m.missing.includes("buffer-fills")));
  assert.ok(result.missing.some((m) => m.kind === "required-checkpoints" && m.missing.includes("send-blocks")));
});

test("computeCompletion returns complete:true when all required scenes are completed and all required checkpoints answered", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);
  assert.ok(result.satisfied.length >= 2);
});

test("computeCompletion returns complete:false when a required scene is missing", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: [],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((m) => m.kind === "required-scenes"));
});

test("computeCompletion returns complete:false when a required checkpoint step has not been answered", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: []
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((m) => m.kind === "required-checkpoints"));
});

test("computeCompletion ignores progress for scenes and steps that are not required", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills", "not-required"],
    checkpointStepIds: ["send-blocks", "not-required"]
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);
});

test("computeCompletion treats a checkpoint step as answered when present in checkpointStepIds regardless of correctness flag", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, true);
});

test("computeCompletion handles a missing completionRules array as incomplete without throwing", () => {
  const artifact = fixture({ experience: { ...fixture().experience, completionRules: undefined } });
  const result = computeCompletion(artifact, { completedSceneIds: [], checkpointStepIds: [] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, []);
});

test("computeCompletion treats an empty completionRules array as incomplete", () => {
  const artifact = fixture({ experience: { ...fixture().experience, completionRules: [] } });
  const result = computeCompletion(artifact, {});
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((entry) => entry.kind === "invalid-rule"));
});

test("computeCompletion treats a null artifact as incomplete without throwing", () => {
  const result = computeCompletion(null, { completedSceneIds: ["buffer-fills"], checkpointStepIds: ["send-blocks"] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, []);
});

test("computeCompletion treats undefined progress as empty without throwing", () => {
  const result = computeCompletion(fixture(), undefined);
  assert.equal(result.complete, false);
  assert.ok(result.missing.length >= 2);
});

test("computeCompletion treats an unknown completion rule as incomplete", () => {
  const artifact = fixture({
    experience: {
      ...fixture().experience,
      completionRules: [
        { kind: "required-scenes", sceneIds: ["buffer-fills"] },
        { kind: "required-checkpoints", stepIds: ["send-blocks"] },
        { kind: "speculative-rule", sceneIds: ["buffer-fills"] }
      ]
    }
  });
  const result = computeCompletion(artifact, {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((entry) => entry.kind === "invalid-rule"));
});

test("computeCompletion treats a malformed declared rule as incomplete", () => {
  const artifact = fixture({
    experience: {
      ...fixture().experience,
      completionRules: [{ kind: "required-scenes", sceneIds: [] }]
    }
  });
  const result = computeCompletion(artifact, { completedSceneIds: ["buffer-fills"] });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((entry) => entry.kind === "required-scenes"));
});

test("computeCompletion reports per-rule missing and satisfied ids deterministically", () => {
  const artifact = fixture({
    experience: {
      ...fixture().experience,
      completionRules: [
        { kind: "required-scenes", sceneIds: ["buffer-fills", "second-scene"] },
        { kind: "required-checkpoints", stepIds: ["send-blocks"] }
      ]
    }
  });
  const result = computeCompletion(artifact, {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, false);
  const scenes = result.missing.find((m) => m.kind === "required-scenes");
  assert.deepEqual(scenes.missing, ["second-scene"]);
  assert.deepEqual(scenes.satisfied, ["buffer-fills"]);
  const checkpoints = result.satisfied.find((m) => m.kind === "required-checkpoints");
  assert.deepEqual(checkpoints.missing, []);
  assert.deepEqual(checkpoints.satisfied, ["send-blocks"]);
});

test("computeCompletion ignores malformed progress ids that are not strings", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills", 42, null, ""],
    checkpointStepIds: ["send-blocks", {}, ""]
  });
  assert.equal(result.complete, true);
});

test("computeCompletion only recognizes a scene as required if declared in the artifact scenes (missing reference is unsatisfiable)", () => {
  const artifact = fixture({
    experience: {
      ...fixture().experience,
      completionRules: [
        { kind: "required-scenes", sceneIds: ["nonexistent-scene"] },
        { kind: "required-checkpoints", stepIds: ["send-blocks"] }
      ]
    }
  });
  const result = computeCompletion(artifact, {
    completedSceneIds: ["nonexistent-scene"],
    checkpointStepIds: ["send-blocks"]
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((m) => m.kind === "required-scenes" && m.missing.includes("nonexistent-scene")));
});

test("computeCompletion only recognizes a required checkpoint step if it actually carries a checkpoint", () => {
  const artifact = fixture({
    experience: {
      ...fixture().experience,
      completionRules: [
        { kind: "required-scenes", sceneIds: ["buffer-fills"] },
        { kind: "required-checkpoints", stepIds: ["step-without-checkpoint"] }
      ]
    }
  });
  const result = computeCompletion(artifact, {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["step-without-checkpoint"]
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.some((m) => m.kind === "required-checkpoints" && m.missing.includes("step-without-checkpoint")));
});

test("computeCompletion returns complete:false when a required-scenes reference points to an undeclared scene and is unsatisfiable", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks", "nonexistent-step"]
  });
  assert.equal(result.complete, true);
  const checkpointRule = result.satisfied.find((s) => s.kind === "required-checkpoints");
  assert.deepEqual(checkpointRule.satisfied, ["send-blocks"]);
});

test("computeCompletion output is serializable JSON-safe (no functions, cycles, or secrets)", () => {
  const result = computeCompletion(fixture(), {
    completedSceneIds: ["buffer-fills"],
    checkpointStepIds: ["send-blocks"]
  });
  const serialized = JSON.stringify(result);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.complete, true);
  assert.ok(!serialized.toLowerCase().includes("secret"));
  assert.ok(!serialized.toLowerCase().includes("api_key"));
});
