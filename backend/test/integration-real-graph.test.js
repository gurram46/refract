import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createTopicGraph } from "../src/topics/topicGraph.js";

test("loads real curriculum/topic-graph.json and resolves dsa.queue for Go+backend+language profile", async () => {
  const repoRoot = path.resolve("../");
  const graph = createTopicGraph({ repoRoot });

  await graph.load();

  const context = await graph.resolveContext("dsa.queue", {
    name: "Real learner",
    level: "beginner",
    language: "go",
    pairedDomains: ["backend", "language"],
    selectedTopics: ["dsa.queue"],
    goal: "Learn queue fundamentals"
  });

  assert.equal(context.primary.id, "dsa.queue");
  assert.ok(context.primary.title);
  assert.deepEqual(
    context.core.map((n) => n.id).sort(),
    ["game-theory.concepts", "system-design.map"].sort()
  );
  const pairedIds = context.paired.map((n) => n.id).sort();
  assert.ok(pairedIds.includes("backend.go.concurrency"), `expected backend.go.concurrency in paired, got ${JSON.stringify(pairedIds)}`);
  assert.ok(pairedIds.includes("language.go.five-lens"), `expected language.go.five-lens in paired, got ${JSON.stringify(pairedIds)}`);
  assert.equal(context.adjacent.length, 0);
  assert.ok(context.core.every((n) => n.sourceText === undefined || typeof n.sourceText === "string"));
  assert.ok(context.paired.every((n) => n.sourceText === undefined || typeof n.sourceText === "string"));
});