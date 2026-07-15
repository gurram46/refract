import { motion } from "motion/react";
import { describeState } from "./workerQueueState.js";

const SHAPE = Object.freeze({
  ready: "▶",
  blocked: "⚠",
  idle: "·",
  busy: "●"
});

const ALLOWED_PRESETS = new Set([
  "enqueue-from-producer",
  "show-blocked",
  "dequeue-to-worker",
  "worker-complete",
  "idle"
]);

function presetMotion(preset) {
  switch (preset) {
    case "enqueue-from-producer":
      return { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: "easeOut" } };
    case "show-blocked":
      return { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4, ease: "easeInOut" } };
    case "dequeue-to-worker":
      return { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.3, ease: "easeOut" } };
    case "worker-complete":
      return { initial: { opacity: 0.6, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.28, ease: "easeOut" } };
  }
}

function resolveMotion(preset, reducedMotion) {
  if (reducedMotion || !ALLOWED_PRESETS.has(preset)) {
    return { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } };
  }
  return presetMotion(preset);
}

function ChannelSlots({ channel, focusSet, motionProps }) {
  const slots = [];
  for (let i = 0; i < channel.capacity; i++) {
    const item = channel.items[i] ?? null;
    const isHead = i === 0 && item !== null;
    const isTail = i === channel.items.length - 1 && item !== null;
    const isFocused = item !== null && focusSet.has(item.id);
    slots.push(
      <motion.div
        key={`slot-${i}-${item?.id ?? "empty"}`}
        className="wqv-slot"
        data-slot-index={i}
        data-empty={item === null ? "true" : "false"}
        data-head={isHead ? "true" : "false"}
        data-tail={isTail ? "true" : "false"}
        data-focus={isFocused ? "true" : "false"}
        role="img"
        aria-label={
          item === null
            ? `Buffer slot ${i + 1} of ${channel.capacity}, empty`
            : `Buffer slot ${i + 1} of ${channel.capacity}, job ${item.label}${isHead ? ", head of queue" : ""}${isTail ? ", tail of queue" : ""}`
        }
        {...motionProps}
      >
        <span className="wqv-slot-position" aria-hidden="true">{i + 1}</span>
        <span className="wqv-slot-value">{item ? item.label : "·"}</span>
        {isHead ? <span className="wqv-slot-tag" aria-hidden="true">head</span> : null}
        {isTail && !isHead ? <span className="wqv-slot-tag" aria-hidden="true">tail</span> : null}
      </motion.div>
    );
  }
  return slots;
}

function WorkerNode({ worker, focusSet, motionProps }) {
  const isFocused = focusSet.has(worker.id);
  const jobLabel = worker.job?.label ?? null;
  const shape = SHAPE[worker.status] ?? "·";
  return (
    <motion.div
      key={worker.id}
      className="wqv-worker"
      data-worker-id={worker.id}
      data-status={worker.status}
      data-focus={isFocused ? "true" : "false"}
      role="img"
      aria-label={
        jobLabel
          ? `Worker ${worker.id} is ${worker.status}, processing ${jobLabel}, shape ${shape}`
          : `Worker ${worker.id} is ${worker.status}, shape ${shape}`
      }
      {...motionProps}
    >
      <span className="wqv-worker-shape" aria-hidden="true">{shape}</span>
      <span className="wqv-worker-id">{worker.id}</span>
      <span className="wqv-worker-status">{worker.status}</span>
      {jobLabel ? <span className="wqv-worker-job">job {jobLabel}</span> : null}
    </motion.div>
  );
}

function ProducerNode({ producer, focusSet, motionProps }) {
  const isFocused = focusSet.has(producer.id);
  const shape = SHAPE[producer.status] ?? "?";
  const pendingLabel = producer.pendingItem?.label ?? null;
  return (
    <motion.div
      key={producer.id}
      className="wqv-producer"
      data-producer-id={producer.id}
      data-status={producer.status}
      data-focus={isFocused ? "true" : "false"}
      role="img"
      aria-label={
        pendingLabel
          ? `Producer ${producer.id} is ${producer.status}, holding pending item ${pendingLabel}, shape ${shape}`
          : `Producer ${producer.id} is ${producer.status}, shape ${shape}`
      }
      {...motionProps}
    >
      <span className="wqv-producer-shape" aria-hidden="true">{shape}</span>
      <span className="wqv-producer-id">{producer.id}</span>
      <span className="wqv-producer-status">{producer.status}</span>
      {pendingLabel ? <span className="wqv-producer-pending">pending {pendingLabel}</span> : null}
    </motion.div>
  );
}

export default function WorkerQueueVisual({ state, focus, preset, reducedMotion = null }) {
  const focusSet = new Set(Array.isArray(focus) ? focus : []);
  const motionProps = resolveMotion(preset, !!reducedMotion);
  const summary = describeState(state);
  const isEmpty = state.channel.items.length === 0;

  return (
    <div className="wqv-root" data-reduced-motion={reducedMotion ? "true" : "false"} data-preset={preset ?? "none"}>
      <div className="wqv-stage" aria-label="Worker queue stage">
        <div className="wqv-producer-row">
          <ProducerNode producer={state.producer} focusSet={focusSet} motionProps={motionProps} />
          <span className="wqv-arrow" aria-hidden="true">→</span>
        </div>

        <div
          className="wqv-channel"
          data-channel-id={state.channel.id}
          role="group"
          aria-label={`Channel ${state.channel.id} has ${state.channel.items.length} of ${state.channel.capacity} items`}
        >
          <div className="wqv-channel-header">
            <span className="wqv-channel-id">{state.channel.id}</span>
            <span className="wqv-channel-count">{state.channel.items.length} of {state.channel.capacity}</span>
          </div>
          <div className="wqv-channel-slots">
            {isEmpty ? (
              <div className="wqv-channel-empty" role="note">Channel is empty</div>
            ) : (
              <ChannelSlots channel={state.channel} focusSet={focusSet} motionProps={motionProps} />
            )}
          </div>
        </div>

        <div className="wqv-workers" role="group" aria-label="Workers">
          {state.workers.map((w) => (
            <WorkerNode key={w.id} worker={w} focusSet={focusSet} motionProps={motionProps} />
          ))}
        </div>
      </div>

      <p className="wqv-summary" role="status" aria-live="polite" aria-atomic="true">
        {summary}
      </p>
    </div>
  );
}
