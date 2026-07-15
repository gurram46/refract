import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionStore } from "../src/memory/sessionStore.js";

const PROFILE_ID = "local-learner-abc123";
const TOPIC_ID = "dsa.queue";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "refract-session-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function deterministicSummarizer() {
  const calls = [];
  const summarize = async (messages) => {
    calls.push(messages.length);
    const last = messages[messages.length - 1];
    return `Summary of ${messages.length} messages; last role=${last?.role}`;
  };
  return { summarize, calls };
}

function makeMessage(role, index) {
  return { role, content: `message ${index}` };
}

const ALLOWED_UPDATE_KEYS = [
  "canvasState",
  "recentEvents",
  "code",
  "latestRunResult",
  "traceEvents",
  "chatMessages",
  "chatSummary",
  "currentStep",
  "progress"
];

test("createSessionStore rejects a missing dataDir", () => {
  assert.throws(() => createSessionStore({}), /dataDir is required/);
});

test("get returns an empty session shape before any update", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const session = await store.get(PROFILE_ID, TOPIC_ID);

  assert.deepEqual(session, {
    profileId: PROFILE_ID,
    topicId: TOPIC_ID,
    canvasState: null,
    recentEvents: [],
    code: null,
    latestRunResult: null,
    traceEvents: [],
    chatMessages: [],
    chatSummary: null,
    currentStep: null,
    progress: null
  });
});

test("get rejects malformed profile IDs", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(store.get("../escape", TOPIC_ID), /Invalid profile ID/);
});

test("get rejects malformed topic IDs", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(store.get(PROFILE_ID, "../escape"), /Invalid topic ID/);
});

test("update rejects malformed profile IDs", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update("../escape", TOPIC_ID, { canvasState: {} }),
    /Invalid profile ID/
  );
});

test("update rejects malformed topic IDs", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update(PROFILE_ID, "../escape", { canvasState: {} }),
    /Invalid topic ID/
  );
});

test("update persists canvas state and survives a new store instance", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const now = () => new Date("2026-07-11T10:00:00.000Z");
  const store = createSessionStore({ dataDir, now });

  await store.update(PROFILE_ID, TOPIC_ID, { canvasState: { items: [1, 2, 3] } });

  const reopened = createSessionStore({ dataDir, now });
  const session = await reopened.get(PROFILE_ID, TOPIC_ID);

  assert.deepEqual(session.canvasState, { items: [1, 2, 3] });
  assert.equal(session.profileId, PROFILE_ID);
  assert.equal(session.topicId, TOPIC_ID);
});

test("update persists code, latest run result, current step, and chat summary", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, {
    code: "fn main() {}",
    latestRunResult: { pass: 4, fail: 0 },
    currentStep: "step-3",
    chatSummary: "Covered queue basics."
  });

  const session = await store.get(PROFILE_ID, TOPIC_ID);

  assert.equal(session.code, "fn main() {}");
  assert.deepEqual(session.latestRunResult, { pass: 4, fail: 0 });
  assert.equal(session.currentStep, "step-3");
  assert.equal(session.chatSummary, "Covered queue basics.");
});

test("update rejects unknown update keys", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { secretPrompt: "leak" }),
    /Unknown session field/
  );
});

test("update accepts only the allowed update keys", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const update = {};
  for (const key of ALLOWED_UPDATE_KEYS) {
    if (key === "canvasState") update[key] = { step: 1 };
    else if (key === "recentEvents") update[key] = [{ type: "ui.click" }];
    else if (key === "code") update[key] = "code";
    else if (key === "latestRunResult") update[key] = { pass: 1 };
    else if (key === "traceEvents") update[key] = [{ type: "queue.enqueue", payload: { value: 1 } }];
    else if (key === "chatMessages") update[key] = [{ role: "user", content: "hi" }];
    else if (key === "chatSummary") update[key] = "summary";
    else if (key === "currentStep") update[key] = "step-1";
  }

  await store.update(PROFILE_ID, TOPIC_ID, update);
  const session = await store.get(PROFILE_ID, TOPIC_ID);

  for (const key of ALLOWED_UPDATE_KEYS) {
    assert.ok(Object.hasOwn(session, key), `session must include ${key}`);
  }
});

test("progress updates merge without dropping recorded scenes or checkpoints", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, {
    progress: {
      completedSceneIds: ["scene-1"],
      checkpointStepIds: ["step-1"],
      experimentState: { "worker-count": 1 }
    }
  });
  await store.update(PROFILE_ID, TOPIC_ID, {
    progress: { experimentState: { "worker-count": 2 } }
  });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.deepEqual(session.progress, {
    completedSceneIds: ["scene-1"],
    checkpointStepIds: ["step-1"],
    experimentState: { "worker-count": 2 }
  });
});

