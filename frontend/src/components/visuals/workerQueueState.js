import { CAPABILITIES } from "../../lib/artifactCapabilities.js";

const VALID_EVENTS = new Set(CAPABILITIES.semanticEventTypes);

export const supportedEvents = Object.freeze([...VALID_EVENTS]);

export function initialState({ producer, channel, workers }) {
  const s = {
    producer: { id: producer.id, status: producer.status ?? "ready", pendingItem: null },
    channel: { id: channel.id, capacity: channel.capacity, items: [...(channel.items ?? [])] },
    workers: workers.map((w) => ({ id: w.id, status: w.status ?? "idle" }))
  };
  Object.freeze(s.channel.items);
  s.workers.forEach((w) => Object.freeze(w));
  Object.freeze(s.workers);
  Object.freeze(s.channel);
  Object.freeze(s.producer);
  return Object.freeze(s);
}

function findTarget(state, event) {
  const target = event?.target;
  if (!target) return null;
  if (target === state.channel.id) return { role: "channel", obj: state.channel };
  if (target === state.producer.id) return { role: "producer", obj: state.producer };
  const worker = state.workers.find((w) => w.id === target);
  if (worker) return { role: "worker", obj: worker };
  return null;
}

function checkTargetRole(event, expectedRole, state) {
  const found = findTarget(state, event);
  if (!found) return false;
  return found.role === expectedRole;
}

export function validatePrecondition(state, { type, target, payload } = {}) {
  if (!type || !VALID_EVENTS.has(type)) {
    return { valid: false, diagnostic: `event type '${type ?? "null"}' is not a supported semantic event` };
  }

  switch (type) {
    case "channel.send": {
      if (!checkTargetRole({ type, target }, "channel", state)) {
        return { valid: false, diagnostic: `channel.send target '${target ?? "null"}' is not a channel` };
      }
      if (state.channel.items.length >= state.channel.capacity) {
        return { valid: false, diagnostic: "channel is full; use channel.send-blocked first" };
      }
      if (state.producer.status === "blocked") {
        return { valid: false, diagnostic: "producer is blocked; channel.send not valid" };
      }
      return { valid: true };
    }

    case "channel.send-blocked": {
      if (!checkTargetRole({ type, target }, "producer", state)) {
        return { valid: false, diagnostic: `channel.send-blocked target '${target ?? "null"}' is not a producer` };
      }
      if (state.channel.items.length < state.channel.capacity) {
        return { valid: false, diagnostic: "channel has free space; cannot issue send-blocked" };
      }
      if (state.producer.status === "blocked") {
        return { valid: false, diagnostic: "producer is already blocked" };
      }
      return { valid: true };
    }

    case "worker.receive": {
      if (!checkTargetRole({ type, target }, "worker", state)) {
        return { valid: false, diagnostic: `worker.receive target '${target ?? "null"}' is not a worker` };
      }
      if (state.channel.items.length === 0) {
        return { valid: false, diagnostic: "channel is empty; nothing to receive" };
      }
      const w = state.workers.find((wk) => wk.id === target);
      if (!w || w.status !== "idle") {
        return { valid: false, diagnostic: `worker '${target}' is not idle` };
      }
      const head = state.channel.items[0];
      const pi = payload?.item;
      if (!pi) {
        return { valid: false, diagnostic: "worker.receive requires payload.item matching FIFO head" };
      }
      if (pi.id !== head.id || pi.label !== head.label) {
        return { valid: false, diagnostic: `worker.receive payload item does not match FIFO head (expected ${head.label})` };
      }
      return { valid: true };
    }

    case "worker.complete": {
      if (!checkTargetRole({ type, target }, "worker", state)) {
        return { valid: false, diagnostic: `worker.complete target '${target ?? "null"}' is not a worker` };
      }
      const w = state.workers.find((wk) => wk.id === target);
      if (!w || w.status !== "busy") {
        return { valid: false, diagnostic: `worker '${target}' is not busy` };
      }
      const pi = payload?.item;
      if (!pi) {
        return { valid: false, diagnostic: "worker.complete requires payload.item matching worker job" };
      }
      if (!w.job || pi.id !== w.job.id || pi.label !== w.job.label) {
        return { valid: false, diagnostic: `worker.complete payload item does not match worker job (expected ${w.job?.label ?? "none"})` };
      }
      return { valid: true };
    }

    default:
      return { valid: false, diagnostic: `unsupported event type '${type}'` };
  }
}

