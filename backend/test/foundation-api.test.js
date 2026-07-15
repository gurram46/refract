import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import {
  CORE_DOMAINS,
  PAIRED_DOMAINS,
  SUPPORTED_LEVELS,
  SUPPORTED_LANGUAGES
} from "../src/config/options.js";
import { validateProfile } from "../src/profiles/profileSchema.js";

function fakeLogger() {
  const events = [];
  const push = (level) => (event, metadata = {}) => {
    events.push({ level, event, ...metadata });
  };
  return {
    events,
    info: push("info"),
    warn: push("warn"),
    error: push("error")
  };
}

function fakeProfileStore(profiles = {}) {
  const store = { ...profiles };
  return {
    async list() { return Object.values(store); },
    async get(id) { return store[id] ?? null; },
    async save(input) {
      if (input.id !== undefined && !store[input.id]) {
        throw Object.assign(new Error("Profile not found"), { code: "PROFILE_NOT_FOUND" });
      }
      const validation = validateProfile(input);
      if (!validation.ok) {
        const error = new Error("Invalid profile");
        error.code = "INVALID_PROFILE";
        error.errors = validation.errors;
        throw error;
      }
      const id = input.id ?? `profile-${Object.keys(store).length + 1}`;
      const now = "2026-07-10T12:00:00.000Z";
      store[id] = {
        id,
        ...validation.value,
        createdAt: now,
        updatedAt: now
      };
      return store[id];
    }
  };
}

function fakeTopicGraph(nodes = {}) {
  return {
    async list() { return Object.values(nodes); },
    async get(id) { return nodes[id] ?? null; },
    async resolveContext() { return { primary: null, core: [], paired: [], adjacent: [] }; },
    async load() { }
  };
}

function fakeArtifactGenerator(profileStore, topicGraph, generateConfig = {}) {
  function code(error, code, message) {
    return Object.assign(error, { code });
  }
  async function assertProfileAndTopic(profileId, topicId) {
    if (profileStore) {
      const profile = await profileStore.get(profileId);
      if (!profile) throw code(new Error("Profile not found"), "PROFILE_NOT_FOUND");
    }
    if (topicGraph) {
      const node = await topicGraph.get(topicId);
      if (!node) throw code(new Error("Topic not found"), "TOPIC_NOT_FOUND");
    }
  }
  const defaultGeneratedFixture = {
    status: "generated",
    artifact: { schemaVersion: 1, artifactVersion: 1, profileId: "alpha", topicId: "dsa.queue", title: "Test", summary: "Test summary" },
    model: "test-model",
    fallbackUsed: false
  };
  const cachedFixture = {
    status: "cached",
    artifact: { id: "cached-artifact", title: "Cached Title" }
  };
  const failedFixture = {
    status: "generation_failed",
    code: "GENERATION_FAILED",
    message: "Artifact generation did not produce valid data after two attempts. You can try generating again — the provider will attempt a fresh response."
  };
  return {
    async generate(profileId, topicId) {
      await assertProfileAndTopic(profileId, topicId);
      if (generateConfig.mode === "cached") return cachedFixture;
      if (generateConfig.mode === "generated") return defaultGeneratedFixture;
      return failedFixture;
    },
    async get(profileId, topicId) {
      await assertProfileAndTopic(profileId, topicId);
      return { status: "not_generated" };
    }
  };
}

function fakeSessionStore() {
  return {
    async get(profileId, topicId) {
      return {
        profileId,
        topicId,
        canvasState: null,
        recentEvents: [],
        code: null,
        latestRunResult: null,
        traceEvents: [],
        chatMessages: [],
        chatSummary: null,
        currentStep: null,
        progress: null
      };
    },
    async update(profileId, topicId, patch) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw Object.assign(new Error("Update must be an object"), { code: "UNKNOWN_SESSION_FIELD" });
      }
      const allowed = new Set([
        "canvasState", "recentEvents", "code", "latestRunResult",
        "traceEvents", "chatMessages", "chatSummary", "currentStep", "progress"
      ]);
      const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
      if (unknown.length > 0) {
        throw Object.assign(new Error(`Unknown session field: ${unknown.join(", ")}`), { code: "UNKNOWN_SESSION_FIELD" });
      }
      return { profileId, topicId, ...patch };
    }
  };
}

