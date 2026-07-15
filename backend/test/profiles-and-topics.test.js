import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CORE_DOMAINS,
  PAIRED_DOMAINS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LEVELS
} from "../src/config/options.js";
import { validateProfile } from "../src/profiles/profileSchema.js";
import { createProfileStore } from "../src/profiles/profileStore.js";
import { createTopicGraph } from "../src/topics/topicGraph.js";

const validInput = {
  name: "Local learner",
  level: "beginner",
  language: "go",
  pairedDomains: ["backend"],
  selectedTopics: ["dsa.queue"],
  goal: "Build reliable services"
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "refract-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("exports the permanent core and supported profile options", () => {
  assert.deepEqual(CORE_DOMAINS, ["dsa", "system-design", "game-theory"]);
  assert.deepEqual(PAIRED_DOMAINS, ["language", "backend", "frontend", "ml", "ai", "data-science"]);
  assert.deepEqual(SUPPORTED_LEVELS, ["beginner", "intermediate", "expert"]);
  assert.ok(SUPPORTED_LANGUAGES.includes("go"));
});

test("validates and normalizes a learner-created profile", () => {
  const valid = validateProfile(validInput);

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, {
    ...validInput,
    coreDomains: ["dsa", "system-design", "game-theory"]
  });
  assert.notStrictEqual(valid.value.pairedDomains, validInput.pairedDomains);
});

test("accepts language as a supported paired-domain selection", () => {
  const result = validateProfile({ ...validInput, pairedDomains: ["language"] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.pairedDomains, ["language"]);
});

test("rejects invalid profile selections and bounds", () => {
  const cases = [
    ["unsupported paired domain", { pairedDomains: ["mobile"] }],
    ["unknown level", { level: "wizard" }],
    ["unknown language", { language: "brainfuck" }],
    ["malformed topic identifier", { selectedTopics: ["../queue"] }],
    ["empty name", { name: "   " }],
    ["goal over 500 characters", { goal: "x".repeat(501) }]
  ];

  for (const [label, override] of cases) {
    const result = validateProfile({ ...validInput, ...override });
    assert.equal(result.ok, false, label);
    assert.ok(result.errors.length > 0, label);
  }
});

test("generated ID exhausts retries and throws stable error", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const now = () => new Date("2026-07-10T12:00:00.000Z");

  let callIndex = -1;
  function exhaustRandomBytes(size) {
    callIndex++;
    const index = callIndex % 32;
    const buf = Buffer.alloc(size, 0);
    const hex = index.toString(16).padStart(size * 2, "0");
    for (let i = 0; i < size; i++) {
      buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return buf;
  }

  const store = createProfileStore({ dataDir, now, randomBytes: exhaustRandomBytes });

  const MAX_ATTEMPTS = 32;
  const collisionName = "Collision Tester";
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await store.save({ ...validInput, name: collisionName });
  }

  const savedIds = (await store.list()).map((p) => p.id);
  assert.equal(savedIds.length, MAX_ATTEMPTS, "must have saved exactly 32 profiles");

  await assert.rejects(
    store.save({ ...validInput, name: collisionName }),
    /Unable to generate a unique profile ID after \d+ attempts/
  );
});

test("generated ID is derived from at least 8 random bytes", async (t) => {
  let recordedSize = 0;
  function sizeTrackingRandomBytes(size) {
    recordedSize = size;
    return Buffer.alloc(size, 0xab);
  };
  const dataDir = await temporaryDirectory(t);
  const now = () => new Date("2026-07-10T12:00:00.000Z");
  const store = createProfileStore({ dataDir, now, randomBytes: sizeTrackingRandomBytes });

  const saved = await store.save(validInput);

  assert.ok(recordedSize >= 8, `randomBytes must request at least 8 bytes, got ${recordedSize}`);
  assert.ok(saved.id, "must generate a profile ID");
});

test("persists generated profiles atomically without creating defaults", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const now = () => new Date("2026-07-10T12:00:00.000Z");
  const store = createProfileStore({ dataDir, now });

  assert.deepEqual(await store.list(), []);
  const saved = await store.save(validInput);

  assert.match(saved.id, /^local-learner-[a-f0-9]{16}$/);
  assert.equal(saved.createdAt, "2026-07-10T12:00:00.000Z");
  assert.equal(saved.updatedAt, saved.createdAt);
  assert.deepEqual(saved.coreDomains, CORE_DOMAINS);
  assert.deepEqual(await store.get(saved.id), saved);
  assert.deepEqual(await store.list(), [saved]);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dataDir, "profiles", `${saved.id}.json`), "utf8")),
    saved
  );
  await assert.rejects(readFile(path.join(dataDir, "profiles", `${saved.id}.json.tmp`), "utf8"));
});

