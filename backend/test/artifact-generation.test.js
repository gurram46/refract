import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildArtifactMessages, buildArtifactMessagesV2 } from "../src/artifacts/promptBuilder.js";
import { createArtifactGenerator } from "../src/artifacts/artifactGenerator.js";
import { createArtifactCache } from "../src/artifacts/artifactCache.js";
import { validateArtifact } from "../src/artifacts/artifactSchema.js";

const sampleProfile = {
  id: "local-learner-a1b2",
  name: "Alex",
  level: "beginner",
  language: "go",
  pairedDomains: ["backend"],
  selectedTopics: ["dsa.queue"],
  goal: "Build reliable backend systems"
};

const primaryNode = {
  id: "dsa.queue",
  title: "Queues",
  domain: "dsa",
  sourceText: "# Queues\n\nA queue is a FIFO data structure.\n\n## Operations\n\n- enqueue\n- dequeue\n- peek",
  allowedVisualKinds: ["queue"],
  connections: ["system-design.retry-queue", "game-theory.queue-fairness", "backend.go.worker-queue"]
};

const coreNodes = [
  {
    id: "system-design.retry-queue",
    title: "Retry Queues",
    domain: "system-design",
    sourceText: "# Retry Queues\n\nRetry queues provide eventual delivery guarantees.",
    allowedVisualKinds: [],
    connections: []
  },
  {
    id: "game-theory.queue-fairness",
    title: "Queue Fairness",
    domain: "game-theory",
    sourceText: "# Queue Fairness\n\nFair queuing prevents starvation.",
    allowedVisualKinds: [],
    connections: []
  }
];

const pairedNodes = [
  {
    id: "backend.go.worker-queue",
    title: "Worker Queues in Go",
    domain: "backend",
    sourceText: "# Worker Queues in Go\n\nUse goroutines for concurrent workers.",
    allowedVisualKinds: [],
    connections: []
  }
];

const adjacentSummaries = [
  { id: "dsa.stack", title: "Stacks" }
];

function topicContext() {
  return {
    primary: { ...primaryNode, sourceText: primaryNode.sourceText },
    core: coreNodes.map((n) => ({ ...n, sourceText: n.sourceText })),
    paired: pairedNodes.map((n) => ({ ...n, sourceText: n.sourceText })),
    adjacent: adjacentSummaries.map((n) => ({ ...n }))
  };
}

test("buildArtifactMessages module exists and exports a function", () => {
  assert.equal(typeof buildArtifactMessages, "function");
});

test("returns exactly one system message and one user message", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
});

test("system message defines JSON-only output and the artifact contract", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const systemMsg = messages[0].content;
  assert.ok(systemMsg.includes("JSON"), "system message must mention JSON");
  assert.ok(systemMsg.includes("schemaVersion"), "system message must reference schemaVersion");
  assert.ok(systemMsg.includes("artifactVersion"), "system message must reference artifactVersion");
  assert.ok(systemMsg.includes("profileId"), "system message must reference profileId");
  assert.ok(systemMsg.includes("topicId"), "system message must reference topicId");
});

test("v1 system message visual kinds match the shared capability projection", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const systemMsg = messages[0].content;
  const visualLine = systemMsg.split("\n").find((l) => l.includes("must be one of:"));
  assert.ok(visualLine, "system message must list allowed visual kinds inline");
  // The v1 manifest only ships queue; the prompt must derive from getV1VisualKinds().
  assert.ok(visualLine.includes("queue"), "must advertise queue from manifest");
  assert.ok(!visualLine.includes("stack"), "must not advertise unshipped v1 visual kinds");
  assert.ok(!visualLine.includes("tree"), "must not advertise unshipped v1 visual kinds");
  assert.ok(!visualLine.includes("graph"), "must not advertise unshipped v1 visual kinds");
  assert.ok(!visualLine.includes("array"), "must not advertise unshipped v1 visual kinds");
  assert.ok(!visualLine.includes("table"), "must not advertise unshipped v1 visual kinds");
  assert.ok(!visualLine.includes("scatter"), "must not advertise unshipped v1 visual kinds");
});

test("system message forbids executable UI fields", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const systemMsg = messages[0].content;
  const forbiddenTerms = ["html", "jsx", "componentCode", "executableCode", "executable"];
  const matched = forbiddenTerms.some((term) => systemMsg.toLowerCase().includes(term.toLowerCase()));
  assert.ok(matched, "system message must forbid executable UI output");
});

test("user message includes normalized profile data", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(userMsg.includes(sampleProfile.id), "user message must include profile ID");
  assert.ok(userMsg.includes(sampleProfile.language), "user message must include language");
  assert.ok(userMsg.includes(sampleProfile.level), "user message must include level");
  assert.ok(userMsg.includes(sampleProfile.goal), "user message must include goal");
});

test("user message includes primary topic ID", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(userMsg.includes("dsa.queue"), "user message must include primary topic ID");
});

test("user message states exact artifact constraints", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;

  assert.ok(userMsg.includes(`Exact profileId: ${sampleProfile.id}`));
  assert.ok(userMsg.includes(`Exact topicId: ${primaryNode.id}`));
  assert.ok(userMsg.includes(`Exact practice language: ${sampleProfile.language}`));
  assert.ok(userMsg.includes(`Allowed visual kinds for this topic: ${primaryNode.allowedVisualKinds.join(", ")}`));
  assert.ok(!userMsg.includes("topic **a1b2**"), "must not derive the topic from the profile ID");
});

test("user message includes all core source texts", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  for (const coreNode of coreNodes) {
    assert.ok(userMsg.includes(coreNode.title), `user message must include core node title: ${coreNode.title}`);
    assert.ok(userMsg.includes(coreNode.id), `user message must include core node ID: ${coreNode.id}`);
  }
});