function startServer(app) {
  return new Promise((resolve, reject) => {
    let server;
    app.on("error", reject);
    server = app.listen(0, "127.0.0.1", () => resolve(server));
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

async function withServer(app, fn) {
  const server = await startServer(app);
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /options returns allowed selections (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/options");

  assert.equal(status, 200);
  assert.deepEqual(body.levels, SUPPORTED_LEVELS);
  assert.deepEqual(body.languages, SUPPORTED_LANGUAGES);
  assert.deepEqual(body.coreDomains, CORE_DOMAINS);
  assert.deepEqual(body.pairedDomains, PAIRED_DOMAINS);
});

test("GET /options does not expose secret or provider details (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { body } = await request(app, "GET", "/options");

  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("NVIDIA"), "must not expose NVIDIA");
  assert.ok(!serialized.includes("minimax"), "must not expose provider name");
  assert.ok(!serialized.includes("deepseek"), "must not expose provider name");
  assert.ok(!serialized.includes("api_key"), "must not expose api_key");
  assert.ok(!serialized.includes("nvapi-"), "must not expose key pattern");
});

test("GET /profiles returns empty array without errors (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/profiles");

  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test("GET /profiles returns stored profiles (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(profiles),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/profiles");

  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].id, "alpha");
});

test("POST /profiles creates a new profile (GREEN)", async () => {
  const logger = fakeLogger();
  const store = fakeProfileStore();
  const app = createApp({
    logger,
    profileStore: store,
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/profiles", {
    name: "Test learner",
    level: "beginner",
    language: "go",
    pairedDomains: ["backend"],
    selectedTopics: ["dsa.queue"],
    goal: "Learn queues"
  });

  assert.equal(status, 201);
  assert.ok(body.id, "response must include ID");
  assert.equal(body.name, "Test learner");
  assert.equal(body.level, "beginner");
  assert.equal(body.coreDomains.length, 3);
});

test("POST /profiles returns 400 on invalid input (GREEN)", async () => {
  const logger = fakeLogger();
  const store = fakeProfileStore();
  const app = createApp({
    logger,
    profileStore: store,
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/profiles", {
    name: "",
    level: "beginner",
    language: "go",
    pairedDomains: ["backend"],
    selectedTopics: ["dsa.queue"],
    goal: "invalid name"
  });

  assert.equal(status, 400);
  assert.ok(body.error, "error response must contain error field");
  assert.ok(body.errors && body.errors.length > 0, "must include validation errors");
});

test("POST /profiles returns 400 on unknown level (GREEN)", async () => {
  const logger = fakeLogger();
  const store = fakeProfileStore();
  const app = createApp({
    logger,
    profileStore: store,
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/profiles", {
    name: "Wizard",
    level: "wizard",
    language: "go",
    pairedDomains: ["backend"],
    selectedTopics: ["dsa.queue"],
    goal: "Impossible"
  });

  assert.equal(status, 400);
  assert.ok(body.errors && body.errors.length > 0, "must include validation errors");
});

test("GET /profiles/:profileId returns stored profile (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(profiles),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/profiles/alpha");

  assert.equal(status, 200);
  assert.equal(body.id, "alpha");
  assert.equal(body.name, "Alpha");
});

test("GET /profiles/:profileId returns 404 for missing profile (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/profiles/missing");

  assert.equal(status, 404);
  assert.ok(body.error, "must include error message");
  assert.ok(!JSON.stringify(body).includes("NVIDIA"), "no provider name in error");
});

test("GET /topics returns topic list (GREEN)", async () => {
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const graph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: graph,
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/topics");

  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 1);
  assert.equal(body[0].id, "dsa.queue");
});

