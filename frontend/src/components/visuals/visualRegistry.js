import { isRecognizedVisualKind } from "../../lib/artifactCapabilities.js";
import QueueVisual from "./QueueVisual.jsx";
import VisualStage from "../artifact/VisualStage.jsx";

// ponytail: the registered "worker-queue" visual returns VisualStage (the
// runtime controller), not WorkerQueueVisual (the primitive renderer). The
// runtime owns the scene timeline, playback, focus layer, captions, and the
// polite live region; the primitive is an internal implementation detail.
const ALLOWED_VISUALS = Object.freeze({
  queue: QueueVisual,
  "worker-queue": VisualStage
});

export function isVisualAllowed(kind) {
  return typeof kind === "string" && kind in ALLOWED_VISUALS;
}

export function getVisualComponent(kind) {
  if (!isVisualAllowed(kind)) return null;
  return ALLOWED_VISUALS[kind];
}

export function isRecognizedKind(kind) {
  return isRecognizedVisualKind(kind);
}

export default ALLOWED_VISUALS;
