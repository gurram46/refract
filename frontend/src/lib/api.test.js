import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "./api.js";
import { buildTutorContext } from "./productState.js";

function fetchThatReturns(status, body, headers = {}) {
  return async (_url, init) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json", ...headers }),
    async json() { return body; },
    async text() { return JSON.stringify(body); }
  });
}

function fetchThatRejects(reason) {
  return async () => { throw reason; };
}

const BASE = "http://127.0.0.1:8787";

test("getOptions sends GET to /options", async () => {
  let lastUrl;
  let lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { levels: ["beginner"] }; } };
  };
  const api = createApiClient({ fetchFn: injected });
  await api.getOptions();
  assert.equal(lastUrl, `${BASE}/options`);
  assert.equal(lastInit?.method, "GET");
});

test("getOptions throws safe error on non-ok", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(500, { error: "bad" }) });
  await assert.rejects(() => api.getOptions(), /Could not load/);
});

test("listProfiles sends GET to /profiles", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return []; } }; } });
  await api.listProfiles();
  assert.equal(lastUrl, `${BASE}/profiles`);
});

test("createProfile sends POST to /profiles with body", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 201, headers: new Headers({ "content-type": "application/json" }), async json() { return { id: "p1" }; } };
  };
  const api = createApiClient({ fetchFn: injected });
  const body = { language: "python", level: "beginner" };
  const result = await api.createProfile(body);
  assert.equal(lastUrl, `${BASE}/profiles`);
  assert.equal(lastInit?.method, "POST");
  assert.equal(lastInit?.body, JSON.stringify(body));
  assert.equal(result.id, "p1");
});

test("createProfile throws on validation errors", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(400, { error: "Invalid profile", errors: ["Missing language"] }) });
  await assert.rejects(() => api.createProfile({}), /Could not save/);
});

test("getProfile sends GET to /profiles/:profileId", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { id: "p1" }; } }; } });
  await api.getProfile("p1");
  assert.equal(lastUrl, `${BASE}/profiles/p1`);
});

test("getProfile throws safe error when not found", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(404, { error: "Profile not found", code: "PROFILE_NOT_FOUND" }) });
  await assert.rejects(() => api.getProfile("missing"), /not found/);
});

test("listTopics sends GET to /topics", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return []; } }; } });
  await api.listTopics();
  assert.equal(lastUrl, `${BASE}/topics`);
});

test("getTopic sends GET to /topics/:topicId", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { id: "dsa.queue" }; } }; } });
  await api.getTopic("dsa.queue");
  assert.equal(lastUrl, `${BASE}/topics/dsa.queue`);
});

test("getCachedArtifact sends GET to /artifact-runtime/:profileId/:topicId", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { status: "cached", artifact: {} }; } }; } });
  await api.getCachedArtifact("p1", "dsa.queue");
  assert.equal(lastUrl, `${BASE}/artifact-runtime/p1/dsa.queue`);
});

test("getCachedArtifact returns null for not_generated without throwing", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(404, { status: "not_generated", code: "ARTIFACT_NOT_GENERATED" }) });
  const result = await api.getCachedArtifact("p1", "dsa.queue");
  assert.equal(result, null);
});

test("getCachedArtifact throws safe error for non-404 not_generated", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(500, { error: "bad" }) });
  await assert.rejects(() => api.getCachedArtifact("p1", "dsa.queue"), /Could not load/);
});

test("generateArtifact sends POST to /artifact-runtime/:profileId/:topicId/generate", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { status: "generated", artifact: {} }; } };
  };
  const api = createApiClient({ fetchFn: injected });
  const result = await api.generateArtifact("p1", "dsa.queue");
  assert.equal(lastUrl, `${BASE}/artifact-runtime/p1/dsa.queue/generate`);
  assert.equal(lastInit?.method, "POST");
  assert.equal(result.status, "generated");
});

test("generateArtifact throws safe error on generation_failed", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(502, { status: "generation_failed", message: "failed" }) });
  await assert.rejects(() => api.generateArtifact("p1", "dsa.queue"), /Could not generate/);
});

test("getSession sends GET to /sessions/:profileId/:topicId", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return {}; } }; } });
  await api.getSession("p1", "dsa.queue");
  assert.equal(lastUrl, `${BASE}/sessions/p1/dsa.queue`);
});

test("updateSession sends POST to /sessions/:profileId/:topicId with body", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return {}; } };
  };
  const api = createApiClient({ fetchFn: injected });
  await api.updateSession("p1", "dsa.queue", { canvasState: "quiz_open" });
  assert.equal(lastUrl, `${BASE}/sessions/p1/dsa.queue`);
  assert.equal(lastInit?.method, "POST");
  assert.equal(lastInit?.body, JSON.stringify({ canvasState: "quiz_open" }));
});

test("updateSession throws on unknown field error", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(400, { error: "Unknown session field: bad" }) });
  await assert.rejects(() => api.updateSession("p1", "dsa.queue", { bad: 1 }), /Could not update/);
});

test("runCode sends POST to /run with artifactId, language, code (legacy)", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { success: true } } };
  };
  const api = createApiClient({ fetchFn: injected });
  const result = await api.runCode("queue", undefined, "python", "def enqueue(): pass");
  assert.equal(lastUrl, `${BASE}/run`);
  assert.equal(lastInit?.method, "POST");
  const sent = JSON.parse(lastInit.body);
  assert.equal(sent.artifactId, "queue");
  assert.equal(sent.language, "python");
  assert.equal(sent.code, "def enqueue(): pass");
  assert.equal(result.success, true);
});