test("updates valid profile IDs and rejects unsafe IDs", async (t) => {
  const dataDir = await temporaryDirectory(t);
  let instant = "2026-07-10T12:00:00.000Z";
  const store = createProfileStore({ dataDir, now: () => new Date(instant) });
  const saved = await store.save(validInput);
  instant = "2026-07-10T13:00:00.000Z";

  const updated = await store.save({ ...saved, goal: "A changed goal" });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.equal(updated.updatedAt, instant);
  await assert.rejects(store.get("../default"), /Invalid profile ID/);
  await assert.rejects(store.save({ ...validInput, id: "../default" }), /Invalid profile ID/);
});

async function createGraphFixture(t, manifestOverride) {
  const repoRoot = await temporaryDirectory(t);
  const files = {
    "dsa/queues.md": "queue source",
    "system-design/map.md": "system source",
    "game-theory/concepts.md": "game source",
    "backend/go/concurrency.md": "backend source",
    "languages/go/queues.md": "go source",
    "frontend/queues.md": "frontend source"
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  const manifest = manifestOverride ?? {
    schemaVersion: 1,
    nodes: [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "dsa/queues.md", allowedVisualKinds: ["queue"], connections: ["system-design.map", "game-theory.concepts", "backend.go.concurrency", "language.go.queue", "frontend.queue"] },
      { id: "system-design.map", title: "System map", domain: "system-design", source: "system-design/map.md", allowedVisualKinds: [], connections: [] },
      { id: "game-theory.concepts", title: "Game theory", domain: "game-theory", source: "game-theory/concepts.md", allowedVisualKinds: [], connections: [] },
      { id: "backend.go.concurrency", title: "Go concurrency", domain: "backend", source: "backend/go/concurrency.md", allowedVisualKinds: [], connections: [] },
      { id: "language.go.queue", title: "Queue in Go", domain: "language", source: "languages/go/queues.md", allowedVisualKinds: [], connections: [] },
      { id: "frontend.queue", title: "Queue UI", domain: "frontend", source: "frontend/queues.md", allowedVisualKinds: [], connections: [] }
    ]
  };
  await mkdir(path.join(repoRoot, "curriculum"), { recursive: true });
  await writeFile(path.join(repoRoot, "curriculum", "topic-graph.json"), JSON.stringify(manifest));
  return repoRoot;
}

test("loads once and resolves only core and selected-domain source text", async (t) => {
  const repoRoot = await createGraphFixture(t);
  let manifestReads = 0;
  const instrumentedFs = {
    realpath,
    async readFile(filePath, encoding) {
      if (filePath.endsWith("topic-graph.json")) manifestReads += 1;
      return readFile(filePath, encoding);
    }
  };
  const graph = createTopicGraph({ repoRoot, fs: instrumentedFs });

  await graph.load();
  const context = await graph.resolveContext("dsa.queue", validInput);
  await graph.list();

  assert.equal(manifestReads, 1);
  assert.equal(context.primary.sourceText, "queue source");
  assert.deepEqual(context.core.map((node) => node.id), ["system-design.map", "game-theory.concepts"]);
  assert.deepEqual(context.paired.map((node) => node.id), ["backend.go.concurrency"]);
  assert.deepEqual(context.adjacent.map((node) => node.id), ["language.go.queue", "frontend.queue"]);
  assert.ok(context.core.every((node) => typeof node.sourceText === "string"));
  assert.ok(context.paired.every((node) => typeof node.sourceText === "string"));
  assert.ok(context.adjacent.every((node) => !("sourceText" in node)));
});

test("loads matching language source only when language is explicitly paired", async (t) => {
  const repoRoot = await createGraphFixture(t);
  const graph = createTopicGraph({ repoRoot });

  const context = await graph.resolveContext("dsa.queue", {
    ...validInput,
    pairedDomains: ["backend", "language"]
  });

  assert.deepEqual(context.paired.map((node) => node.id), ["backend.go.concurrency", "language.go.queue"]);
  assert.equal(context.paired.find((node) => node.id === "language.go.queue").sourceText, "go source");
});

test("accepts an injected graph path inside the repository root", async (t) => {
  const repoRoot = await createGraphFixture(t);
  const graphPath = path.join(repoRoot, "curriculum", "topic-graph.json");
  const graph = createTopicGraph({ repoRoot, graphPath });

  assert.equal((await graph.get("dsa.queue")).title, "Queue");
});

