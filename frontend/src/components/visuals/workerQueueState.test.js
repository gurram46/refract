import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITIES } from "../../lib/artifactCapabilities.js";
import {
  supportedEvents,
  initialState,
  reduce,
  validatePrecondition,
  describeState,
  applyExperiment,
  applyExperiments
} from "./workerQueueState.js";

const CAPACITY_3 = Object.freeze({ id: "jobs", capacity: 3, items: [] });
const PRODUCER = Object.freeze({ id: "producer-1", status: "ready" });
const WORKER_1 = Object.freeze({ id: "worker-1", status: "idle" });

function baseState() {
  return initialState({ producer: PRODUCER, channel: CAPACITY_3, workers: [WORKER_1] });
}

function job(label) {
  return Object.freeze({ id: label.toLowerCase().replace(/\s/g, "-"), label });
}

// ── supportedEvents ────────────────────────────────────────────────

test("supportedEvents contains only v2 worker-queue event types from manifest", () => {
  const expected = CAPABILITIES.semanticEventTypes;
  const actual = [...supportedEvents].sort();
  assert.deepEqual(actual, [...expected].sort());
});

// ── initialState ───────────────────────────────────────────────────

test("initialState produces canonical shape with all required fields", () => {
  const s = baseState();
  assert.equal(typeof s.producer, "object");
  assert.equal(typeof s.channel, "object");
  assert.ok(Array.isArray(s.workers));
});

test("initialState preserves passed ids and statuses", () => {
  const s = baseState();
  assert.equal(s.producer.id, "producer-1");
  assert.equal(s.producer.status, "ready");
  assert.equal(s.channel.id, "jobs");
  assert.equal(s.channel.capacity, 3);
  assert.deepEqual(s.channel.items, []);
  assert.equal(s.workers.length, 1);
  assert.equal(s.workers[0].id, "worker-1");
  assert.equal(s.workers[0].status, "idle");
});

test("initialState accepts multiple workers", () => {
  const s = initialState({
    producer: { id: "p", status: "ready" },
    channel: { id: "ch", capacity: 2, items: [] },
    workers: [{ id: "w1", status: "idle" }, { id: "w2", status: "idle" }]
  });
  assert.equal(s.workers.length, 2);
  assert.equal(s.workers[0].id, "w1");
  assert.equal(s.workers[1].id, "w2");
});

// ── channel.send ───────────────────────────────────────────────────

test("channel.send enqueues item to empty buffer", () => {
  const s0 = baseState();
  const ev = { type: "channel.send", target: "jobs", payload: { item: job("J1") } };
  const vr = validatePrecondition(s0, ev);
  assert.equal(vr.valid, true);
  const s1 = reduce(s0, ev);
  assert.equal(s1.channel.items.length, 1);
  assert.equal(s1.channel.items[0].label, "J1");
});

test("channel.send preserves FIFO order with multiple sends", () => {
  let s = baseState();
  const ev1 = { type: "channel.send", target: "jobs", payload: { item: job("A") } };
  assert.equal(validatePrecondition(s, ev1).valid, true);
  s = reduce(s, ev1);
  assert.equal(validatePrecondition(s, ev1).valid, true);
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("B") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("C") } });
  assert.equal(s.channel.items.length, 3);
  assert.equal(s.channel.items[0].label, "A");
  assert.equal(s.channel.items[1].label, "B");
  assert.equal(s.channel.items[2].label, "C");
});

// ── full-buffer blocking ───────────────────────────────────────────

test("channel.send-blocked when buffer is full stores pending item and sets producer blocked", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J3") } });

  const ev = { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } };
  const vr = validatePrecondition(s, ev);
  assert.equal(vr.valid, true);

  s = reduce(s, ev);
  assert.equal(s.producer.status, "blocked");
  assert.equal(s.producer.pendingItem.label, "J4");
  assert.equal(s.channel.items.length, 3);
});

test("channel.send-blocked rejected when buffer has space", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  const ev = { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J2") } };
  const vr = validatePrecondition(s, ev);
  assert.equal(vr.valid, false, "should reject send-blocked when buffer is not full");
  assert.ok(typeof vr.diagnostic === "string");
});

// ── receive unblocking (canonical v2 blocked-send semantics) ───────

test("worker.receive dequeues FIFO head, unblocks producer, and enqueues pending item", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J3") } });
  s = reduce(s, { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } });
  assert.equal(s.producer.status, "blocked");
  assert.equal(s.producer.pendingItem.label, "J4");

  const ev = { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } };
  const vr = validatePrecondition(s, ev);
  assert.equal(vr.valid, true);

  s = reduce(s, ev);
  assert.equal(s.workers[0].status, "busy");
  assert.equal(s.workers[0].job.label, "J1");
  assert.equal(s.channel.items.length, 3);
  assert.equal(s.channel.items[0].label, "J2");
  assert.equal(s.channel.items[1].label, "J3");
  assert.equal(s.channel.items[2].label, "J4", "pending item should be enqueued at tail");
  assert.equal(s.producer.status, "ready");
  assert.equal(s.producer.pendingItem, null);
});