test("runCode sends POST to /run with profileId, topicId, language, code (generated)", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { success: true } } };
  };
  const api = createApiClient({ fetchFn: injected });
  const result = await api.runCode("p1", "dsa.queue", "python", "def enqueue(): pass");
  assert.equal(lastUrl, `${BASE}/run`);
  assert.equal(lastInit?.method, "POST");
  const sent = JSON.parse(lastInit.body);
  assert.equal(sent.profileId, "p1");
  assert.equal(sent.topicId, "dsa.queue");
  assert.equal(sent.language, "python");
  assert.equal(sent.code, "def enqueue(): pass");
  assert.equal(result.success, true);
});

test("runCode throws safe error on unsupported language", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(400, { success: false, status: "unsupported_language", message: "Artifact queue does not support java." }) });
  await assert.rejects(() => api.runCode("p1", "dsa.queue", "java", "code"), /does not support/);
});

test("requestTutor sends POST to /ai/stream/explain with body", async () => {
  let lastUrl, lastInit;
  const injected = async (url, init) => {
    lastUrl = url;
    lastInit = init;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return {}; } };
  };
  const api = createApiClient({ fetchFn: injected });
  await api.requestTutor("explain", { context: "test" });
  assert.equal(lastUrl, `${BASE}/ai/stream/explain`);
  assert.equal(lastInit?.method, "POST");
  assert.equal(lastInit?.body, JSON.stringify({ context: "test" }));
});

test("requestTutor throws safe error on non-ok", async () => {
  const api = createApiClient({ fetchFn: fetchThatReturns(500, { error: "bad" }) });
  await assert.rejects(() => api.requestTutor("explain", {}), /Could not get/);
});

test("requestTutor payload includes all backend-required keys via buildTutorContext", async () => {
  let sentBody;
  const injected = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return {}; } };
  };
  const api = createApiClient({ fetchFn: injected });

  const tutorPayload = buildTutorContext({
    artifact: { title: "Queue", topicId: "dsa.queue", profileId: "p1" },
    activeProfile: { language: "python", level: "beginner", goal: "learn dsa", pairedDomains: ["backend"] },
    activeTopic: { id: "dsa.queue", title: "Queue" },
    question: "How does enqueue work?",
    tab: "canvas",
    session: {
      code: "def enqueue(): pass",
      latestRunResult: { success: true, summary: "all pass" },
      recentEvents: [{ type: "click", ts: 1 }],
      chatMessages: [{ role: "user", content: "hello" }],
      currentStep: 2,
      chatSummary: "on Queue"
    }
  });

  await api.requestTutor("explain", tutorPayload);

  assert.equal(sentBody.artifactId, "dsa.queue");
  assert.equal(sentBody.tab, "canvas");
  assert.equal(sentBody.question, "How does enqueue work?");
  assert.equal(sentBody.language, "python");
  assert.equal(sentBody.code, "def enqueue(): pass");
  assert.equal(sentBody.runResult, "success: all pass");
  assert.equal(sentBody.canvasEvents.length, 1);
  assert.ok(typeof sentBody.context === "object", "context should be an object");
  assert.equal(sentBody.context.profile.language, "python");
  assert.equal(sentBody.context.recentMessages.length, 1);
  assert.equal(sentBody.context.currentStep, 2);
});

test("requestTutor payload null-fills optional backend keys when absent", async () => {
  let sentBody;
  const injected = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return {}; } };
  };
  const api = createApiClient({ fetchFn: injected });

  const tutorPayload = buildTutorContext({ activeTopic: { id: "dsa.stack", title: "Stack" } });

  await api.requestTutor("hint", tutorPayload);

  assert.equal(sentBody.artifactId, "dsa.stack");
  assert.equal(sentBody.tab, null);
  assert.equal(sentBody.question, null);
  assert.equal(sentBody.language, null);
  assert.equal(sentBody.code, null);
  assert.equal(sentBody.runResult, null);
  assert.equal(sentBody.canvasEvents.length, 0);
  assert.equal(typeof sentBody.context, "object");
});

test("getCompletion sends GET to /artifact-runtime/:profileId/:topicId/completion", async () => {
  let lastUrl;
  const api = createApiClient({ fetchFn: async (url) => { lastUrl = url; return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), async json() { return { complete: false, satisfied: [], missing: [] }; } }; } });
  const result = await api.getCompletion("p1", "dsa.queue");
  assert.equal(lastUrl, `${BASE}/artifact-runtime/p1/dsa.queue/completion`);
  assert.equal(result.complete, false);
});

test("network failure produces safe error without jargon", async () => {
  const api = createApiClient({ fetchFn: fetchThatRejects(new TypeError("Failed to fetch")) });
  await assert.rejects(() => api.getOptions(), /Unable to connect/);
});

test("network failure on generate produces safe error", async () => {
  const api = createApiClient({ fetchFn: fetchThatRejects(new TypeError("NetworkError")) });
  await assert.rejects(() => api.generateArtifact("p1", "dsa.queue"), /Unable to connect/);
});

test("fetch rejects that are not TypeError still produce safe error", async () => {
  const api = createApiClient({ fetchFn: fetchThatRejects(new Error("unknown mess")) });
  await assert.rejects(() => api.getOptions(), /Something went wrong/);
});