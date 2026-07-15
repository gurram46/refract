import assert from "node:assert/strict";
import test from "node:test";
import * as productState from "./productState.js";
import {
  selectActiveProfile,
  selectActiveTopic,
  buildTutorContext,
  artifactStatusLabel,
  computeActiveSurface,
  partitionTopicsByDomain
} from "./productState.js";

const PROFILES = [
  { id: "p1", language: "python", level: "beginner", goal: "master fundamentals", pairedDomains: ["backend", "ml"] },
  { id: "p2", language: "go", level: "expert", goal: "system design", pairedDomains: ["backend", "language"] }
];

const TOPICS = [
  { id: "dsa.queue", title: "Queue" },
  { id: "dsa.stack", title: "Stack" },
  { id: "backend.api-design", title: "API Design" },
  { id: "ml.trees", title: "Decision Trees" },
  { id: "system-design.caching", title: "Caching" },
  { id: "game-theory.nash", title: "Nash Equilibrium" }
];

test("formats structured artifact decisions as renderable text", () => {
  assert.equal(typeof productState.formatDecision, "function");
  assert.equal(
    productState.formatDecision({ label: "Use a channel", outcome: "Workers coordinate safely." }),
    "Use a channel: Workers coordinate safely."
  );
});

test("selectActiveProfile returns first profile when no id given", () => {
  const result = selectActiveProfile(PROFILES, null);
  assert.equal(result.id, "p1");
});

test("selectActiveProfile returns null for empty array", () => {
  assert.equal(selectActiveProfile([], null), null);
});

test("selectActiveProfile returns null for non-array", () => {
  assert.equal(selectActiveProfile(null, "p1"), null);
});

test("selectActiveProfile returns selected by id", () => {
  assert.equal(selectActiveProfile(PROFILES, "p2").id, "p2");
});

test("selectActiveProfile falls back to first if id not found", () => {
  assert.equal(selectActiveProfile(PROFILES, "p99").id, "p1");
});

test("selectActiveTopic picks highest-scored topic from paired domains", () => {
  const topic = selectActiveTopic(TOPICS, null, { pairedDomains: ["backend", "ml"] });
  assert.ok(topic.id === "backend.api-design" || topic.id === "ml.trees",
    `Expected backend.api-design or ml.trees but got ${topic.id}`);
});

test("selectActiveTopic returns null for empty topics", () => {
  assert.equal(selectActiveTopic([], null, PROFILES[0]), null);
});

test("selectActiveTopic returns null for non-array", () => {
  assert.equal(selectActiveTopic(null, null, PROFILES[0]), null);
});

test("selectActiveTopic returns selected topic even if score lower", () => {
  const topic = selectActiveTopic(TOPICS, "dsa.queue", { pairedDomains: [] });
  assert.equal(topic.id, "dsa.queue");
});

test("selectActiveTopic with no profile picks first topic", () => {
  const topic = selectActiveTopic(TOPICS, null, null);
  assert.ok(topic);
});

test("buildTutorContext returns backend-compatible top-level keys", () => {
  const ctx = buildTutorContext({
    artifact: { title: "Queue", summary: "FIFO", topicId: "dsa.queue", profileId: "p1" },
    activeProfile: PROFILES[0],
    activeTopic: TOPICS[0],
    action: "explain",
    question: "How does a queue work?",
    tab: "canvas"
  });
  assert.equal(ctx.artifactId, "dsa.queue");
  assert.equal(ctx.tab, "canvas");
  assert.equal(ctx.question, "How does a queue work?");
  assert.equal(ctx.language, "python");
  assert.equal(ctx.code, null);
  assert.deepEqual(ctx.canvasEvents, []);
});

test("buildTutorContext derives artifactId from topic when no artifact", () => {
  const ctx = buildTutorContext({
    activeTopic: TOPICS[0],
    tab: "practice"
  });
  assert.equal(ctx.artifactId, "dsa.queue");
  assert.equal(ctx.tab, "practice");
});

test("buildTutorContext defaults artifactId to null when no topic or artifact", () => {
  const ctx = buildTutorContext({});
  assert.equal(ctx.artifactId, null);
  assert.equal(ctx.tab, null);
  assert.equal(ctx.question, null);
  assert.equal(ctx.language, null);
});

test("buildTutorContext nested context preserves artifact basics", () => {
  const ctx = buildTutorContext({
    artifact: { title: "Queue", summary: "FIFO", topicId: "dsa.queue", profileId: "p1" },
    activeProfile: PROFILES[0],
    activeTopic: TOPICS[0],
    action: "explain"
  });
  assert.equal(ctx.context.artifact.title, "Queue");
  assert.equal(ctx.context.action, "explain");
  assert.equal(ctx.context.profile.language, "python");
});