test("does not resolve source text for a different selected language", async (t) => {
  const repoRoot = await createGraphFixture(t);
  const graph = createTopicGraph({ repoRoot });

  const context = await graph.resolveContext("dsa.queue", {
    ...validInput,
    language: "python",
    pairedDomains: ["language"]
  });

  assert.ok(!context.paired.some((node) => node.id === "language.go.queue"));
  assert.ok(context.adjacent.some((node) => node.id === "language.go.queue"));
});

test("projects manifest nodes so injected source text cannot reach adjacent context", async (t) => {
  const manifest = {
    schemaVersion: 1,
    nodes: [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "dsa/queues.md", allowedVisualKinds: ["queue"], connections: ["frontend.queue"] },
      { id: "frontend.queue", title: "Queue UI", domain: "frontend", source: "frontend/queues.md", sourceText: "injected secret", allowedVisualKinds: [], connections: [] }
    ]
  };
  const repoRoot = await createGraphFixture(t, manifest);
  const graph = createTopicGraph({ repoRoot });

  const context = await graph.resolveContext("dsa.queue", validInput);

  assert.equal("sourceText" in context.adjacent[0], false);
  assert.equal("sourceText" in (await graph.get("frontend.queue")), false);
});

test("rejects a source symlink that escapes the canonical repository root", async (t) => {
  const repoRoot = await createGraphFixture(t);
  const outsideDirectory = await temporaryDirectory(t);
  const outsideSource = path.join(outsideDirectory, "secret.md");
  const linkedDirectory = path.join(repoRoot, "dsa", "linked");
  await writeFile(outsideSource, "outside secret");
  try {
    await symlink(outsideDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error?.code)) {
      t.skip(`symbolic links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const manifest = {
    schemaVersion: 1,
    nodes: [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "dsa/linked/secret.md", allowedVisualKinds: ["queue"], connections: [] }
    ]
  };
  await writeFile(path.join(repoRoot, "curriculum", "topic-graph.json"), JSON.stringify(manifest));
  const graph = createTopicGraph({ repoRoot });

  await assert.rejects(graph.load(), /escapes the repository root/);
});

test("resolveContext rejects malformed topic IDs before loading the graph", async () => {
  let readAttempted = false;
  const graph = createTopicGraph({
    repoRoot: path.resolve("."),
    fs: {
      async realpath(value) { return value; },
      async readFile() {
        readAttempted = true;
        throw new Error("graph read should not occur");
      }
    }
  });

  await assert.rejects(graph.resolveContext("../queue", validInput), /Invalid topic ID/);
  assert.equal(readAttempted, false);
});

test("reports a missing optional source without failing primary resolution", async (t) => {
  const repoRoot = await createGraphFixture(t);
  await rm(path.join(repoRoot, "system-design", "map.md"));
  const warnings = [];
  const graph = createTopicGraph({ repoRoot, logger: { warn: (...args) => warnings.push(args) } });

  const context = await graph.resolveContext("dsa.queue", validInput);

  assert.equal(context.primary.id, "dsa.queue");
  assert.equal(context.core.find((node) => node.id === "system-design.map").sourceText, undefined);
  assert.deepEqual(warnings[0], ["topic_source.missing", { topicId: "system-design.map", source: "system-design/map.md" }]);
});

test("rejects unsafe or inconsistent graph manifests", async (t) => {
  const invalidManifests = [
    ["duplicate IDs", [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "dsa/queues.md", allowedVisualKinds: [], connections: [] },
      { id: "dsa.queue", title: "Queue again", domain: "dsa", source: "dsa/queues.md", allowedVisualKinds: [], connections: [] }
    ]],
    ["unknown connection", [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "dsa/queues.md", allowedVisualKinds: [], connections: ["dsa.missing"] }
    ]],
    ["unsupported domain", [
      { id: "dsa.queue", title: "Queue", domain: "mobile", source: "dsa/queues.md", allowedVisualKinds: [], connections: [] }
    ]],
    ["traversal path", [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: "../secret.md", allowedVisualKinds: [], connections: [] }
    ]],
    ["absolute path", [
      { id: "dsa.queue", title: "Queue", domain: "dsa", source: path.resolve("secret.md"), allowedVisualKinds: [], connections: [] }
    ]]
  ];

  for (const [label, nodes] of invalidManifests) {
    const repoRoot = await createGraphFixture(t, { schemaVersion: 1, nodes });
    const graph = createTopicGraph({ repoRoot });
    await assert.rejects(graph.load(), undefined, label);
  }
});
