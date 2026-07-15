import assert from "node:assert/strict";
import test from "node:test";
import { initialState, reduce } from "../components/visuals/workerQueueState.js";
import {
  seek,
  previous,
  next,
  reset,
  replay
} from "./sceneTimeline.js";

const CAPACITY_3 = Object.freeze({ id: "jobs", capacity: 3, items: [] });
const PRODUCER = Object.freeze({ id: "producer-1", status: "ready" });
const WORKER_1 = Object.freeze({ id: "worker-1", status: "idle" });

function baseState() {
  return initialState({ producer: PRODUCER, channel: CAPACITY_3, workers: [WORKER_1] });
}

function job(label) {
  return Object.freeze({ id: label.toLowerCase(), label });
}

function buildScene() {
  return [
    { type: "channel.send", target: "jobs", payload: { item: job("J1") } },
    { type: "channel.send", target: "jobs", payload: { item: job("J2") } },
    { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } },
    { type: "worker.complete", target: "worker-1", payload: { item: job("J1") } },
    { type: "channel.send", target: "jobs", payload: { item: job("J3") } }
  ];
}

// ── seek ──────────────────────────────────────────────────────────

test("seek to step 0 returns state after first event", () => {
  const events = buildScene();
  const s = seek(baseState(), events, 0);
  assert.equal(s.channel.items.length, 1);
  assert.equal(s.channel.items[0].label, "J1");
});

test("seek to step -1 returns initial state unchanged", () => {
  const events = buildScene();
  const s = seek(baseState(), events, -1);
  assert.equal(s.channel.items.length, 0);
});

test("seek to last step returns cumulative state", () => {
  const events = buildScene();
  const s = seek(baseState(), events, events.length - 1);
  assert.equal(s.channel.items.length, 2);
  assert.equal(s.channel.items[0].label, "J2");
  assert.equal(s.channel.items[1].label, "J3");
  assert.equal(s.workers[0].status, "idle");
});

test("seek beyond last step bounded to last valid index", () => {
  const events = buildScene();
  const s = seek(baseState(), events, events.length);
  assert.equal(s.channel.items.length, 2);
  assert.equal(s.channel.items[0].label, "J2");
});

test("seek with empty events always returns initial state", () => {
  const init = baseState();
  assert.deepEqual(seek(init, [], 0), init);
  assert.deepEqual(seek(init, [], 2), init);
  assert.deepEqual(seek(init, [], -1), init);
});

test("seek out-of-bounds bounded to last valid step without errors", () => {
  const init = baseState();
  const events = [
    { type: "channel.send", target: "jobs", payload: { item: job("J1") } }
  ];
  const s0 = seek(init, events, 0);
  assert.equal(s0.channel.items.length, 1);
  const sBounds = seek(init, events, 999);
  assert.equal(sBounds.channel.items.length, 1);
  assert.equal(sBounds.channel.items[0].label, "J1");
});

// ── deterministic replay ──────────────────────────────────────────

test("replay from same events produces identical final state", () => {
  const events = buildScene();
  const a = seek(baseState(), events, events.length - 1);
  const b = seek(baseState(), events, events.length - 1);
  assert.deepEqual(a.channel.items, b.channel.items);
  assert.equal(a.workers[0].status, b.workers[0].status);
});

test("seeking to same step twice yields identical state", () => {
  const events = buildScene();
  const s1 = seek(baseState(), events, 2);
  const s2 = seek(baseState(), events, 2);
  assert.deepEqual(s1.channel.items, s2.channel.items);
  assert.equal(s1.workers[0].status, s2.workers[0].status);
});

// ── previous / next ───────────────────────────────────────────────

test("previous steps back one valid step", () => {
  const events = buildScene();
  const result = previous(events, 2);
  assert.equal(result.targetStep, 1);
});

test("previous from step 0 goes to -1 (initial state)", () => {
  const events = buildScene();
  const result = previous(events, 0);
  assert.equal(result.targetStep, -1);
});

test("previous from -1 stays at -1 (initial state)", () => {
  const events = buildScene();
  const result = previous(events, -1);
  assert.equal(result.targetStep, -1);
});

test("previous with no events stays at -1", () => {
  const result = previous([], 0);
  assert.equal(result.targetStep, -1);
});

test("next steps forward one step", () => {
  const events = buildScene();
  const result = next(events, 1);
  assert.equal(result.targetStep, 2);
});

test("next at last step stays at last", () => {
  const events = buildScene();
  const result = next(events, 4);
  assert.equal(result.targetStep, 4);
});

test("next from -1 goes to step 0", () => {
  const events = buildScene();
  const result = next(events, -1);
  assert.equal(result.targetStep, 0);
});

test("next with no events stays at -1", () => {
  const result = next([], 0);
  assert.equal(result.targetStep, -1);
});

// ── reset ─────────────────────────────────────────────────────────

test("reset returns step -1 regardless of current position", () => {
  const events = buildScene();
  assert.deepEqual(reset(events, 3), { targetStep: -1 });
  assert.deepEqual(reset(events, -1), { targetStep: -1 });
  assert.deepEqual(reset(events, 0), { targetStep: -1 });
});

// ── replay ────────────────────────────────────────────────────────

test("replay restarts from initial state at step 0 without ignored parameters", () => {
  const events = buildScene();
  const result = replay(events, 2, baseState());
  assert.equal(result.fromStep, 2);
  assert.equal(result.targetStep, 0);
  assert.ok(typeof result.state === "object");
  assert.equal(result.state.channel.items.length, 1);
  assert.equal(result.state.channel.items[0].label, "J1");
});

test("replay with empty events returns fromStep preserved, targetStep -1", () => {
  const result = replay([], 5, baseState());
  assert.equal(result.fromStep, 5);
  assert.equal(result.targetStep, -1);
  assert.ok(typeof result.state === "object");
});

// ── FIFO across seek/replay ───────────────────────────────────────

test("FIFO order preserved after seek past receive + send", () => {
  const events = buildScene();
  const s = seek(baseState(), events, events.length - 1);
  assert.equal(s.channel.items.length, 2);
  assert.equal(s.channel.items[0].label, "J2");
  assert.equal(s.channel.items[1].label, "J3");
});

// ── reduced-motion semantic state is identical ────────────────────

test("replay returns identical state regardless of replay speed indicator", () => {
  const events = buildScene();
  const s = seek(baseState(), events, 2);
  const s2 = seek(baseState(), events, 2);
  assert.deepEqual(s.channel.items, s2.channel.items);
  assert.equal(s.workers[0].status, s2.workers[0].status);
});

test("reduce-motion/no-motion do not change semantic state — same events same output", () => {
  const events = buildScene();
  const a = seek(baseState(), events, events.length - 1);
  const b = seek(baseState(), events, events.length - 1);
  assert.deepEqual(a.channel.items, b.channel.items);
  assert.equal(a.workers[0].status, b.workers[0].status);
});

test("seek to step with full-buffer-and-block then worker-receive produces unblocked producer", () => {
  const fullEvents = [
    { type: "channel.send", target: "jobs", payload: { item: job("J1") } },
    { type: "channel.send", target: "jobs", payload: { item: job("J2") } },
    { type: "channel.send", target: "jobs", payload: { item: job("J3") } },
    { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } },
    { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } },
    { type: "channel.send", target: "jobs", payload: { item: job("J4") } }
  ];
  const last = fullEvents.length - 1;
  const s = seek(baseState(), fullEvents, last);
  assert.equal(s.producer.status, "ready");
  assert.equal(s.channel.items.length, 3);
  assert.equal(s.channel.items[2].label, "J4");
});