test("buildTutorContext nested context bounds chat messages to last 40", () => {
  const msgs = Array.from({ length: 50 }, (_, i) => ({ role: "user", content: `msg${i}` }));
  const ctx = buildTutorContext({ session: { chatMessages: msgs } });
  assert.equal(ctx.context.recentMessages.length, 40);
  assert.equal(ctx.context.recentMessages[0].content, "msg10");
});

test("buildTutorContext bounds top-level code to 5000 chars", () => {
  const long = "a".repeat(7000);
  const ctx = buildTutorContext({ session: { code: long } });
  assert.equal(ctx.code.length, 5000);
});

test("buildTutorContext sets runResult top-level string from session", () => {
  const ctx = buildTutorContext({ session: { latestRunResult: { success: true, summary: "all pass" } } });
  assert.equal(ctx.runResult, "success: all pass");
});

test("buildTutorContext sets runResult null without session", () => {
  const ctx = buildTutorContext({});
  assert.equal(ctx.runResult, null);
});

test("buildTutorContext maps canvasEvents from session recentEvents", () => {
  const events = [{ type: "click", ts: 1 }, { type: "key", ts: 2 }];
  const ctx = buildTutorContext({ session: { recentEvents: events } });
  assert.equal(ctx.canvasEvents.length, 2);
  assert.equal(ctx.canvasEvents[0].type, "click");
});

test("buildTutorContext nested context has traceEvents bounded to last 100", () => {
  const events = Array.from({ length: 150 }, (_, i) => ({ step: i }));
  const ctx = buildTutorContext({ session: { traceEvents: events } });
  assert.equal(ctx.context.traceEvents.length, 100);
});

test("buildTutorContext nested context includes currentStep and chatSummary", () => {
  const ctx = buildTutorContext({ session: { currentStep: 3, chatSummary: "on Queue" } });
  assert.equal(ctx.context.currentStep, 3);
  assert.equal(ctx.context.chatSummary, "on Queue");
});

test("buildTutorContext nested context includes latestRun details", () => {
  const ctx = buildTutorContext({ session: { latestRunResult: { success: true, summary: "all pass" } } });
  assert.equal(ctx.context.latestRun.success, true);
  assert.equal(ctx.context.latestRun.summary, "all pass");
});

test("buildTutorContext nested context excludes undefined fields gracefully", () => {
  const ctx = buildTutorContext({});
  assert.equal(ctx.artifactId, null);
  assert.equal(ctx.tab, null);
  assert.equal(ctx.question, null);
  assert.equal(ctx.runResult, null);
  assert.equal(typeof ctx.context, "object");
});

test("buildTutorContext accepts question input", () => {
  const ctx = buildTutorContext({
    activeTopic: TOPICS[0],
    question: "Why is dequeue O(1)?",
    activeProfile: PROFILES[0]
  });
  assert.equal(ctx.question, "Why is dequeue O(1)?");
  assert.equal(ctx.artifactId, "dsa.queue");
});

test("artifactStatusLabel returns cached for status cached", () => {
  assert.equal(artifactStatusLabel({ status: "cached" }), "cached");
});

test("artifactStatusLabel returns generated for status generated", () => {
  assert.equal(artifactStatusLabel({ status: "generated" }), "generated");
});

test("artifactStatusLabel returns not_generated for null input", () => {
  assert.equal(artifactStatusLabel(null), "not_generated");
});

test("artifactStatusLabel returns not_generated for unknown status", () => {
  assert.equal(artifactStatusLabel({ status: "pending" }), "not_generated");
});

test("computeActiveSurface returns profile-builder when no profile", () => {
  assert.equal(computeActiveSurface(null, null, "not_generated"), "profile-builder");
});

test("computeActiveSurface returns game-field when no topic", () => {
  assert.equal(computeActiveSurface(PROFILES[0], null, "not_generated"), "game-field");
});

test("computeActiveSurface returns artifact-canvas when cached", () => {
  assert.equal(computeActiveSurface(PROFILES[0], TOPICS[0], "cached"), "artifact-canvas");
});

test("computeActiveSurface returns artifact-canvas when generated", () => {
  assert.equal(computeActiveSurface(PROFILES[0], TOPICS[0], "generated"), "artifact-canvas");
});

test("computeActiveSurface returns game-field when not_generated with profile and topic", () => {
  assert.equal(computeActiveSurface(PROFILES[0], TOPICS[0], "not_generated"), "game-field");
});

test("partitionTopicsByDomain separates core, paired, other", () => {
  const { core, paired, other } = partitionTopicsByDomain(TOPICS);
  assert.equal(core.length, 4);
  assert.ok(core.every((t) => /^(dsa|system-design|game-theory)\./.test(t.id)));
  assert.equal(paired.length, 2);
  assert.equal(other.length, 0);
});

test("partitionTopicsByDomain handles empty array", () => {
  const result = partitionTopicsByDomain([]);
  assert.equal(result.core.length, 0);
  assert.equal(result.paired.length, 0);
});