test("concurrent progress updates for one session are serialized", async (t) => {
  const dataDir = await temporaryDirectory(t);
  let activeReads = 0;
  const fs = {
    async readFile(...args) {
      activeReads += 1;
      if (activeReads > 1) throw new Error("concurrent session reads");
      await new Promise((resolve) => setTimeout(resolve, 10));
      try { return await readFile(...args); } finally { activeReads -= 1; }
    },
    mkdir,
    writeFile,
    async rename(...args) { return (await import("node:fs/promises")).rename(...args); },
    rm
  };
  const store = createSessionStore({ dataDir, fs });

  await Promise.all([
    store.update(PROFILE_ID, TOPIC_ID, { progress: { completedSceneIds: ["scene-1"] } }),
    store.update(PROFILE_ID, TOPIC_ID, { progress: { checkpointStepIds: ["step-1"] } })
  ]);

  assert.deepEqual((await store.get(PROFILE_ID, TOPIC_ID)).progress, {
    completedSceneIds: ["scene-1"],
    checkpointStepIds: ["step-1"],
    experimentState: {}
  });
});

test("a rejected queued update does not block a later progress update", async (t) => {
  const dataDir = await temporaryDirectory(t);
  let failNextWrite = false;
  const fs = {
    readFile,
    mkdir,
    async writeFile(...args) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("simulated rejected update");
      }
      return writeFile(...args);
    },
    async rename(...args) { return (await import("node:fs/promises")).rename(...args); },
    rm
  };
  const store = createSessionStore({ dataDir, fs });
  await store.update(PROFILE_ID, TOPIC_ID, { progress: { completedSceneIds: ["scene-1"] } });

  failNextWrite = true;
  const rejected = store.update(PROFILE_ID, TOPIC_ID, { progress: { checkpointStepIds: ["step-1"] } });
  const later = store.update(PROFILE_ID, TOPIC_ID, { progress: { experimentState: { "worker-count": 2 } } });

  await assert.rejects(rejected, /simulated rejected update/);
  await later;
  assert.deepEqual((await store.get(PROFILE_ID, TOPIC_ID)).progress, {
    completedSceneIds: ["scene-1"],
    checkpointStepIds: [],
    experimentState: { "worker-count": 2 }
  });
});

test("recentEvents are capped at 50 entries", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const events = Array.from({ length: 80 }, (_, index) => ({ type: `ui.event-${index}` }));
  await store.update(PROFILE_ID, TOPIC_ID, { recentEvents: events });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.recentEvents.length, 50);
  assert.deepEqual(session.recentEvents[0], { type: "ui.event-30" });
  assert.deepEqual(session.recentEvents[49], { type: "ui.event-79" });
});

test("recentEvents append keeps the last 50 and drops the oldest", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { recentEvents: Array.from({ length: 40 }, (_, i) => ({ type: `ui.first-${i}` })) });
  await store.update(PROFILE_ID, TOPIC_ID, { recentEvents: Array.from({ length: 30 }, (_, i) => ({ type: `ui.second-${i}` })) });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.recentEvents.length, 50);
  assert.deepEqual(session.recentEvents[0], { type: `ui.first-20` });
  assert.deepEqual(session.recentEvents[49], { type: `ui.second-29` });
});

test("chatMessages are capped at 20 entries", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const messages = Array.from({ length: 35 }, (_, index) => makeMessage("user", index));
  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: messages });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatMessages.length, 20);
  assert.equal(session.chatMessages[0].content, "message 15");
  assert.equal(session.chatMessages[19].content, "message 34");
});

test("chatMessages append keeps the last 20 and drops the oldest", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 15 }, (_, i) => makeMessage("user", `a${i}`)) });
  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 10 }, (_, i) => makeMessage("assistant", `b${i}`)) });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatMessages.length, 20);
  assert.equal(session.chatMessages[0].content, "message a5");
  assert.equal(session.chatMessages[19].content, "message b9");
});

test("code is capped at a maximum length", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const largeCode = "x".repeat(200_000);
  await store.update(PROFILE_ID, TOPIC_ID, { code: largeCode });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.ok(session.code.length < largeCode.length, "code must be truncated");
  assert.ok(session.code.length > 0, "code must still be present");
  assert.equal(session.code, largeCode.slice(0, session.code.length));
});

test("chatSummary is capped at a maximum length", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const largeSummary = "s".repeat(10_000);
  await store.update(PROFILE_ID, TOPIC_ID, { chatSummary: largeSummary });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.ok(session.chatSummary.length < largeSummary.length, "summary must be truncated");
  assert.equal(session.chatSummary, largeSummary.slice(0, session.chatSummary.length));
});