test("user message includes selected paired source texts only", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  for (const pairedNode of pairedNodes) {
    assert.ok(userMsg.includes(pairedNode.title), `user message must include paired node title: ${pairedNode.title}`);
    assert.ok(userMsg.includes(pairedNode.id), `user message must include paired node ID: ${pairedNode.id}`);
  }
});

test("user message includes adjacent node summaries", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(userMsg.includes("dsa.stack"), "user message must include adjacent node ID");
  assert.ok(userMsg.includes("Stacks"), "user message must include adjacent node title");
});

test("excludes API keys and authorization values", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  for (const msg of messages) {
    assert.ok(!msg.content.includes("sk-"), "content must not contain API keys");
    assert.ok(!msg.content.includes("Bearer"), "content must not contain Bearer tokens");
    assert.ok(!msg.content.includes("api_key"), "content must not contain api_key");
    assert.ok(!msg.content.includes("authorization"), "content must not contain authorization");
  }
});

test("excludes absolute local paths", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  for (const msg of messages) {
    assert.ok(!msg.content.includes("C:"), "content must not contain Windows absolute paths");
    assert.ok(!msg.content.includes("/home/"), "content must not contain Unix absolute paths");
  }
});

test("excludes previous provider responses", () => {
  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: topicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(!userMsg.includes("assistant"), "user message must not contain previous assistant-like responses");
  assert.ok(!userMsg.includes("previous artifact"), "user message must not reference previous artifacts");
});

test("caps each Markdown source at 24000 characters and marks truncation", () => {
  const longText = "x".repeat(25000);
  const ctx = topicContext();
  ctx.primary.sourceText = longText;

  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: ctx
  });
  const userMsg = messages[1].content;

  const truncatedMarker = "[truncated]";
  assert.ok(userMsg.includes(truncatedMarker), "user message must contain [truncated] marker");

  const sourceStart = userMsg.indexOf(longText.slice(0, 100));
  assert.ok(sourceStart >= 0, "must include the beginning of the source text");
  const truncatedStart = userMsg.indexOf(truncatedMarker, sourceStart);
  assert.ok(truncatedStart > sourceStart, "must truncate after source text");

  const sourceBody = userMsg.slice(sourceStart, truncatedStart);
  assert.ok(sourceBody.length <= 24200,
    `source text section capped near 24000, was ${sourceBody.length}`);
});

test("caps complete serialized context at 96000 characters", () => {
  const longText = "y".repeat(30000);
  const ctx = topicContext();
  ctx.primary.sourceText = longText;
  ctx.core[0].sourceText = longText;
  ctx.core[1].sourceText = longText;
  ctx.paired[0].sourceText = longText;

  const { messages } = buildArtifactMessages({
    profile: sampleProfile,
    topicContext: ctx
  });

  const serialized = JSON.stringify(messages);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  assert.ok(byteLength <= 96000, `serialized context must not exceed 96000 bytes, was ${byteLength}`);
});

test("does not mutate profile or topic context", () => {
  const profile = JSON.parse(JSON.stringify(sampleProfile));
  const ctx = topicContext();
  const primaryBackup = JSON.parse(JSON.stringify(ctx.primary));
  const coreBackup = JSON.parse(JSON.stringify(ctx.core));
  const pairedBackup = JSON.parse(JSON.stringify(ctx.paired));
  const adjacentBackup = JSON.parse(JSON.stringify(ctx.adjacent));

  buildArtifactMessages({ profile, topicContext: ctx });

  assert.deepEqual(profile, sampleProfile);
  assert.deepEqual(ctx.primary, primaryBackup);
  assert.deepEqual(ctx.core, coreBackup);
  assert.deepEqual(ctx.paired, pairedBackup);
  assert.deepEqual(ctx.adjacent, adjacentBackup);
});

test("truncation is deterministic", () => {
  const ctx = topicContext();
  ctx.primary.sourceText = "A".repeat(25000);

  const result1 = buildArtifactMessages({ profile: sampleProfile, topicContext: ctx });
  const result2 = buildArtifactMessages({ profile: sampleProfile, topicContext: ctx });

  assert.deepEqual(result1, result2, "same inputs must produce identical output");
});

test("handles nodes without sourceText gracefully", () => {
  const ctx = topicContext();
  ctx.core.push({
    id: "system-design.missing-source",
    title: "Missing Source",
    domain: "system-design",
    connections: []
  });

  assert.doesNotThrow(() => {
    buildArtifactMessages({ profile: sampleProfile, topicContext: ctx });
  }, "should not throw when a node lacks sourceText");
});

test("handles empty paired domains", () => {
  const profile = { ...sampleProfile, pairedDomains: [] };
  const ctx = topicContext();

  assert.doesNotThrow(() => {
    buildArtifactMessages({ profile, topicContext: ctx });
  }, "should not throw with empty paired domains");
});

test("handles empty adjacent nodes", () => {
  const ctx = topicContext();
  ctx.adjacent = [];

  assert.doesNotThrow(() => {
    buildArtifactMessages({ profile: sampleProfile, topicContext: ctx });
  }, "should not throw with empty adjacent nodes");
});

test("Go concurrency permits a required visual kind", async () => {
  const graphPath = path.resolve("../curriculum/topic-graph.json");
  const graph = JSON.parse(await readFile(graphPath, "utf8"));
  const node = graph.nodes.find((candidate) => candidate.id === "backend.go.concurrency");

  assert.ok(node, "Go concurrency topic must exist");
  assert.ok(node.allowedVisualKinds.length > 0, "Go concurrency must permit at least one visual kind");
  assert.ok(node.allowedVisualKinds.includes("queue"), "Go concurrency must support its queue-based source connection");
});

