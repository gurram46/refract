import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";

const FIXTURE_ARTIFACT = {
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
    snippets: [],
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
                event: { type: "channel.send-blocked", target: "producer-1", payload: { item: { id: "job-4", label: "J4" } } },
                focus: ["producer-1", "jobs"],
                snippet: { id: "snippet", lines: [1] },
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
    trace: { supportedEvents: ["channel.send"], sourceMapRequired: true }
  },
  chat: { suggestedQuestions: [] },
  next: []
};

function fakeArtifactGenerator({ status = "cached", artifact = FIXTURE_ARTIFACT } = {}) {
  return {
    async generate() { return { status: "generated", artifact }; },
    async get() { return { status, artifact }; }
  };
}

function fakeSessionStore(session = {}) {
  return {
    async get() {
      return {
        profileId: "local-learner-a1b2",
        topicId: "backend.go.concurrency",
        canvasState: null,
        recentEvents: [],
        code: null,
        latestRunResult: null,
        traceEvents: [],
        chatMessages: [],
        chatSummary: null,
        currentStep: null,
        progress: null,
        ...session
      };
    },
    async update(profileId, topicId, patch) {
      return { profileId, topicId, ...this.get(), ...patch };
    }
  };
}

function startServer(app) {
  return new Promise((resolve, reject) => {
    app.on("error", reject);
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function request(app, method, pathname, body) {
  const server = await startServer(app);
  try {
    const url = `http://127.0.0.1:${server.address().port}${pathname}`;
    const init = { method, headers: {} };
    if (method !== "GET") {
      init.headers["content-type"] = "application/json";
      init.body = body !== undefined ? JSON.stringify(body) : "";
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch {}
    }
    return { status: response.status, body: parsed };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /artifact-runtime/:profileId/:topicId/completion returns 503 when generator is unavailable", async () => {
  const app = createApp({ sessionStore: fakeSessionStore() });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 503);
  assert.equal(body.error, "Artifact generator is not available");
});

test("GET /artifact-runtime/:profileId/:topicId/completion returns 404 when artifact is not generated", async () => {
  const app = createApp({
    artifactGenerator: fakeArtifactGenerator({ status: "not_generated" }),
    sessionStore: fakeSessionStore()
  });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 404);
  assert.equal(body.code, "ARTIFACT_NOT_GENERATED");
});

test("GET /artifact-runtime/:profileId/:topicId/completion returns complete:false when progress is empty", async () => {
  const app = createApp({
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 200);
  assert.equal(body.complete, false);
  assert.ok(body.missing.some((m) => m.kind === "required-scenes" && m.missing.includes("buffer-fills")));
  assert.ok(body.missing.some((m) => m.kind === "required-checkpoints" && m.missing.includes("send-blocks")));
});

test("GET /artifact-runtime/:profileId/:topicId/completion returns complete:true when rules are satisfied", async () => {
  const app = createApp({
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore({
      progress: {
        completedSceneIds: ["buffer-fills"],
        checkpointStepIds: ["send-blocks"],
        experimentState: {}
      }
    })
  });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 200);
  assert.equal(body.complete, true);
  assert.deepEqual(body.missing, []);
});

test("GET /artifact-runtime/:profileId/:topicId/completion handles missing session progress as empty", async () => {
  const app = createApp({
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore({ progress: null })
  });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 200);
  assert.equal(body.complete, false);
});

test("GET /artifact-runtime/:profileId/:topicId/completion returns serializable JSON-safe output", async () => {
  const app = createApp({
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore({
      progress: { completedSceneIds: ["buffer-fills"], checkpointStepIds: ["send-blocks"], experimentState: {} }
    })
  });
  const { status, body } = await request(app, "GET", "/artifact-runtime/any/any/completion");
  assert.equal(status, 200);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /secret/i);
  assert.doesNotMatch(serialized, /function/i);
});