test("GET /topics/:topicId returns single topic (GREEN)", async () => {
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const graph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: graph,
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/topics/dsa.queue");

  assert.equal(status, 200);
  assert.equal(body.id, "dsa.queue");
  assert.equal(body.title, "Queue");
});

test("GET /topics/:topicId returns 404 for missing topic (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/topics/dsa.missing");

  assert.equal(status, 404);
  assert.ok(body.error, "must include error message");
});

test("error responses never include provider names (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  for (const path of ["/profiles/nope", "/topics/dsa.missing", "/artifact-runtime/nope/dsa.queue"]) {
    const { status, body } = await request(app, "GET", path);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("minimax"), `${path} must not leak provider name`);
    assert.ok(!serialized.includes("deepseek"), `${path} must not leak provider name`);
    assert.ok(!serialized.includes("NVIDIA"), `${path} must not leak provider name`);
    assert.ok(!serialized.includes("nvapi-"), `${path} must not leak key pattern`);
  }
});

test("error responses never include stack traces (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  for (const path of ["/profiles/nope", "/topics/dsa.missing"]) {
    const { body } = await request(app, "GET", path);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("Error.stack"), "must not include stack trace");
    assert.ok(!serialized.includes("at "), "must not include stack trace lines");
  }
});

test("GET /artifact-runtime/:profileId/:topicId returns cached or not-generated (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/artifact-runtime/alpha/dsa.queue");

  assert.equal(status, 404);
  assert.equal(body.status, "not_generated");
});

test("GET /artifact-runtime returns 404 for missing profile (GREEN)", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore();
  const topicGraph = fakeTopicGraph({ "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] } });
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/artifact-runtime/nope/dsa.queue");

  assert.equal(status, 404);
  assert.equal(body.code, "PROFILE_NOT_FOUND");
});

test("GET /artifact-runtime returns 404 for missing topic (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph();
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/artifact-runtime/alpha/dsa.nope");

  assert.equal(status, 404);
  assert.equal(body.code, "TOPIC_NOT_FOUND");
});

test("POST /artifact-runtime/:profileId/:topicId/generate returns 502 for generation_failed (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/artifact-runtime/alpha/dsa.queue/generate", {});

  assert.equal(status, 502);
  assert.equal(body.status, "generation_failed");
  assert.equal(body.code, "GENERATION_FAILED");
  assert.ok(body.message.length > 0, "response body must include a beginner-safe message");
});

test("POST /artifact-runtime/:profileId/:topicId/generate returns 200 for generated status (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph, { mode: "generated" }),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/artifact-runtime/alpha/dsa.queue/generate", {});

  assert.equal(status, 200);
  assert.equal(body.status, "generated");
  assert.ok(body.artifact, "generated response must include artifact");
});

test("POST /artifact-runtime/:profileId/:topicId/generate returns 200 for cached status (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph, { mode: "cached" }),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/artifact-runtime/alpha/dsa.queue/generate", {});

  assert.equal(status, 200);
  assert.equal(body.status, "cached");
  assert.ok(body.artifact, "cached response must include artifact");
});

test("POST /artifact-runtime/:profileId/:topicId/generate returns 404 for missing profile (GREEN)", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore();
  const topicGraph = fakeTopicGraph({ "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] } });
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/artifact-runtime/nope/dsa.queue/generate");

  assert.equal(status, 404);
  assert.equal(body.code, "PROFILE_NOT_FOUND");
});

test("POST /artifact-runtime/:profileId/:topicId/generate returns 404 for missing topic (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph();
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: fakeArtifactGenerator(profileStore, topicGraph),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/artifact-runtime/alpha/dsa.nope/generate");

  assert.equal(status, 404);
  assert.ok(body.code, "must include error code");
});