test("summarizer is invoked when more than 20 chat messages exist", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const { summarize, calls } = deterministicSummarizer();
  const store = createSessionStore({ dataDir, summarize });

  const messages = Array.from({ length: 22 }, (_, index) => makeMessage(index % 2 === 0 ? "user" : "assistant", index));
  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: messages });

  assert.equal(calls.length, 1, "summarize called once");
  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatMessages.length, 20, "only last 20 messages retained");
  assert.equal(session.chatSummary, "Summary of 2 messages; last role=assistant");
});

test("summarizer receives only the messages being dropped from active context", async (t) => {
  const dataDir = await temporaryDirectory(t);
  let received = null;
  const summarize = async (messages) => {
    received = messages.map((m) => m.content);
    return "compact summary";
  };
  const store = createSessionStore({ dataDir, summarize });

  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 25 }, (_, i) => makeMessage("user", i)) });

  assert.equal(received.length, 5, "first 5 messages handed to summarizer");
  assert.deepEqual(received, ["message 0", "message 1", "message 2", "message 3", "message 4"]);
  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatSummary, "compact summary");
});

test("summarizer is not called when 20 or fewer chat messages exist", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const { summarize, calls } = deterministicSummarizer();
  const store = createSessionStore({ dataDir, summarize });

  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 20 }, (_, i) => makeMessage("user", i)) });

  assert.equal(calls.length, 0);
  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatSummary, null);
});

test("summarizer accumulates older messages on subsequent appends", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const { summarize, calls } = deterministicSummarizer();
  const store = createSessionStore({ dataDir, summarize });

  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 22 }, (_, i) => makeMessage("user", `a${i}`)) });
  await store.update(PROFILE_ID, TOPIC_ID, { chatMessages: Array.from({ length: 5 }, (_, i) => makeMessage("assistant", `b${i}`)) });

  assert.equal(calls.length, 2, "summarize invoked twice");
  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.chatMessages.length, 20);
  assert.equal(session.chatSummary, "Summary of 5 messages; last role=user");
});

test("store never invokes a provider directly", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const { summarize } = deterministicSummarizer();
  const store = createSessionStore({ dataDir, summarize });

  await store.update(PROFILE_ID, TOPIC_ID, {
    chatMessages: Array.from({ length: 25 }, (_, i) => makeMessage("user", i))
  });
  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.ok(session, "store completed the update without provider involvement");
});

test("update atomically preserves the last valid file when a write fails", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const realNow = () => new Date("2026-07-11T10:00:00.000Z");

  const firstStore = createSessionStore({ dataDir, now: realNow });
  await firstStore.update(PROFILE_ID, TOPIC_ID, { code: "first valid code" });

  const sessionFilePath = path.join(dataDir, "sessions", PROFILE_ID, `${TOPIC_ID}.json`);
  const beforeFailure = await readFile(sessionFilePath, "utf8");

  let failOnce = true;
  const failingFs = {
    async mkdir(target, options) { return mkdir(target, options); },
    async writeFile(target, data, encoding) {
      if (failOnce && typeof target === "string" && target.endsWith(".json.tmp")) {
        failOnce = false;
        throw new Error("simulated disk full");
      }
      return writeFile(target, data, encoding);
    },
    async readFile(target, encoding) { return readFile(target, encoding); },
    async rename(from, to) {
      if (from.endsWith && from.endsWith(".json.tmp")) {
        throw new Error("simulated rename failure");
      }
      const { rename } = await import("node:fs/promises");
      return rename(from, to);
    },
    async rm(target, options) { return rm(target, options); }
  };

  const store = createSessionStore({ dataDir, now: realNow, fs: failingFs });
  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { code: "should not persist" }),
    /simulated/
  );

  const preserved = await readFile(sessionFilePath, "utf8");
  assert.equal(preserved, beforeFailure, "last valid file unchanged after failed write");

  const reopened = createSessionStore({ dataDir, now: realNow });
  const session = await reopened.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.code, "first valid code");
});

test("update records an updatedAt timestamp from injected now", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const now = () => new Date("2026-07-11T12:00:00.000Z");
  const store = createSessionStore({ dataDir, now });

  await store.update(PROFILE_ID, TOPIC_ID, { currentStep: "first" });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.updatedAt, "2026-07-11T12:00:00.000Z");
});

test("update merges partial updates without clearing unrelated fields", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { code: "first code", currentStep: "step-1" });
  await store.update(PROFILE_ID, TOPIC_ID, { currentStep: "step-2" });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.code, "first code", "code preserved across partial update");
  assert.equal(session.currentStep, "step-2");
});

test("update with an empty partial preserves existing session state", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { code: "stable", currentStep: "first" });
  await store.update(PROFILE_ID, TOPIC_ID, {});

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.code, "stable");
  assert.equal(session.currentStep, "first");
});