export function reduce(state, event) {
  const vr = validatePrecondition(state, event);
  if (!vr.valid) return state;

  switch (event.type) {
    case "channel.send": {
      const item = Object.freeze({ ...(event.payload?.item ?? {}) });
      const newItems = Object.freeze([...state.channel.items, item]);
      const newChannel = Object.freeze({ ...state.channel, items: newItems });
      return Object.freeze({ ...state, channel: newChannel });
    }

    case "channel.send-blocked": {
      const pending = Object.freeze({ ...(event.payload?.item ?? {}) });
      const newProducer = Object.freeze({ ...state.producer, status: "blocked", pendingItem: pending });
      return Object.freeze({ ...state, producer: newProducer });
    }

    case "worker.receive": {
      const item = state.channel.items[0];
      const newItems = Object.freeze(state.channel.items.slice(1));

      let newProducer = state.producer;
      let newChannelItems = newItems;

      if (state.producer.status === "blocked" && state.producer.pendingItem) {
        newProducer = Object.freeze({ ...state.producer, status: "ready", pendingItem: null });
        newChannelItems = Object.freeze([...newItems, state.producer.pendingItem]);
      }

      const newChannel = Object.freeze({ ...state.channel, items: newChannelItems });

      const newWorkers = Object.freeze(state.workers.map((w) =>
        w.id === event.target
          ? Object.freeze({ ...w, status: "busy", job: item })
          : w
      ));

      return Object.freeze({
        ...state,
        channel: newChannel,
        workers: newWorkers,
        producer: newProducer
      });
    }

    case "worker.complete": {
      const newWorkers = Object.freeze(state.workers.map((w) =>
        w.id === event.target
          ? Object.freeze({ id: w.id, status: "idle" })
          : w
      ));
      return Object.freeze({ ...state, workers: newWorkers });
    }

    default:
      return state;
  }
}

export function describeState(state) {
  const parts = [];
  parts.push(`Producer ${state.producer.id} is ${state.producer.status}`);
  if (state.producer.pendingItem) {
    parts.push(`holding pending item ${state.producer.pendingItem.label}`);
  }
  parts.push(`Channel ${state.channel.id} has ${state.channel.items.length}/${state.channel.capacity} items`);
  for (const w of state.workers) {
    const jobInfo = w.job ? ` (processing ${w.job.label})` : "";
    parts.push(`Worker ${w.id} is ${w.status}${jobInfo}`);
  }
  return parts.join(". ");
}

export function applyExperiment(state, experimentId, value) {
  if (!state || typeof state !== "object") return state;
  if (typeof experimentId !== "string" || experimentId.length === 0) return state;
  if (typeof value !== "number" || !Number.isFinite(value)) return state;

  if (experimentId === "channel-capacity") {
    const capacity = Math.max(0, Math.floor(value));
    const newChannel = Object.freeze({ ...state.channel, capacity });
    return Object.freeze({ ...state, channel: newChannel });
  }

  if (experimentId === "worker-count") {
    const count = Math.max(1, Math.floor(value));
    const existing = Array.isArray(state.workers) ? state.workers : [];
    const nextWorkers = existing.slice(0, count).map((w) => Object.freeze({ ...w }));
    for (let i = nextWorkers.length; i < count; i++) {
      nextWorkers.push(Object.freeze({ id: `worker-${i + 1}`, status: "idle" }));
    }
    const newWorkers = Object.freeze(nextWorkers);
    return Object.freeze({ ...state, workers: newWorkers });
  }

  return state;
}

function validExperiment(experiment, value) {
  if (!experiment || experiment.kind !== "bounded-number" || !Number.isFinite(value)) return false;
  const { min, max, step } = experiment;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return false;
  return value >= min && value <= max && Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-9;
}

export function applyExperiments(state, experimentState, definitions) {
  if (!state || typeof state !== "object") return state;
  if (!experimentState || typeof experimentState !== "object") return state;
  const allowed = Array.isArray(definitions)
    ? new Map(definitions.filter((experiment) => experiment?.id).map((experiment) => [experiment.id, experiment]))
    : null;
  let next = state;
  for (const [id, value] of Object.entries(experimentState)) {
    if (allowed && !validExperiment(allowed.get(id), value)) continue;
    next = applyExperiment(next, id, value);
  }
  return next;
}