// ---------------------------------------------------------------------------
// Generator tests
// ---------------------------------------------------------------------------

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "refract-gen-"));
  return directory;
}

function fakeLogger() {
  const events = [];
  return {
    events,
    info(event, metadata) { events.push({ level: "info", event, metadata }); },
    warn(event, metadata) { events.push({ level: "warn", event, metadata }); },
    error(event, metadata) { events.push({ level: "error", event, metadata }); }
  };
}

function fakeProfileStore(profileOverride) {
  return {
    async get() { return profileOverride ?? null; },
    async list() { return []; },
    async save() { }
  };
}

function fakeTopicGraph(topicOverride) {
  const hasOverride = topicOverride !== undefined;
  const node = hasOverride ? topicOverride : {
    id: "dsa.queue",
    title: "Queues",
    domain: "dsa",
    allowedVisualKinds: ["queue"],
    connections: ["system-design.retry-queue", "game-theory.queue-fairness", "backend.go.worker-queue"]
  };
  return {
    async get() { return node; },
    async resolveContext() {
      return {
        primary: { ...primaryNode },
        core: coreNodes.map((n) => ({ ...n })),
        paired: pairedNodes.map((n) => ({ ...n })),
        adjacent: adjacentSummaries.map((n) => ({ ...n }))
      };
    },
    async list() { return []; },
    async load() { }
  };
}

function fakeArtifactCache() {
  const cache = new Map();
  const entries = [];
  return {
    entries,
    setup(key, value) { cache.set(key, value); },
    async read({ profileId, topicId }) {
      const entry = cache.get(`${profileId}:${topicId}`);
      entries.push({ op: "read", profileId, topicId, hit: entry !== undefined });
      if (entry) return { status: "hit", value: entry };
      return { status: "miss" };
    },
    async write(artifact, context) {
      const validation = validateArtifact(artifact, context);
      if (!validation.ok) {
        entries.push({ op: "validate_failed", profileId: context.profileId, topicId: context.topicId });
        return { status: "invalid", errors: validation.errors };
      }
      entries.push({ op: "write", profileId: context.profileId, topicId: context.topicId });
      cache.set(`${context.profileId}:${context.topicId}`, validation.value);
      return { status: "written", value: validation.value };
    }
  };
}

function fakeAiProvider(responses) {
  let callCount = 0;
  const calls = [];
  return {
    callCount() { return callCount; },
    calls,
    async complete(input) {
      callCount++;
      const response = responses.shift();
      if (!response) {
        const error = new Error("PROVIDER_FAILED: no response available");
        error.code = "PROVIDER_FAILED";
        throw error;
      }
      calls.push({ ...response, messages: input.messages });
      if (response instanceof Error) throw response;
      return response;
    },
    status() { return { managedProviderConfigured: true }; }
  };
}

function validGeneratedArtifact() {
  return {
    schemaVersion: 1,
    artifactVersion: 1,
    profileId: sampleProfile.id,
    topicId: "dsa.queue",
    title: "The Fair Payment Lane",
    summary: "Learn FIFO queue behavior through a game-theory scenario.",
    connections: {
      core: ["system-design.retry-queue", "game-theory.queue-fairness"],
      paired: ["backend.go.worker-queue"]
    },
    story: {
      premise: "Multiple payment batches must flow through a single retry lane.",
      objective: "Preserve arrival order so every batch gets its turn.",
      decisions: [
        { label: "FIFO", outcome: "All batches complete in order." },
        { label: "LIFO", outcome: "Starvation at the tail." }
      ],
      audioScript: "One lane, one rule: first in, first out."
    },
    visual: {
      kind: "queue",
      initialState: { items: [] },
      controls: [
        { action: "enqueue", label: "Enqueue" },
        { action: "dequeue", label: "Dequeue" }
      ]
    },
    examples: [
      { description: "Simple enqueue-dequeue", data: { input: [1, 2, 3] } }
    ],
    practice: {
      language: sampleProfile.language,
      prompt: "Implement a FIFO queue in Go.",
      starterCode: "package queue\n\ntype Queue struct {\n\titems []int\n}",
      tests: "Enqueue 1, 2, 3 then dequeue and assert order 1, 2, 3.",
      supportedTraceEvents: ["queue.enqueue", "queue.dequeue"]
    },
    chat: {
      suggestedQuestions: ["What happens when a retry lane overflows?"]
    },
    next: ["system-design.retry-queue"]
  };
}

test("createArtifactGenerator rejects missing dependencies", () => {
  assert.throws(
    () => createArtifactGenerator({}),
    /profileStore/
  );
});

test("get returns a valid cache hit without provider calls", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  cache.setup(`${sampleProfile.id}:dsa.queue`, artifact);
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.get(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "cached");
  assert.deepEqual(result.artifact, artifact);
  assert.equal(aiProvider.callCount(), 0, "provider must never be called during get");
  assert.equal(cache.entries.length, 1);
  assert.equal(cache.entries[0].op, "read");
});

test("get on a cache miss makes zero provider calls", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.get(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "not_generated");
  assert.equal(result.artifact, undefined);
  assert.equal(aiProvider.callCount(), 0);
});

test("generate returns a valid cache hit without provider calls", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  cache.setup(`${sampleProfile.id}:dsa.queue`, artifact);
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "cached");
  assert.deepEqual(result.artifact, artifact);
  assert.equal(aiProvider.callCount(), 0);
});

test("generate parses a raw JSON object string from provider", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated");
  assert.deepEqual(result.artifact, artifact);
  assert.equal(aiProvider.callCount(), 1);
  assert.ok(cache.entries.some((e) => e.op === "write"), "must cache the artifact");
});