test("GET /sessions/:profileId/:topicId returns empty session for new pair (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore({ "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: [], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS } }),
    topicGraph: fakeTopicGraph({ "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] } }),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/sessions/alpha/dsa.queue");

  assert.equal(status, 200);
  assert.equal(body.profileId, "alpha");
  assert.equal(body.topicId, "dsa.queue");
  assert.equal(body.code, null);
});

test("POST /sessions/:profileId/:topicId updates session and returns 200 (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore({ "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: [], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS } }),
    topicGraph: fakeTopicGraph({ "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] } }),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/sessions/alpha/dsa.queue", {
    code: "fn main() {}",
    currentStep: "step-3"
  });

  assert.equal(status, 200);
  assert.equal(body.code, "fn main() {}");
  assert.equal(body.currentStep, "step-3");
});

test("POST /sessions returns 400 on unknown session field (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore({ "alpha": { id: "alpha" } }),
    topicGraph: fakeTopicGraph({ "dsa.queue": { id: "dsa.queue" } }),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/sessions/alpha/dsa.queue", {
    secretPrompt: "leak"
  });

  assert.equal(status, 400);
  assert.ok(body.error, "must include error message");
});

test("request body size enforcement rejects oversized payloads (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore({ "alpha": { id: "alpha" } }),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const bigPayload = { name: "Test", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: ["dsa.queue"], goal: "x".repeat(125000) };

  const { status, body } = await request(app, "POST", "/profiles", bigPayload);

  assert.equal(status, 413);
  assert.ok(body.error, "must include error message");
});

test("request logging emits started and completed with safe metadata (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  await request(app, "GET", "/options");

  const startedEvents = logger.events.filter((e) => e.event === "request.started");
  const completedEvents = logger.events.filter((e) => e.event === "request.completed");

  assert.ok(startedEvents.length > 0, "must emit request.started");
  assert.ok(completedEvents.length > 0, "must emit request.completed");
  assert.equal(startedEvents[0].method, "GET");
  assert.equal(startedEvents[0].route, "/options");
});

test("existing routes /health, /artifacts/:id, /run, /ai/stream/*, /progress/:studentId still respond (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const health = await request(app, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const artifacts = await request(app, "GET", "/artifacts/queue");
  assert.equal(artifacts.status, 200);

  const run = await request(app, "POST", "/run", { artifactId: "queue", language: "python", code: "print('hi')" });
  assert.ok(run.status, "/run must respond");

  const aiHint = await request(app, "POST", "/ai/stream/hint", { question: "help" });
  assert.ok(aiHint.status, "/ai/stream/hint must respond");

  const progress = await request(app, "GET", "/progress/local-student");
  assert.equal(progress.status, 200);
  assert.equal(progress.body.studentId, "local-student");
});

test("404 handler returns Not found (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "GET", "/nonexistent-route");

  assert.equal(status, 404);
  assert.equal(body.error, "Not found");
});

test("safe errors never leak provider name, api key pattern, or stack trace (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  const paths = [
    "/profiles/nonexistent",
    "/topics/dsa.nonexistent",
    "/artifact-runtime/nope/dsa.queue",
    "/artifact-runtime/alpha/dsa.nope"
  ];

  for (const pathname of paths) {
    const { body } = await request(app, "GET", pathname);
    const json = JSON.stringify(body);
    assert.ok(!json.includes("NVIDIA"), `${pathname} error must not leak NVIDIA`);
    assert.ok(!json.includes("minimax"), `${pathname} error must not leak provider`);
    assert.ok(!json.includes("deepseek"), `${pathname} error must not leak provider`);
    assert.ok(!json.includes("nvapi-"), `${pathname} error must not leak key`);
    assert.ok(!json.includes("Bearer"), `${pathname} error must not leak auth`);
    assert.ok(!json.match(/\\bat\s+/), `${pathname} error must not leak stack trace`);
    assert.ok(!json.match(/Error\.stack/), `${pathname} error must not leak stack trace`);
  }
});