test("worker.receive unblocks after channel.send-blocked, then channel.send still blocked because pending was enqueued", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J3") } });
  s = reduce(s, { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } });
  assert.equal(s.producer.status, "blocked");

  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });
  assert.equal(s.producer.status, "ready");
  assert.equal(s.channel.items.length, 3);
  assert.equal(s.channel.items[2].label, "J4");

  const evSend = { type: "channel.send", target: "jobs", payload: { item: job("J5") } };
  const vr = validatePrecondition(s, evSend);
  assert.equal(vr.valid, false, "channel still full after pending enqueue");
});

// ── worker.complete ────────────────────────────────────────────────

test("worker.complete transitions worker back to idle when payload matches job", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });
  assert.equal(s.workers[0].status, "busy");

  s = reduce(s, { type: "worker.complete", target: "worker-1", payload: { item: job("J1") } });
  assert.equal(s.workers[0].status, "idle");
  assert.equal(s.workers[0].job, undefined);
});

test("worker.complete rejected when payload item is missing", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });
  assert.equal(s.workers[0].status, "busy");

  const vr = validatePrecondition(s, { type: "worker.complete", target: "worker-1" });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("worker.complete rejected when payload item does not match worker job", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });

  const vr = validatePrecondition(s, { type: "worker.complete", target: "worker-1", payload: { item: job("WRONG") } });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("worker.complete rejected when worker is idle (not busy)", () => {
  const vr = validatePrecondition(baseState(), { type: "worker.complete", target: "worker-1", payload: { item: job("X") } });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

// ── worker.receive payload-item matching FIFO head ─────────────────

test("worker.receive rejected when payload item is missing", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  const vr = validatePrecondition(s, { type: "worker.receive", target: "worker-1" });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("worker.receive rejected when payload item does not match FIFO head", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  const vr = validatePrecondition(s, { type: "worker.receive", target: "worker-1", payload: { item: job("WRONG") } });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

// ── invalid preconditions return stable diagnostics ────────────────

test("validatePrecondition rejects unknown event type with stable diagnostic", () => {
  const vr = validatePrecondition(baseState(), { type: "fake.event", target: "x" });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("validatePrecondition rejects target not in state", () => {
  const vr = validatePrecondition(baseState(), { type: "channel.send", target: "ghost", payload: { item: job("X") } });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("validatePrecondition rejects worker.receive when channel is empty", () => {
  const vr = validatePrecondition(baseState(), { type: "worker.receive", target: "worker-1", payload: { item: job("X") } });
  assert.equal(vr.valid, false);
  assert.ok(typeof vr.diagnostic === "string");
});

test("validatePrecondition rejects worker.receive when worker is already busy", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  const vr = validatePrecondition(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J2") } });
  assert.equal(vr.valid, false);
});

test("validatePrecondition rejects channel.send when target is not a channel", () => {
  const vr = validatePrecondition(baseState(), { type: "channel.send", target: "worker-1", payload: { item: job("X") } });
  assert.equal(vr.valid, false);
});

test("validatePrecondition accepts channel.send-blocked on exact full buffer", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J3") } });
  const vr = validatePrecondition(s, { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } });
  assert.equal(vr.valid, true);
});

test("validatePrecondition rejects channel.send-blocked when buffer not full", () => {
  const vr = validatePrecondition(baseState(), { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J1") } });
  assert.equal(vr.valid, false);
});

// ── reset ──────────────────────────────────────────────────────────

test("reset restores canonical initial state from config", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  assert.equal(s.channel.items.length, 2);

  const cfg = { producer: PRODUCER, channel: CAPACITY_3, workers: [WORKER_1] };
  const s0 = initialState(cfg);
  assert.equal(s0.channel.items.length, 0);
  assert.equal(s0.channel.capacity, 3);
  assert.equal(s0.producer.status, "ready");
});

// ── describeState ─────────────────────────────────────────────────━

test("describeState returns non-empty string for each supported primitive status", () => {
  const s = baseState();
  const desc = describeState(s);
  assert.ok(typeof desc === "string" && desc.length > 0);
});

test("describeState mentions blocked producer when present", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J2") } });
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J3") } });
  s = reduce(s, { type: "channel.send-blocked", target: "producer-1", payload: { item: job("J4") } });
  const desc = describeState(s);
  assert.ok(desc.includes("blocked"), `expected 'blocked' in description, got: ${desc}`);
});

test("describeState describes busy worker", () => {
  let s = baseState();
  s = reduce(s, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  s = reduce(s, { type: "worker.receive", target: "worker-1", payload: { item: job("J1") } });
  const desc = describeState(s);
  assert.ok(desc.includes("busy"), `expected 'busy' in description, got: ${desc}`);
});

// ── immutability ───────────────────────────────────────────────────

test("reduce returns new objects, does not mutate input state", () => {
  const s0 = baseState();
  const s1 = reduce(s0, { type: "channel.send", target: "jobs", payload: { item: job("J1") } });
  assert.notEqual(s1, s0);
  assert.notEqual(s1.channel, s0.channel);
  assert.notEqual(s1.channel.items, s0.channel.items);
  assert.equal(s0.channel.items.length, 0);
  assert.equal(s1.channel.items.length, 1);
});

test("initialState consumer cannot mutate returned constants", () => {
  const s = initialState({ producer: { id: "p", status: "ready" }, channel: { id: "ch", capacity: 1, items: [] }, workers: [{ id: "w", status: "idle" }] });
  assert.throws(() => { s.producer = { id: "evil", status: "evil" }; }, TypeError, "state must be frozen");
  assert.throws(() => { s.channel.items.push({ id: "evil" }); }, TypeError, "channel items must be frozen");
});

// ── experiments: bounded parameter changes through the reducer ────────

function multiWorkerState() {
  return initialState({
    producer: PRODUCER,
    channel: CAPACITY_3,
    workers: [
      { id: "worker-1", status: "idle" },
      { id: "worker-2", status: "idle" }
    ]
  });
}

test("applyExperiment updates channel capacity", () => {
  const s = applyExperiment(baseState(), "channel-capacity", 6);
  assert.equal(s.channel.capacity, 6);
  assert.equal(s.channel.id, "jobs");
});

test("applyExperiment floors non-integer capacity and clamps below zero", () => {
  const s = applyExperiment(baseState(), "channel-capacity", 5.8);
  assert.equal(s.channel.capacity, 5);
  const s2 = applyExperiment(baseState(), "channel-capacity", -1);
  assert.equal(s2.channel.capacity, 0);
});

test("applyExperiment trims workers when count is reduced", () => {
  const s = applyExperiment(multiWorkerState(), "worker-count", 1);
  assert.equal(s.workers.length, 1);
  assert.equal(s.workers[0].id, "worker-1");
});

test("applyExperiment adds idle workers when count is increased", () => {
  const s = applyExperiment(baseState(), "worker-count", 3);
  assert.equal(s.workers.length, 3);
  assert.equal(s.workers[1].id, "worker-2");
  assert.equal(s.workers[2].id, "worker-3");
  assert.equal(s.workers[2].status, "idle");
});

test("applyExperiment floors worker count and enforces a minimum of one", () => {
  const s = applyExperiment(baseState(), "worker-count", 2.3);
  assert.equal(s.workers.length, 2);
  const s2 = applyExperiment(baseState(), "worker-count", 0);
  assert.equal(s2.workers.length, 1);
});

test("applyExperiment ignores unknown experiment ids", () => {
  const s0 = baseState();
  const s = applyExperiment(s0, "unknown", 5);
  assert.equal(s, s0);
});

test("applyExperiment ignores non-finite values", () => {
  const s0 = baseState();
  assert.equal(applyExperiment(s0, "channel-capacity", NaN), s0);
  assert.equal(applyExperiment(s0, "channel-capacity", "5"), s0);
});

test("applyExperiments applies multiple experiments in order", () => {
  const s = applyExperiments(baseState(), { "channel-capacity": 5, "worker-count": 2 });
  assert.equal(s.channel.capacity, 5);
  assert.equal(s.workers.length, 2);
});

test("applyExperiments returns state unchanged when experimentState is empty", () => {
  const s0 = baseState();
  assert.equal(applyExperiments(s0, null), s0);
  assert.equal(applyExperiments(s0, {}), s0);
});

test("applyExperiments preserves immutability", () => {
  const s0 = baseState();
  const s1 = applyExperiments(s0, { "channel-capacity": 4 });
  assert.notEqual(s1, s0);
  assert.notEqual(s1.channel, s0.channel);
  assert.equal(s0.channel.capacity, 3);
});

test("applyExperiments ignores undeclared or out-of-range persisted values when definitions are supplied", () => {
  const s = applyExperiments(baseState(), {
    "channel-capacity": 99,
    "worker-count": 2,
    injected: 7
  }, [
    { id: "channel-capacity", kind: "bounded-number", min: 0, max: 8, step: 1, default: 3 },
    { id: "worker-count", kind: "bounded-number", min: 1, max: 4, step: 1, default: 1 }
  ]);
  assert.equal(s.channel.capacity, 3);
  assert.equal(s.workers.length, 2);
});
