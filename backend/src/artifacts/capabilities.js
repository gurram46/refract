import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedPath = path.resolve(__dirname, "../../../shared/artifact-capabilities.json");

const manifest = JSON.parse(readFileSync(sharedPath, "utf8"));
const imp = manifest.implemented;

const v1Kinds = Object.freeze({
  visual: Object.freeze(new Set(imp.visualKinds["schema-1"])),
  schemaVersion: Object.freeze(new Set(imp.schemaVersions.filter((v) => v === 1))),
  artifactVersions: Object.freeze(new Set(imp.artifactVersions["schema-1"]))
});

const roles = {};
for (const [type, targetList] of Object.entries(imp.eventTargetRoles)) {
  roles[type] = Object.freeze(new Set(targetList));
}

const v2Kinds = Object.freeze({
  modes: Object.freeze(new Set(imp.experienceModes["schema-2"])),
  primitive: Object.freeze(new Set(imp.primitiveKinds["schema-2"])),
  primitiveStatuses: Object.freeze(new Set(imp.primitiveStatuses["worker-queue"])),
  primitiveSpecVersions: Object.freeze(new Set(imp.primitiveSpecVersions["worker-queue"])),
  semanticEvents: Object.freeze(new Set(imp.semanticEventTypes["worker-queue"])),
  animationPresets: Object.freeze(new Set(imp.animationPresets["worker-queue"])),
  traceEvents: Object.freeze(new Set(imp.traceEvents["schema-2"]["worker-queue"])),
  lab: Object.freeze(new Set(imp.labKinds["schema-2"])),
  evaluation: Object.freeze(new Set(imp.evaluationKinds.code)),
  checkpoint: Object.freeze(new Set(imp.checkpointKinds["guided-lab"])),
  experiment: Object.freeze(new Set(imp.experimentKinds["guided-lab"])),
  experimentIds: Object.freeze(new Set(imp.experimentIds["worker-queue"])),
  completionRule: Object.freeze(new Set(imp.completionRuleKinds["guided-lab"])),
  eventTargetRoles: Object.freeze(roles)
});

export function getV1VisualKinds() { return v1Kinds.visual; }
export function getV1SchemaVersions() { return v1Kinds.schemaVersion; }
export function getV1ArtifactVersions() { return v1Kinds.artifactVersions; }
export function getV2Modes() { return v2Kinds.modes; }
export function getV2PrimitiveKinds() { return v2Kinds.primitive; }
export function getV2SemanticEvents() { return v2Kinds.semanticEvents; }
export function getV2AnimationPresets() { return v2Kinds.animationPresets; }
export function getV2TraceEvents() { return v2Kinds.traceEvents; }
export function getV2LabKinds() { return v2Kinds.lab; }
export function getV2EvaluationKinds() { return v2Kinds.evaluation; }
export function getV2CheckpointKinds() { return v2Kinds.checkpoint; }
export function getV2ExperimentKinds() { return v2Kinds.experiment; }
export function getV2ExperimentIds() { return v2Kinds.experimentIds; }
export function getV2CompletionRuleKinds() { return v2Kinds.completionRule; }
export function getV2PrimitiveStatuses() { return v2Kinds.primitiveStatuses; }
export function getV2EventTargetRoles() { return v2Kinds.eventTargetRoles; }
export function getV2PrimitiveSpecVersions() { return v2Kinds.primitiveSpecVersions; }