test("generate parses a fenced JSON code block from provider", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const rawContent = "```json\n" + JSON.stringify(artifact) + "\n```";
  const aiProvider = fakeAiProvider([
    { content: rawContent, model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated");
  assert.deepEqual(result.artifact, artifact);
  assert.equal(aiProvider.callCount(), 1);
});

test("generate rejects prose with embedded JSON", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const proseContent = "Here is the artifact you asked for:\n\n" + JSON.stringify(artifact) + "\n\nI hope this helps!";
  const aiProvider = fakeAiProvider([
    { content: proseContent, model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed");
  assert.ok(result.code, "must include an error code");
  assert.ok(result.message, "must include a beginner-safe message");
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0, "must not cache invalid content");
});

test("generate rejects multiple JSON fences", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([
    { content: '```json\n{"a":1}\n```\n```json\n{"b":2}\n```', model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed");
});

test("generate validates through cache write contract with profile and topic IDs", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  artifact.profileId = "wrong-learner";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed", "mismatched profileId must fail");
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
});

test("generate validates through cache write contract with allowedVisualKinds", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  artifact.visual.kind = "graph";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed", "unsupported visual kind must fail");
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
});

test("generate makes exactly one repair call when first artifact fails validation", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = validGeneratedArtifact();
  badArtifact.profileId = "wrong-learner";

  const fixedArtifact = { ...validGeneratedArtifact(), profileId: sampleProfile.id };

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(fixedArtifact), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated", "repair must succeed and return generated");
  assert.equal(aiProvider.callCount(), 2);
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 1);
  assert.ok(result.fallbackUsed, "repair result must mark fallbackUsed");
});

test("generate repair message contains validation codes but no source Markdown", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = validGeneratedArtifact();
  badArtifact.story.decisions = "not-an-array";
  badArtifact.visual.kind = "graph";

  const fixedArtifact = { ...validGeneratedArtifact() };

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(fixedArtifact), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const repairCall = aiProvider.calls[1];
  const repairMessages = repairCall.messages;
  const lastUserMsg = repairMessages[repairMessages.length - 1].content;

  assert.ok(lastUserMsg.includes("INVALID_TYPE"), "repair must include validation code");
  assert.ok(lastUserMsg.includes("UNSUPPORTED_VISUAL_KIND"), "repair must include visual kind error");
  assert.ok(!lastUserMsg.includes(primaryNode.sourceText), "repair must not include source Markdown");
  assert.ok(!lastUserMsg.includes("Bearer"), "repair must not include secrets");
  assert.ok(!lastUserMsg.includes("C:"), "repair must not include absolute paths");
  assert.ok(!lastUserMsg.includes(JSON.stringify(badArtifact)), "repair must not include the full invalid response");
});

test("generate repair message repeats exact validation constraints", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = validGeneratedArtifact();
  badArtifact.profileId = "wrong-learner";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(validGeneratedArtifact()), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  await generator.generate(sampleProfile.id, primaryNode.id);

  const repairUserMsg = aiProvider.calls[1].messages.at(-1).content;
  assert.ok(repairUserMsg.includes(`Exact profileId: ${sampleProfile.id}`));
  assert.ok(repairUserMsg.includes(`Exact topicId: ${primaryNode.id}`));
  assert.ok(repairUserMsg.includes(`Exact practice language: ${sampleProfile.language}`));
  assert.ok(repairUserMsg.includes(`Allowed visual kinds: ${primaryNode.allowedVisualKinds.join(", ")}`));
});

test("generate returns generation_failed after two failures with no cache file", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = { notAnArtifact: true };

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(badArtifact), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed");
  assert.equal(result.code, "GENERATION_FAILED");
  assert.ok(result.message.length > 0 && typeof result.message === "string");
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
  assert.equal(aiProvider.callCount(), 2);
});

test("generate emits all required generation lifecycle events", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const eventNames = logger.events.map((e) => e.event);
  assert.ok(eventNames.includes("generation.started"), "must emit generation.started");
  assert.ok(eventNames.includes("artifact.validation.succeeded"), "must emit validation.succeeded");
  assert.ok(eventNames.includes("generation.completed"), "must emit generation.completed");
  assert.ok(!eventNames.includes("generation.failed"), "must not emit generation.failed on success");
  assert.ok(!eventNames.includes("artifact.validation.failed"), "must not emit validation.failed on success");
});

test("generate emits validation.failed and generation.failed on failure", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = { notAnArtifact: true };
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const eventNames = logger.events.map((e) => e.event);
  assert.ok(eventNames.includes("generation.started"), "must emit generation.started");
  assert.ok(eventNames.includes("artifact.validation.failed"), "must emit validation.failed");
  assert.ok(eventNames.includes("generation.failed"), "must emit generation.failed");
});

test("generate logs never contain prompts or generated content", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const allLog = JSON.stringify(logger.events);
  assert.ok(!allLog.includes(primaryNode.sourceText), "logs must not contain source text");
  assert.ok(!allLog.includes(JSON.stringify(artifact)), "logs must not contain artifact content");
});

test("get rejects missing profile with service error code", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(null);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await assert.rejects(
    generator.get(sampleProfile.id, "dsa.queue"),
    /PROFILE_NOT_FOUND/
  );
});

test("get rejects missing topic with service error code", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph(null);
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await assert.rejects(
    generator.get(sampleProfile.id, "dsa.queue"),
    /TOPIC_NOT_FOUND/
  );
});

test("generate rejects missing profile with service error code", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(null);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await assert.rejects(
    generator.generate(sampleProfile.id, "dsa.queue"),
    /PROFILE_NOT_FOUND/
  );
});

test("generate rejects missing topic with service error code", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph(null);
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await assert.rejects(
    generator.generate(sampleProfile.id, "dsa.queue"),
    /TOPIC_NOT_FOUND/
  );
});