test("sessions are isolated by profileId and topicId", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { code: "queue code" });
  await store.update("other-learner-xyz", TOPIC_ID, { code: "other code" });
  await store.update(PROFILE_ID, "dsa.stack", { code: "stack code" });

  const a = await store.get(PROFILE_ID, TOPIC_ID);
  const b = await store.get("other-learner-xyz", TOPIC_ID);
  const c = await store.get(PROFILE_ID, "dsa.stack");

  assert.equal(a.code, "queue code");
  assert.equal(b.code, "other code");
  assert.equal(c.code, "stack code");
});

test("get returns empty shape for a session that does not exist on disk", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const session = await store.get("brand-new-learner", "dsa.queue");
  assert.equal(session.code, null);
  assert.deepEqual(session.recentEvents, []);
});

test("session file is stored under sessions/<profileId>/<topicId>.json", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { code: "stored" });

  const expected = path.join(dataDir, "sessions", PROFILE_ID, `${TOPIC_ID}.json`);
  const raw = await readFile(expected, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.profileId, PROFILE_ID);
  assert.equal(parsed.topicId, TOPIC_ID);
  assert.equal(parsed.code, "stored");
});

test("update accepts trace events whose type matches the namespaced pattern", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const validTrace = [
    { type: "queue.enqueue", payload: { value: 1 } },
    { type: "queue.dequeue", payload: { value: 1 } },
    { type: "queue.peek", payload: {} },
    { type: "queue.empty", payload: { empty: true } }
  ];
  await store.update(PROFILE_ID, TOPIC_ID, { traceEvents: validTrace });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.deepEqual(session.traceEvents, validTrace);
});

test("update rejects trace events with malformed type", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const malformed = [
    { type: "queue", payload: {} },
    { type: "QUEUE.ENQUEUE", payload: {} },
    { type: "queue.0enqueue", payload: {} },
    { type: "queue.enqueue.", payload: {} },
    { type: "queue.enqueue.extra", payload: {} },
    { type: " queue.enqueue", payload: {} },
    { type: "queue..enqueue", payload: {} }
  ];
  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { traceEvents: malformed }),
    /Invalid trace event type/
  );
});

test("update rejects trace events whose payload keys include html, script, componentCode, or executableCode", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const forbiddenKeys = ["html", "script", "componentCode", "executableCode"];
  for (const key of forbiddenKeys) {
    await assert.rejects(
      store.update(PROFILE_ID, TOPIC_ID, {
        traceEvents: [{ type: "queue.enqueue", payload: { [key]: "<dangerous />" } }]
      }),
      /Forbidden trace payload key/
    );
  }
});

test("update rejects trace events missing a type", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { traceEvents: [{ payload: { ok: true } }] }),
    /Invalid trace event type/
  );
});

test("update rejects trace events whose payload is not an object", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { traceEvents: [{ type: "queue.enqueue", payload: "bad" }] }),
    /Trace payload must be an object/
  );
});

test("update rejects trace events where type is not a string", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { traceEvents: [{ type: 42 }] }),
    /Invalid trace event type/
  );
});

test("trace events are capped at 200 entries", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const events = Array.from({ length: 250 }, (_, i) => ({
    type: "queue.enqueue",
    payload: { value: i }
  }));
  await store.update(PROFILE_ID, TOPIC_ID, { traceEvents: events });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.traceEvents.length, 200);
  assert.equal(session.traceEvents[0].payload.value, 50);
  assert.equal(session.traceEvents[199].payload.value, 249);
});

test("trace events append keeps the last 200 and drops the oldest", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  await store.update(PROFILE_ID, TOPIC_ID, { traceEvents: Array.from({ length: 150 }, (_, i) => ({ type: "queue.enqueue", payload: { value: `a${i}` } })) });
  await store.update(PROFILE_ID, TOPIC_ID, { traceEvents: Array.from({ length: 100 }, (_, i) => ({ type: "queue.enqueue", payload: { value: `b${i}` } })) });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.equal(session.traceEvents.length, 200);
  assert.equal(session.traceEvents[0].payload.value, "a50");
  assert.equal(session.traceEvents[199].payload.value, "b99");
});

test("trace events with large payload objects are rejected", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const bigPayload = { value: "x".repeat(1_000_000) };
  await assert.rejects(
    store.update(PROFILE_ID, TOPIC_ID, { traceEvents: [{ type: "queue.enqueue", payload: bigPayload }] }),
    /Trace payload too large/
  );
});

test("a valid single trace event persists and can be read back", async (t) => {
  const dataDir = await temporaryDirectory(t);
  const store = createSessionStore({ dataDir });

  const event = { type: "queue.empty", payload: { empty: true } };
  await store.update(PROFILE_ID, TOPIC_ID, { traceEvents: [event] });

  const session = await store.get(PROFILE_ID, TOPIC_ID);
  assert.deepEqual(session.traceEvents, [event]);
});
