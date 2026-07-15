// ponytail: projection of shared/artifact-capabilities.json. Duplicated as a JS
// constant because Node --test doesn't resolve import assertions on JSON in
// all environments. The test validates this projection matches expected values.
// Update when shared/artifact-capabilities.json changes.

export const CAPABILITIES = Object.freeze({
  schemaVersions: Object.freeze([1, 2]),

  visualKinds: Object.freeze({
    schema1: Object.freeze(["queue"]),
    schema2: Object.freeze([])
  }),

  primitiveKinds: Object.freeze([
    "worker-queue"
  ]),

  semanticEventTypes: Object.freeze([
    "channel.send",
    "channel.send-blocked",
    "worker.receive",
    "worker.complete"
  ]),

  animationPresets: Object.freeze([
    "enqueue-from-producer",
    "show-blocked",
    "dequeue-to-worker",
    "worker-complete",
    "idle"
  ]),

  traceEvents: Object.freeze([
    "channel.send",
    "channel.send-blocked",
    "worker.receive",
    "worker.complete"
  ]),

  labKinds: Object.freeze(["code"]),
  checkpointKinds: Object.freeze(["prediction"]),
  experimentKinds: Object.freeze(["bounded-number"]),
  experimentIds: Object.freeze(["worker-count", "channel-capacity"]),
  experienceModes: Object.freeze(["guided-lab"]),
  completionRuleKinds: Object.freeze(["required-scenes", "required-checkpoints"]),
  evaluationKinds: Object.freeze(["go-tests"]),
  primitiveStatuses: Object.freeze(["ready", "idle", "busy", "blocked"]),
  primitiveSpecVersions: Object.freeze([1]),

  eventTargetRoles: Object.freeze({
    "channel.send": Object.freeze(["channel"]),
    "channel.send-blocked": Object.freeze(["producer"]),
    "worker.receive": Object.freeze(["worker"]),
    "worker.complete": Object.freeze(["worker"])
  })
});

const VISUAL_KIND_SET = new Set(CAPABILITIES.visualKinds.schema1);

export function isRecognizedVisualKind(kind) {
  return typeof kind === "string" && VISUAL_KIND_SET.has(kind);
}

export function getRecognizedVisualKinds() {
  return [...VISUAL_KIND_SET];
}