test("generate includes profile language in cache validation context", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  artifact.practice.language = "python";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed", "language mismatch must fail");
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
});

test("generate repair fails and returns generation_failed after two invalid artifacts", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact1 = validGeneratedArtifact();
  badArtifact1.profileId = "wrong-learner";
  const badArtifact2 = validGeneratedArtifact();
  badArtifact2.visual.kind = "graph";

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact1), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(badArtifact2), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed");
  assert.equal(aiProvider.callCount(), 2);
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
});

test("generate resolved context includes all core domains", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const call = aiProvider.calls[0];
  const userMsg = call.messages[call.messages.length - 1].content;
  assert.ok(userMsg.includes("Retry Queues"), "must include system design core node");
  assert.ok(userMsg.includes("Queue Fairness"), "must include game theory core node");
  assert.ok(userMsg.includes("Core Domain Sources"), "must have core domain section");
  assert.ok(userMsg.includes("dsa.queue"), "must include DSA primary node");
});

test("generate repair with primary provider returns fallbackUsed false", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = validGeneratedArtifact();
  badArtifact.profileId = "wrong-learner";

  const fixedArtifact = { ...validGeneratedArtifact(), profileId: sampleProfile.id };

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(fixedArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated");
  assert.equal(result.fallbackUsed, false, "repair by primary provider must report fallbackUsed: false");
});

test("generate repair with fallback provider returns fallbackUsed true", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const badArtifact = validGeneratedArtifact();
  badArtifact.profileId = "wrong-learner";

  const fixedArtifact = { ...validGeneratedArtifact(), profileId: sampleProfile.id };

  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(fixedArtifact), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated");
  assert.equal(result.fallbackUsed, true, "repair by fallback provider must report fallbackUsed: true");
});

test("generate resolved context includes selected paired domain sources", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await generator.generate(sampleProfile.id, "dsa.queue");

  const call = aiProvider.calls[0];
  const userMsg = call.messages[call.messages.length - 1].content;
  assert.ok(userMsg.includes("Worker Queues"), "must include paired backend node");
});

test("generate does not substitute defaults for missing profile", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(null);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  await assert.rejects(
    generator.generate(sampleProfile.id, "dsa.queue"),
    /PROFILE_NOT_FOUND/
  );
});

test("generate emits generation.failed when parse failure repair also fails", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const proseContent = "Here is the artifact you asked for:\n\n{\"a\":1}\n\nI hope this helps!";
  const aiProvider = fakeAiProvider([
    { content: proseContent, model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });

  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generation_failed");
  const eventNames = logger.events.map((e) => e.event);
  assert.ok(eventNames.includes("generation.started"), "must emit generation.started");
  assert.ok(eventNames.includes("artifact.validation.failed"), "must emit validation.failed for parse failure");
  assert.ok(eventNames.includes("generation.failed"), "must emit generation.failed when repair also fails");
});

// ===========================================================================
// V2 prompt and repair contract — Task 0.3
// ===========================================================================

const v2Profile = {
  id: "local-learner-a1b2",
  name: "Alex",
  level: "beginner",
  language: "go",
  pairedDomains: ["backend"],
  selectedTopics: ["backend.go.concurrency"],
  goal: "Build reliable backend systems"
};

const v2PrimaryNode = {
  id: "backend.go.concurrency",
  title: "Go Concurrency: Worker Queues",
  domain: "backend",
  sourceText: "# Go Concurrency\n\nGoroutines, channels, and worker queues.",
  allowedVisualKinds: [],
  schemaVersion: 2,
  primitiveKind: "worker-queue",
  connections: ["dsa.queue", "system-design.queue-backpressure"]
};

function v2TopicContext() {
  return {
    primary: { ...v2PrimaryNode, sourceText: v2PrimaryNode.sourceText },
    core: [],
    paired: [],
    adjacent: [],
    schemaVersion: 2,
    primitiveKind: "worker-queue"
  };
}

function fakeTopicGraphV2() {
  return {
    async get() { return { ...v2PrimaryNode }; },
    async resolveContext() { return v2TopicContext(); },
    async list() { return []; },
    async load() { }
  };
}