test("POST /run with generated profileId/topicId fetches cached artifact and runs it (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "python", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);

  const generatedArtifact = {
    id: "dsa.queue",
    schemaVersion: 1,
    artifactVersion: 1,
    profileId: "alpha",
    topicId: "dsa.queue",
    title: "Queue",
    summary: "FIFO",
    connections: { core: [], paired: [] },
    story: { premise: "p", objective: "o", decisions: ["a"], audioScript: "s" },
    visual: { kind: "queue", initialState: { items: [] }, controls: [] },
    examples: [],
    practice: {
      language: "python",
      prompt: "Build a queue.",
      starterCode: "class Queue:\n    def __init__(self):\n        self.items = []",
      tests: "q = Queue()\nq.enqueue(1)\nassert q.items == [1]",
      supportedTraceEvents: ["queue.enqueue", "queue.dequeue"]
    },
    chat: { suggestedQuestions: [] },
    next: []
  };

  const logger = fakeLogger();
  const gen = fakeArtifactGenerator(profileStore, topicGraph, { mode: "generated" });
  gen.get = async (pid, tid) => ({ status: "cached", artifact: generatedArtifact });
  gen.entries = [];

  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: gen,
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/run", {
    profileId: "alpha",
    topicId: "dsa.queue",
    language: "python",
    code: "class Queue:\n    def __init__(self):\n        self.items = []\n\n    def enqueue(self, v):\n        self.items.append(v)"
  });

  assert.equal(status, 200);
  assert.ok(body.artifactId, "response must include artifactId");
  assert.equal(body.language, "python");
  assert.equal(typeof body.success, "boolean");
});

test("POST /run rejects generated artifact not cached / not found (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "python", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();

  const gen = fakeArtifactGenerator(profileStore, topicGraph);
  gen.get = async () => ({ status: "not_generated" });

  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: gen,
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/run", {
    profileId: "alpha",
    topicId: "dsa.queue",
    language: "python",
    code: "pass"
  });

  assert.equal(status, 404);
  assert.equal(body.code, "ARTIFACT_NOT_GENERATED");
});

test("POST /run rejects generated run for unsupported language (GREEN)", async () => {
  const profiles = {
    "alpha": { id: "alpha", name: "Alpha", level: "beginner", language: "go", pairedDomains: ["backend"], selectedTopics: [], goal: "A", coreDomains: CORE_DOMAINS }
  };
  const nodes = {
    "dsa.queue": { id: "dsa.queue", title: "Queue", domain: "dsa", allowedVisualKinds: ["queue"], connections: [] }
  };
  const profileStore = fakeProfileStore(profiles);
  const topicGraph = fakeTopicGraph(nodes);
  const logger = fakeLogger();

  const gen = fakeArtifactGenerator(profileStore, topicGraph);
  gen.get = async () => ({
    status: "cached",
    artifact: { id: "dsa.queue", practice: { language: "go", tests: "test", supportedTraceEvents: [] } }
  });

  const app = createApp({
    logger,
    profileStore,
    topicGraph,
    artifactGenerator: gen,
    sessionStore: fakeSessionStore()
  });

  const { status, body } = await request(app, "POST", "/run", {
    profileId: "alpha",
    topicId: "dsa.queue",
    language: "go",
    code: "func main() {}"
  });

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.status, "unsupported_language");
});

test("logger sanitizes sensitive keys in request metadata (GREEN)", async () => {
  const logger = fakeLogger();
  const app = createApp({
    logger,
    profileStore: fakeProfileStore(),
    topicGraph: fakeTopicGraph(),
    artifactGenerator: fakeArtifactGenerator(),
    sessionStore: fakeSessionStore()
  });

  await withServer(app, async (base) => {
    await fetch(`${base}/options`, {
      method: "GET",
      headers: { authorization: "Bearer nvapi-secret-key", "content-type": "application/json" }
    });
  });

  const allLog = JSON.stringify(logger.events);
  assert.ok(!allLog.includes("nvapi-secret-key"), "logs must not contain API key value");
  assert.ok(!allLog.includes("Bearer"), "logs must not contain Bearer tokens");
});