function validV2Artifact() {
  return {
    schemaVersion: 2,
    artifactVersion: 1,
    profileId: v2Profile.id,
    topicId: v2PrimaryNode.id,
    title: "When a Go Worker Queue Fills",
    learningObjectives: [
      "Explain why a send to a full buffered channel blocks",
      "Distinguish channel capacity from worker throughput"
    ],
    experience: {
      mode: "guided-lab",
      primitive: {
        kind: "worker-queue",
        specVersion: 1,
        initialState: {
          producer: { id: "producer-1", status: "ready" },
          channel: { id: "jobs", capacity: 3, items: [{ id: "job-1", label: "J1" }, { id: "job-2", label: "J2" }] },
          workers: [{ id: "worker-1", status: "idle" }]
        }
      },
      snippets: [
        {
          id: "send-loop",
          language: "go",
          file: "main.go",
          code: "for _, job := range jobs {\n    queue <- job\n}",
          editable: false,
          annotations: [{ line: 2, text: "This send waits when the buffer is full." }]
        }
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
                  id: "send-job-3",
                  event: {
                    type: "channel.send",
                    target: "jobs",
                    payload: { item: { id: "job-3", label: "J3" } }
                  },
                  focus: ["producer-1", "jobs", "job-3"],
                  snippet: { id: "send-loop", lines: [2] },
                  caption: "J3 occupies the final buffer slot.",
                  narration: "The channel can now hold no more waiting jobs.",
                  animationPreset: "enqueue-from-producer"
                },
                {
                  id: "send-blocks",
                  event: {
                    type: "channel.send-blocked",
                    target: "producer-1",
                    payload: { item: { id: "job-4", label: "J4" } }
                  },
                  focus: ["producer-1", "jobs"],
                  snippet: { id: "send-loop", lines: [2] },
                  caption: "The next send waits.",
                  narration: "A send to a full buffered channel blocks until a worker receives a job.",
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
        { id: "worker-count", kind: "bounded-number", min: 1, max: 4, step: 1, default: 1 },
        { id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 }
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
    chat: {
      suggestedQuestions: ["Why is the producer blocked?", "Does a larger buffer improve throughput?"]
    },
    next: ["system-design.queue-backpressure"]
  };
}

test("buildArtifactMessagesV2 is exported and returns exactly one system and one user message", () => {
  assert.equal(typeof buildArtifactMessagesV2, "function");
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
});

test("v2 system message includes exact v2 contract envelope fields", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const systemMsg = messages[0].content;
  for (const field of [
    "schemaVersion",
    "artifactVersion",
    "profileId",
    "topicId",
    "title",
    "learningObjectives",
    "experience",
    "lab",
    "chat",
    "next"
  ]) {
    assert.ok(systemMsg.includes(field), `system message must reference v2 top-level field: ${field}`);
  }
});

test("v2 system message declares exact profile/topic/language and capability manifest subset", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(userMsg.includes(`Exact profileId: ${v2Profile.id}`));
  assert.ok(userMsg.includes(`Exact topicId: ${v2PrimaryNode.id}`));
  assert.ok(userMsg.includes(`Exact language: ${v2Profile.language}`));
  assert.ok(userMsg.includes("worker-queue"), "must advertise worker-queue primitive from manifest");
  assert.ok(userMsg.includes("channel.send"), "must advertise channel.send event from manifest");
  assert.ok(userMsg.includes("channel.send-blocked"), "must advertise channel.send-blocked from manifest");
  assert.ok(userMsg.includes("worker.receive"), "must advertise worker.receive from manifest");
  assert.ok(userMsg.includes("worker.complete"), "must advertise worker.complete from manifest");
  assert.ok(userMsg.includes("enqueue-from-producer"), "must advertise animation preset from manifest");
  assert.ok(userMsg.includes("guided-lab"), "must advertise guided-lab experience mode from manifest");
  assert.ok(userMsg.includes("go-tests"), "must advertise go-tests evaluation kind from manifest");
});

test("v2 system message includes visual-first rules and bounds", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const systemMsg = messages[0].content;
  assert.ok(/visual.*first/i.test(systemMsg), "must state visual-first principle");
  assert.ok(systemMsg.includes("snippets"), "must reference snippets");
  assert.ok(systemMsg.includes("scenes"), "must reference scenes");
  assert.ok(systemMsg.includes("steps"), "must reference steps");
  assert.ok(systemMsg.includes("prediction"), "must reference prediction checkpoints");
  assert.ok(systemMsg.includes("chapters"), "must reference chapters");
  assert.ok(systemMsg.includes("experiments"), "must reference experiments");
  assert.ok(systemMsg.includes("completionRules"), "must reference completion rules");
  assert.ok(systemMsg.includes("lab"), "must reference lab");
  assert.ok(/narration/i.test(systemMsg), "must reference narration");
  assert.ok(/caption/i.test(systemMsg), "must reference caption");
  assert.ok(/animationPreset/i.test(systemMsg), "must reference animationPreset");
});

test("v2 system message forbids executable frontend output", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const systemMsg = messages[0].content.toLowerCase();
  for (const forbidden of ["html", "jsx", "componentcode", "executablecode"]) {
    assert.ok(systemMsg.includes(forbidden), `must name forbidden field: ${forbidden}`);
  }
});

test("v2 prompt does not contain secrets, local paths, previous provider output, or unrelated capabilities", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  for (const msg of messages) {
    assert.ok(!msg.content.includes("sk-"), "must not contain API keys");
    assert.ok(!msg.content.includes("Bearer"), "must not contain Bearer tokens");
    assert.ok(!msg.content.includes("api_key"), "must not contain api_key");
    assert.ok(!msg.content.includes("authorization"), "must not contain authorization");
    assert.ok(!msg.content.includes("C:"), "must not contain Windows absolute paths");
    assert.ok(!msg.content.includes("/home/"), "must not contain Unix absolute paths");
    assert.ok(!msg.content.includes("assistant"), "must not contain previous assistant content");
    assert.ok(!msg.content.toLowerCase().includes("previous artifact"), "must not reference previous artifacts");
  }
  // Unrelated primitives/capabilities that are not in the manifest must not be advertised.
  const systemMsg = messages[0].content;
  assert.ok(!systemMsg.includes("react-flow"), "must not advertise unimplemented dependencies");
  assert.ok(!systemMsg.includes("xstate"), "must not advertise deferred dependencies");
  assert.ok(!systemMsg.includes("langgraph"), "must not advertise deferred dependencies");
});

test("v2 prompt excludes unrelated capabilities not in the capability manifest", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const systemMsg = messages[0].content;
  // The capability manifest subset line for primitives must list only worker-queue.
  const primitiveLine = systemMsg.split("\n").find((l) => l.startsWith("- Primitive kinds:"));
  assert.ok(primitiveLine, "system message must have a Primitive kinds line");
  assert.equal(primitiveLine, "- Primitive kinds: worker-queue", "primitive kinds must be only worker-queue");
  // V2 top-level fields and experience fields must not include v1-only concepts.
  assert.ok(!systemMsg.toLowerCase().includes("react-flow"), "must not advertise unimplemented dependencies");
  assert.ok(!systemMsg.toLowerCase().includes("xstate"), "must not advertise deferred dependencies");
  assert.ok(!systemMsg.toLowerCase().includes("langgraph"), "must not advertise deferred dependencies");
});

test("v2 user message includes profile language, level, and goal", () => {
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: v2TopicContext()
  });
  const userMsg = messages[1].content;
  assert.ok(userMsg.includes(v2Profile.language), "must include profile language");
  assert.ok(userMsg.includes(v2Profile.level), "must include profile level");
  assert.ok(userMsg.includes(v2Profile.goal), "must include profile goal");
});

test("v2 prompt caps serialized size at 96000 bytes", () => {
  const longPrimary = { ...v2PrimaryNode, sourceText: "z".repeat(40000) };
  const ctx = v2TopicContext();
  ctx.primary = { ...longPrimary };
  const { messages } = buildArtifactMessagesV2({
    profile: v2Profile,
    topicContext: ctx
  });
  const serialized = JSON.stringify(messages);
  assert.ok(Buffer.byteLength(serialized, "utf8") <= 96000, "serialized v2 context must not exceed 96000 bytes");
});

test("v2 prompt does not mutate profile or topic context", () => {
  const profile = JSON.parse(JSON.stringify(v2Profile));
  const ctx = v2TopicContext();
  const ctxBackup = JSON.parse(JSON.stringify(ctx));
  buildArtifactMessagesV2({ profile, topicContext: ctx });
  assert.deepEqual(profile, v2Profile);
  assert.deepEqual(ctx, ctxBackup);
});

test("generate routes to v2 prompt when topic context signals schemaVersion 2", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const artifact = validV2Artifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  const result = await generator.generate(v2Profile.id, v2PrimaryNode.id);

  assert.equal(result.status, "generated");
  assert.equal(result.artifact.schemaVersion, 2, "must cache and return the v2 artifact");
  const sentMessages = aiProvider.calls[0].messages;
  assert.equal(sentMessages.length, 2);
  assert.ok(sentMessages[0].content.includes("schemaVersion") && sentMessages[0].content.includes("worker-queue"), "initial prompt must be v2");
});

test("v2 initial prompt forbids executable frontend output end-to-end", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(validV2Artifact()), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);
  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  await generator.generate(v2Profile.id, v2PrimaryNode.id);

  const systemMsg = aiProvider.calls[0].messages[0].content.toLowerCase();
  for (const forbidden of ["html", "jsx", "componentcode", "executablecode"]) {
    assert.ok(systemMsg.includes(forbidden), `v2 initial prompt must name forbidden field: ${forbidden}`);
  }
});

test("v2 repair message includes stable validation errors, exact constraints, and capability subset without source or invalid responses", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const badArtifact = validV2Artifact();
  badArtifact.profileId = "wrong-learner";
  const fixedArtifact = validV2Artifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(fixedArtifact), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  const result = await generator.generate(v2Profile.id, v2PrimaryNode.id);

  assert.equal(result.status, "generated");
  const repairMessages = aiProvider.calls[1].messages;
  const repairUserMsg = repairMessages[repairMessages.length - 1].content;

  assert.ok(repairUserMsg.includes("IDENTIFIER_MISMATCH"), "repair must include stable validation code");
  assert.ok(repairUserMsg.includes(`Exact profileId: ${v2Profile.id}`), "repair must repeat exact profileId");
  assert.ok(repairUserMsg.includes(`Exact topicId: ${v2PrimaryNode.id}`), "repair must repeat exact topicId");
  assert.ok(repairUserMsg.includes(`Exact language: ${v2Profile.language}`), "repair must repeat exact language");
  assert.ok(repairUserMsg.includes("worker-queue"), "repair must repeat capability subset");
  assert.ok(repairUserMsg.includes("channel.send"), "repair must repeat supported events");
  assert.ok(repairUserMsg.includes("guided-lab"), "repair must repeat supported mode");
  assert.ok(!repairUserMsg.includes(v2PrimaryNode.sourceText), "repair must not include source Markdown");
  assert.ok(!repairUserMsg.includes(JSON.stringify(badArtifact)), "repair must not include invalid response body");
  assert.ok(!repairUserMsg.includes("Bearer"), "repair must not include secrets");
  assert.ok(!repairUserMsg.includes("C:"), "repair must not include local paths");
  assert.ok(!repairUserMsg.includes("sk-"), "repair must not include API keys");
});

test("v2 repair system message forbids executable frontend output", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const badArtifact = validV2Artifact();
  badArtifact.profileId = "wrong-learner";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(validV2Artifact()), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);
  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  await generator.generate(v2Profile.id, v2PrimaryNode.id);

  const repairSystemMsg = aiProvider.calls[1].messages[0].content.toLowerCase();
  for (const forbidden of ["html", "jsx", "componentcode", "executablecode"]) {
    assert.ok(repairSystemMsg.includes(forbidden), `v2 repair system message must name forbidden field: ${forbidden}`);
  }
});

test("v2 repair fails gracefully when second attempt is also invalid", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const badArtifact1 = validV2Artifact();
  badArtifact1.profileId = "wrong-learner";
  const badArtifact2 = validV2Artifact();
  badArtifact2.experience.mode = "nope";
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(badArtifact1), model: "minimaxai/minimax-m3", fallbackUsed: false },
    { content: JSON.stringify(badArtifact2), model: "deepseek-ai/deepseek-v4-pro", fallbackUsed: true }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  const result = await generator.generate(v2Profile.id, v2PrimaryNode.id);

  assert.equal(result.status, "generation_failed");
  assert.equal(aiProvider.callCount(), 2);
  assert.equal(cache.entries.filter((e) => e.op === "write").length, 0);
});

test("v2 generation logs never contain prompts or generated content", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const cache = fakeArtifactCache();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(validV2Artifact()), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);
  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  await generator.generate(v2Profile.id, v2PrimaryNode.id);

  const allLog = JSON.stringify(logger.events);
  assert.ok(!allLog.includes(v2PrimaryNode.sourceText), "logs must not contain source text");
  assert.ok(!allLog.includes(JSON.stringify(validV2Artifact())), "logs must not contain artifact content");
});

test("v1 generator behavior is preserved when topic context does not signal schemaVersion 2", async () => {
  const logger = fakeLogger();
  const profileStore = fakeProfileStore(sampleProfile);
  const topicGraph = fakeTopicGraph();
  const cache = fakeArtifactCache();
  const artifact = validGeneratedArtifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);

  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: cache, aiProvider, logger });
  const result = await generator.generate(sampleProfile.id, "dsa.queue");

  assert.equal(result.status, "generated");
  assert.equal(result.artifact.schemaVersion, 1, "v1 path must remain intact");
  const userMsg = aiProvider.calls[0].messages[aiProvider.calls[0].messages.length - 1].content;
  assert.ok(userMsg.includes("Allowed visual kinds for this topic"), "v1 prompt signature must be preserved");
});

// ===========================================================================
// Task 0.4: Cache version cutover through the generator. A v1 generated cache
// entry is reported as stale for the v2 runtime and is regenerated; v2 cache
// remains a hit; invalid cache is still quarantined. These tests use the real
// artifactCache against a temporary directory so the cutover is exercised end
// to end, not just asserted on a mock.
// ===========================================================================

async function temporaryDirectoryForGen(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "refract-gen-cutover-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function realCacheForCutover(generatedRoot) {
  return createArtifactCache({ generatedRoot, validator: validateArtifact });
}

test("get treats a stale v1 generated cache as not_generated for a v2 topic", async (t) => {
  const generatedRoot = await temporaryDirectoryForGen(t);
  const cache = realCacheForCutover(generatedRoot);
  const cacheDirectory = path.join(generatedRoot, "artifacts", v2Profile.id, v2PrimaryNode.id);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(
    path.join(cacheDirectory, "artifact.json"),
    JSON.stringify({
      ...validGeneratedArtifact(),
      profileId: v2Profile.id,
      topicId: v2PrimaryNode.id,
      visual: { kind: "queue", initialState: { items: [] }, controls: [] },
      practice: { ...validGeneratedArtifact().practice, supportedTraceEvents: ["queue.enqueue", "queue.dequeue"] }
    }),
    "utf8"
  );

  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const aiProvider = fakeAiProvider([]);
  const readStatuses = [];
  const wrappedCache = {
    async read(ctx) {
      const r = await cache.read(ctx);
      readStatuses.push(r.status);
      return r;
    },
    write: cache.write.bind(cache)
  };
  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: wrappedCache, aiProvider, logger });

  const result = await generator.get(v2Profile.id, v2PrimaryNode.id);
  assert.equal(result.status, "not_generated", "v1 cache must be stale/not_generated for v2 runtime");
  assert.equal(result.artifact, undefined, "stale v1 artifact must not be returned as v2");
  assert.ok(readStatuses.includes("stale"), "cache read must report stale, not invalid, for a version-cut v1 entry");
});

test("generate regenerates a v2 artifact when a stale v1 cache entry is present", async (t) => {
  const generatedRoot = await temporaryDirectoryForGen(t);
  const cache = realCacheForCutover(generatedRoot);
  const cacheDirectory = path.join(generatedRoot, "artifacts", v2Profile.id, v2PrimaryNode.id);
  const { mkdir, writeFile, readFile } = await import("node:fs/promises");
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(
    path.join(cacheDirectory, "artifact.json"),
    JSON.stringify({
      ...validGeneratedArtifact(),
      profileId: v2Profile.id,
      topicId: v2PrimaryNode.id,
      visual: { kind: "queue", initialState: { items: [] }, controls: [] },
      practice: { ...validGeneratedArtifact().practice, supportedTraceEvents: ["queue.enqueue", "queue.dequeue"] }
    }),
    "utf8"
  );

  const logger = fakeLogger();
  const profileStore = fakeProfileStore(v2Profile);
  const topicGraph = fakeTopicGraphV2();
  const v2Artifact = validV2Artifact();
  const aiProvider = fakeAiProvider([
    { content: JSON.stringify(v2Artifact), model: "minimaxai/minimax-m3", fallbackUsed: false }
  ]);
  const readStatuses = [];
  const wrappedCache = {
    async read(ctx) {
      const r = await cache.read(ctx);
      readStatuses.push(r.status);
      return r;
    },
    write: cache.write.bind(cache)
  };
  const generator = createArtifactGenerator({ profileStore, topicGraph, artifactCache: wrappedCache, aiProvider, logger });

  const result = await generator.generate(v2Profile.id, v2PrimaryNode.id);
  assert.equal(result.status, "generated", "stale v1 cache must trigger regeneration");
  assert.equal(result.artifact.schemaVersion, 2, "regenerated artifact must be v2");
  assert.equal(aiProvider.callCount(), 1, "provider must be called once to regenerate");
  assert.ok(readStatuses.includes("stale"), "regeneration must be triggered by a stale read, not a hit");

  const persisted = JSON.parse(await readFile(path.join(cacheDirectory, "artifact.json"), "utf8"));
  assert.equal(persisted.schemaVersion, 2, "regeneration must overwrite the stale v1 cache entry with v2");

  const secondGet = await generator.get(v2Profile.id, v2PrimaryNode.id);
  assert.equal(secondGet.status, "cached", "regenerated v2 cache must be a hit on reread");
  assert.equal(secondGet.artifact.schemaVersion, 2);
});
