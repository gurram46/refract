import { PROFILE_ID_PATTERN, TOPIC_ID_PATTERN } from "../config/options.js";
import {
  getV1VisualKinds,
  getV1SchemaVersions,
  getV1ArtifactVersions,
  getV2Modes,
  getV2PrimitiveKinds,
  getV2SemanticEvents,
  getV2AnimationPresets,
  getV2TraceEvents,
  getV2LabKinds,
  getV2EvaluationKinds,
  getV2CheckpointKinds,
  getV2ExperimentKinds,
  getV2ExperimentIds,
  getV2CompletionRuleKinds,
  getV2PrimitiveStatuses,
  getV2EventTargetRoles,
  getV2PrimitiveSpecVersions
} from "./capabilities.js";

const MAX_ARTIFACT_BYTES = 512 * 1024;
const TRACE_EVENT_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;
const FORBIDDEN_FIELDS = new Set(["html", "jsx", "componentcode", "executablecode"]);
const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "artifactVersion",
  "profileId",
  "topicId",
  "title",
  "summary",
  "connections",
  "story",
  "visual",
  "examples",
  "practice",
  "chat",
  "next"
]);

function contentError(path, code, message) {
  return { path, code, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function propertyPath(parent, property) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property)
    ? `${parent}.${property}`
    : `${parent}[${JSON.stringify(property)}]`;
}

function requireObject(value, path, errors) {
  if (isObject(value)) return true;
  errors.push(contentError(path, "INVALID_TYPE", `${path} must be an object`));
  return false;
}

function requireArray(value, path, errors) {
  if (Array.isArray(value)) return true;
  errors.push(contentError(path, "INVALID_TYPE", `${path} must be an array`));
  return false;
}

function requireString(value, path, errors) {
  if (typeof value === "string" && value.trim()) return true;
  errors.push(contentError(path, "INVALID_TYPE", `${path} must be a non-empty string`));
  return false;
}

function requireFields(value, path, fields, errors) {
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      errors.push(contentError(propertyPath(path, field), "REQUIRED_FIELD", `${field} is required`));
    }
  }
}

function validateTopLevelShape(value, errors) {
  if (!requireObject(value, "$", errors)) return false;
  requireFields(value, "$", TOP_LEVEL_FIELDS, errors);
  const expected = new Set(TOP_LEVEL_FIELDS);
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) {
      errors.push(contentError(propertyPath("$", field), "UNKNOWN_FIELD", `${field} is not part of the artifact contract`));
    }
  }
  return true;
}

function validateV1Version(value, field, errors) {
  const allowed = getV1SchemaVersions();
  if (!allowed.has(value[field])) {
    errors.push(contentError(`$.${field}`, "INVALID_VERSION", `${field} is not a supported schemaVersion`));
  }
}

function validateV1ArtifactVersion(value, field, errors) {
  const allowed = getV1ArtifactVersions();
  if (!allowed.has(value[field])) {
    errors.push(contentError(`$.${field}`, "INVALID_VERSION", `${field} is not a supported artifactVersion`));
  }
}

function validateIdentifiers(value, context, errors) {
  if (typeof context.profileId !== "string" || context.profileId.length > 100 || !PROFILE_ID_PATTERN.test(context.profileId)) {
    errors.push(contentError("$.profileId", "INVALID_IDENTIFIER", "Requested profileId is invalid"));
  } else if (typeof value.profileId !== "string" || !PROFILE_ID_PATTERN.test(value.profileId)) {
    errors.push(contentError("$.profileId", "INVALID_IDENTIFIER", "Artifact profileId is invalid"));
  } else if (value.profileId !== context.profileId) {
    errors.push(contentError("$.profileId", "IDENTIFIER_MISMATCH", "Artifact profileId does not match the requested profile"));
  }

  if (typeof context.topicId !== "string" || !TOPIC_ID_PATTERN.test(context.topicId)) {
    errors.push(contentError("$.topicId", "INVALID_IDENTIFIER", "Requested topicId is invalid"));
  } else if (typeof value.topicId !== "string" || !TOPIC_ID_PATTERN.test(value.topicId)) {
    errors.push(contentError("$.topicId", "INVALID_IDENTIFIER", "Artifact topicId is invalid"));
  } else if (value.topicId !== context.topicId) {
    errors.push(contentError("$.topicId", "IDENTIFIER_MISMATCH", "Artifact topicId does not match the requested topic"));
  }
}

function validateTopicIdArray(value, path, errors) {
  if (!requireArray(value, path, errors)) return;
  value.forEach((topicId, index) => {
    if (typeof topicId !== "string" || !TOPIC_ID_PATTERN.test(topicId)) {
      errors.push(contentError(`${path}[${index}]`, "INVALID_IDENTIFIER", "Topic reference is invalid"));
    }
  });
}

function validateConnections(connections, errors) {
  if (!requireObject(connections, "$.connections", errors)) return;
  requireFields(connections, "$.connections", ["core", "paired"], errors);
  validateTopicIdArray(connections.core, "$.connections.core", errors);
  validateTopicIdArray(connections.paired, "$.connections.paired", errors);
}

function validateStory(story, errors) {
  if (!requireObject(story, "$.story", errors)) return;
  const fields = ["premise", "objective", "decisions", "audioScript"];
  requireFields(story, "$.story", fields, errors);
  requireString(story.premise, "$.story.premise", errors);
  requireString(story.objective, "$.story.objective", errors);
  requireArray(story.decisions, "$.story.decisions", errors);
  requireString(story.audioScript, "$.story.audioScript", errors);
}

function validateVisual(visual, allowedVisualKinds, errors) {
  if (!requireObject(visual, "$.visual", errors)) return;
  requireFields(visual, "$.visual", ["kind", "initialState", "controls"], errors);
  if (typeof visual.kind !== "string" || !Array.isArray(allowedVisualKinds) || !allowedVisualKinds.includes(visual.kind)) {
    errors.push(contentError("$.visual.kind", "UNSUPPORTED_VISUAL_KIND", "Visual kind is not allowed for this topic"));
  }
  requireObject(visual.initialState, "$.visual.initialState", errors);
  requireArray(visual.controls, "$.visual.controls", errors);
}

function validatePractice(practice, language, errors) {
  if (!requireObject(practice, "$.practice", errors)) return;
  const fields = ["language", "prompt", "starterCode", "tests", "supportedTraceEvents"];
  requireFields(practice, "$.practice", fields, errors);
  if (typeof practice.language !== "string" || practice.language !== language) {
    errors.push(contentError("$.practice.language", "LANGUAGE_MISMATCH", "Practice language does not match the learner profile"));
  }
  requireString(practice.prompt, "$.practice.prompt", errors);
  if (typeof practice.starterCode !== "string") {
    errors.push(contentError("$.practice.starterCode", "INVALID_TYPE", "starterCode must be a string"));
  }
  if (typeof practice.tests !== "string") {
    errors.push(contentError("$.practice.tests", "INVALID_TYPE", "tests must be a string"));
  }
  if (requireArray(practice.supportedTraceEvents, "$.practice.supportedTraceEvents", errors)) {
    practice.supportedTraceEvents.forEach((eventType, index) => {
      if (typeof eventType !== "string" || !TRACE_EVENT_PATTERN.test(eventType)) {
        errors.push(contentError(
          `$.practice.supportedTraceEvents[${index}]`,
          "INVALID_TRACE_EVENT",
          "Trace event must contain one namespaced event type"
        ));
      }
    });
  }
}

function validateChat(chat, errors) {
  if (!requireObject(chat, "$.chat", errors)) return;
  requireFields(chat, "$.chat", ["suggestedQuestions"], errors);
  if (requireArray(chat.suggestedQuestions, "$.chat.suggestedQuestions", errors)) {
    chat.suggestedQuestions.forEach((question, index) => {
      requireString(question, `$.chat.suggestedQuestions[${index}]`, errors);
    });
  }
}

function findForbiddenFields(value, path, errors, visited = new WeakSet()) {
  if (value === null || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenFields(item, `${path}[${index}]`, errors, visited));
    return;
  }
  for (const [field, nestedValue] of Object.entries(value)) {
    const nestedPath = propertyPath(path, field);
    if (FORBIDDEN_FIELDS.has(field.toLowerCase())) {
      errors.push(contentError(nestedPath, "FORBIDDEN_FIELD", `${field} can contain executable frontend output`));
    }
    findForbiddenFields(nestedValue, nestedPath, errors, visited);
  }
}

function serializedSizeError(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return contentError("$", "NOT_SERIALIZABLE", "Artifact must be serializable JSON data");
  }
  if (serialized === undefined) {
    return contentError("$", "NOT_SERIALIZABLE", "Artifact must be serializable JSON data");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_ARTIFACT_BYTES) {
    return contentError("$", "ARTIFACT_TOO_LARGE", "Artifact cannot exceed 512 KB");
  }
  return null;
}

export function validateArtifact(value, context = {}) {
  const serializationError = serializedSizeError(value);
  if (serializationError) return { ok: false, errors: [serializationError] };

  const errors = [];
  if (!requireObject(value, "$", errors)) return { ok: false, errors };

  // ponytail: v1 contract preserved verbatim until cache invalidation lands in Task 0.4.
  // V2 routes through a dedicated strict validator that owns the v2 envelope shape.
  if (value.schemaVersion === 2) {
    return validateArtifactV2(value, context, errors);
  }

  if (!validateTopLevelShape(value, errors)) return { ok: false, errors };
  validateV1Version(value, "schemaVersion", errors);
  validateV1ArtifactVersion(value, "artifactVersion", errors);
  validateIdentifiers(value, context, errors);
  requireString(value.title, "$.title", errors);
  requireString(value.summary, "$.summary", errors);
  validateConnections(value.connections, errors);
  validateStory(value.story, errors);
  validateVisual(value.visual, context.allowedVisualKinds, errors);
  requireArray(value.examples, "$.examples", errors);
  validatePractice(value.practice, context.language, errors);
  validateChat(value.chat, errors);
  validateTopicIdArray(value.next, "$.next", errors);
  findForbiddenFields(value, "$", errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

// ===========================================================================
// Artifact V2 contract. See docs/superpowers/specs/2026-07-12-cinematic-visual-
// artifacts-design.md. The trusted application owns the v2 envelope and all
// primitive state/event validation. Generated data may never carry executable
// frontend code. Validation is explicit and contains no speculative abstractions.
// ===========================================================================

const V2_TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "artifactVersion",
  "profileId",
  "topicId",
  "title",
  "learningObjectives",
  "experience",
  "lab",
  "chat",
  "next"
]);

const V2_EXPERIENCE_FIELDS = Object.freeze([
  "mode",
  "primitive",
  "snippets",
  "chapters",
  "experiments",
  "completionRules"
]);

const V2_PRIMITIVE_FIELDS = Object.freeze(["kind", "specVersion", "initialState"]);
const V2_PRIMITIVE_INITIAL_STATE_FIELDS = Object.freeze(["producer", "channel", "workers"]);
const V2_SNIPPET_FIELDS = Object.freeze(["id", "language", "file", "code", "editable", "annotations"]);
const V2_ANNOTATION_FIELDS = Object.freeze(["line", "text"]);
const V2_CHAPTER_FIELDS = Object.freeze(["id", "title", "scenes"]);
const V2_SCENE_FIELDS = Object.freeze(["id", "title", "steps"]);
const V2_STEP_FIELDS = Object.freeze([
  "id",
  "event",
  "focus",
  "snippet",
  "caption",
  "narration",
  "animationPreset",
  "checkpoint"
]);
const V2_EVENT_FIELDS = Object.freeze(["type", "target", "payload"]);
const V2_CHECKPOINT_FIELDS = Object.freeze(["kind", "question", "options", "answer", "explanation"]);
const V2_OPTION_FIELDS = Object.freeze(["id", "label"]);
const V2_EXPERIMENT_FIELDS = Object.freeze(["id", "kind", "min", "max", "step", "default"]);
const V2_COMPLETION_RULE_FIELDS_BY_KIND = Object.freeze({
  "required-scenes": Object.freeze(["kind", "sceneIds"]),
  "required-checkpoints": Object.freeze(["kind", "stepIds"])
});
const V2_LAB_FIELDS = Object.freeze(["kind", "language", "title", "files", "evaluation", "trace"]);
const V2_LAB_FILE_FIELDS = Object.freeze(["path", "starterCode"]);
const V2_LAB_EVALUATION_FIELDS = Object.freeze(["kind", "testSetId"]);
const V2_LAB_TRACE_FIELDS = Object.freeze(["supportedEvents", "sourceMapRequired"]);
const V2_CHAT_FIELDS = Object.freeze(["suggestedQuestions"]);

const V2_ALLOWED_MODES = getV2Modes();
const V2_ALLOWED_PRIMITIVE_KINDS = getV2PrimitiveKinds();
const V2_ALLOWED_PRIMITIVE_STATUSES = getV2PrimitiveStatuses();
const V2_ALLOWED_EVENT_TYPES = getV2SemanticEvents();
const V2_ALLOWED_EVENT_TARGET_ROLES_BY_TYPE = getV2EventTargetRoles();
const V2_ALLOWED_ANIMATION_PRESETS = getV2AnimationPresets();
const V2_ALLOWED_CHECKPOINT_KINDS = getV2CheckpointKinds();
const V2_ALLOWED_EXPERIMENT_KINDS = getV2ExperimentKinds();
const V2_ALLOWED_EXPERIMENT_IDS = getV2ExperimentIds();
const V2_ALLOWED_COMPLETION_RULE_KINDS = getV2CompletionRuleKinds();
const V2_ALLOWED_LAB_KINDS = getV2LabKinds();
const V2_ALLOWED_EVALUATION_KINDS = getV2EvaluationKinds();
const V2_ALLOWED_PRIMITIVE_SPEC_VERSIONS = getV2PrimitiveSpecVersions();

const V2_LEARNING_OBJECTIVES_MIN = 1;
const V2_LEARNING_OBJECTIVES_MAX = 16;
const V2_TITLE_MAX = 200;
const V2_CAPTION_MAX = 280;
const V2_NARRATION_MAX = 1200;
const V2_CODE_MAX = 16384;
const V2_SCENES_MIN = 1;
const V2_STEPS_MIN = 1;
const V2_STEPS_MAX = 200;
const V2_ANNOTATIONS_MAX = 64;
const V2_ANNOTATION_TEXT_MAX = 280;
const V2_OPTIONS_MIN = 1;
const V2_OPTIONS_MAX = 6;
const V2_OPTION_LABEL_MAX = 160;
const V2_EXPERIMENT_DEFAULT_MIN = -1_000_000;
const V2_EXPERIMENT_DEFAULT_MAX = 1_000_000;
const V2_EXPERIMENTS_MAX = 8;
const V2_COMPLETION_RULES_MIN = 1;
const V2_COMPLETION_RULES_MAX = 64;
const V2_CHAPTERS_MIN = 1;
const V2_CHAPTERS_MAX = 32;
const V2_SCENES_MAX = 32;
const V2_SNIPPETS_MIN = 1;
const V2_SNIPPETS_MAX = 32;
const V2_FILE_PATH_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:go|py|js|ts|java|cpp|rs|md|sql|ya?ml|json|sh|txt)$/;
const V2_FILE_STARTER_CODE_MAX = 65536;
const V2_FILES_MIN = 1;
const V2_FILES_MAX = 16;
const V2_LAB_TRACE_EVENTS_MIN = 1;
const V2_LAB_TRACE_EVENTS_MAX = 32;
const V2_SUGGESTED_QUESTIONS_MIN = 0;
const V2_SUGGESTED_QUESTIONS_MAX = 12;
const V2_SUGGESTED_QUESTION_MAX = 240;
const V2_NEXT_MAX = 64;
const V2_FOCUS_MIN = 1;
const V2_FOCUS_MAX = 16;
const V2_CONSTANT_MAX = 100_000;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value) {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isPositiveInteger(value) {
  return isInteger(value) && value > 0;
}

function bounded(value, path, code, min, max, errors) {
  if (min !== undefined && value < min) {
    errors.push(contentError(path, code, `${path} must be at least ${min}`));
    return false;
  }
  if (max !== undefined && value > max) {
    errors.push(contentError(path, code, `${path} must be at most ${max}`));
    return false;
  }
  return true;
}

function boundedArray(value, path, code, min, max, errors) {
  return bounded(value.length, path, code, min, max, errors);
}

function rejectUnknownKeys(value, path, allowedFields, errors) {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(contentError(propertyPath(path, field), "UNKNOWN_FIELD", `${field} is not part of the artifact contract`));
    }
  }
}

function requireIdString(value, path, errors) {
  if (typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return true;
  }
  errors.push(contentError(path, "INVALID_IDENTIFIER", `${path} must be a lowercase kebab id`));
  return false;
}

function requireLabelString(value, path, max, errors) {
  if (typeof value !== "string") {
    errors.push(contentError(path, "INVALID_TYPE", `${path} must be a string`));
    return false;
  }
  if (!value.trim()) {
    errors.push(contentError(path, "INVALID_TYPE", `${path} must be a non-empty string`));
    return false;
  }
  if (value.length > max) {
    errors.push(contentError(path, "OUT_OF_BOUNDS", `${path} must be at most ${max} characters`));
    return false;
  }
  return true;
}

function validateV2Chat(chat, errors) {
  if (!requireObject(chat, "$.chat", errors)) return;
  rejectUnknownKeys(chat, "$.chat", V2_CHAT_FIELDS, errors);
  requireFields(chat, "$.chat", ["suggestedQuestions"], errors);
  if (requireArray(chat.suggestedQuestions, "$.chat.suggestedQuestions", errors)) {
    if (!boundedArray(
      chat.suggestedQuestions,
      "$.chat.suggestedQuestions",
      "OUT_OF_BOUNDS",
      V2_SUGGESTED_QUESTIONS_MIN,
      V2_SUGGESTED_QUESTIONS_MAX,
      errors
    )) {
      return;
    }
    chat.suggestedQuestions.forEach((question, index) => {
      requireLabelString(question, `$.chat.suggestedQuestions[${index}]`, V2_SUGGESTED_QUESTION_MAX, errors);
    });
  }
}

function validateV2TopicIdArray(value, path, max, errors) {
  if (!requireArray(value, path, errors)) return;
  if (!boundedArray(value, path, "OUT_OF_BOUNDS", 0, max, errors)) return;
  const seen = new Set();
  value.forEach((topicId, index) => {
    if (typeof topicId !== "string" || !TOPIC_ID_PATTERN.test(topicId)) {
      errors.push(contentError(`${path}[${index}]`, "INVALID_IDENTIFIER", "Topic reference is invalid"));
      return;
    }
    if (seen.has(topicId)) {
      errors.push(contentError(path, "DUPLICATE_TOPIC", `${topicId} is a duplicate topic reference`));
      return;
    }
    seen.add(topicId);
  });
}

function validateV2Snippet(snippet, index, references, errors) {
  const path = `$.experience.snippets[${index}]`;
  if (!requireObject(snippet, path, errors)) return;
  rejectUnknownKeys(snippet, path, V2_SNIPPET_FIELDS, errors);
  requireFields(snippet, path, ["id", "language", "file", "code", "editable", "annotations"], errors);
  if (Object.hasOwn(snippet, "id")) requireIdString(snippet.id, `${path}.id`, errors);
  if (Object.hasOwn(snippet, "language") && typeof snippet.language !== "string") {
    errors.push(contentError(`${path}.language`, "INVALID_TYPE", `${path}.language must be a string`));
  }
  if (Object.hasOwn(snippet, "file") && typeof snippet.file !== "string") {
    errors.push(contentError(`${path}.file`, "INVALID_TYPE", `${path}.file must be a string`));
  }
  if (Object.hasOwn(snippet, "code")) {
    if (typeof snippet.code !== "string") {
      errors.push(contentError(`${path}.code`, "INVALID_TYPE", `${path}.code must be a string`));
    } else if (snippet.code.length > V2_CODE_MAX) {
      errors.push(contentError(`${path}.code`, "OUT_OF_BOUNDS", `${path}.code must be at most ${V2_CODE_MAX} characters`));
    }
  }
  if (Object.hasOwn(snippet, "editable") && typeof snippet.editable !== "boolean") {
    errors.push(contentError(`${path}.editable`, "INVALID_TYPE", `${path}.editable must be a boolean`));
  }
  if (requireArray(snippet.annotations, `${path}.annotations`, errors)) {
    if (boundedArray(snippet.annotations, `${path}.annotations`, "OUT_OF_BOUNDS", 0, V2_ANNOTATIONS_MAX, errors)) {
      snippet.annotations.forEach((annotation, aIndex) => {
        const aPath = `${path}.annotations[${aIndex}]`;
        if (!requireObject(annotation, aPath, errors)) return;
        rejectUnknownKeys(annotation, aPath, V2_ANNOTATION_FIELDS, errors);
        requireFields(annotation, aPath, ["line", "text"], errors);
        if (Object.hasOwn(annotation, "line")) {
          if (!isPositiveInteger(annotation.line)) {
            errors.push(contentError(`${aPath}.line`, "OUT_OF_BOUNDS", "annotation line must be a positive integer"));
          } else if (typeof snippet.code === "string") {
            const lineCount = snippet.code.split("\n").length;
            if (annotation.line > lineCount) {
              errors.push(contentError(`${aPath}.line`, "OUT_OF_BOUNDS", `${aPath}.line must be within snippet code lines`));
            }
          }
        }
        if (Object.hasOwn(annotation, "text")) {
          requireLabelString(annotation.text, `${aPath}.text`, V2_ANNOTATION_TEXT_MAX, errors);
        }
      });
    }
  }
  if (typeof snippet.id === "string") {
    references.snippetIds.set(snippet.id, snippet);
  }
}

function roleForEventTarget(target, initialProducers, initialChannels, initialWorkers) {
  if (initialProducers.has(target)) return "producer";
  if (initialChannels.has(target)) return "channel";
  if (initialWorkers.has(target)) return "worker";
  return null;
}

function validateV2Event(event, path, initialProducers, initialChannels, initialWorkers, errors) {
  if (!requireObject(event, `${path}`, errors)) return;
  rejectUnknownKeys(event, `${path}`, V2_EVENT_FIELDS, errors);
  requireFields(event, `${path}`, ["type", "target", "payload"], errors);
  if (Object.hasOwn(event, "type") && typeof event.type === "string") {
    if (!V2_ALLOWED_EVENT_TYPES.has(event.type)) {
      errors.push(contentError(`${path}.type`, "UNSUPPORTED_EVENT", `${event.type} is not a supported worker-queue event`));
    } else if (typeof event.target === "string" && event.target.length) {
      const role = roleForEventTarget(event.target, initialProducers, initialChannels, initialWorkers);
      const allowed = V2_ALLOWED_EVENT_TARGET_ROLES_BY_TYPE[event.type];
      if (!role || !allowed.has(role)) {
        errors.push(contentError(`${path}.target`, "MISSING_REFERENCE", `${path}.target does not exist or is not valid for ${event.type}`));
      }
    }
  }
  if (requireObject(event.payload, `${path}.payload`, errors)) {
    const item = event.payload.item;
    if (item === undefined) return;
    if (!isObject(item)) {
      errors.push(contentError(`${path}.payload.item`, "INVALID_TYPE", "payload item must be an object"));
      return;
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      errors.push(contentError(`${path}.payload.item.id`, "INVALID_IDENTIFIER", "payload item id is required"));
    }
    if (typeof item.label !== "string" || item.label.length === 0 || item.label.length > 32) {
      errors.push(contentError(`${path}.payload.item.label`, "INVALID_TYPE", "payload item label must be a short string"));
    }
  }
}

function validateV2Step(step, path, references, initialProducers, initialChannels, initialWorkers, errors) {
  if (!requireObject(step, path, errors)) return;
  rejectUnknownKeys(step, path, V2_STEP_FIELDS, errors);
  requireFields(step, path, ["id", "event", "focus", "snippet", "caption", "narration", "animationPreset"], errors);
  if (Object.hasOwn(step, "id")) requireIdString(step.id, `${path}.id`, errors);

  validateV2Event(step.event, `${path}.event`, initialProducers, initialChannels, initialWorkers, errors);

  if (Array.isArray(step.focus)) {
    if (!boundedArray(step.focus, `${path}.focus`, "OUT_OF_BOUNDS", V2_FOCUS_MIN, V2_FOCUS_MAX, errors)) {
      return;
    }
    step.focus.forEach((focusId, fIndex) => {
      if (typeof focusId !== "string" || focusId.length === 0) {
        errors.push(contentError(`${path}.focus[${fIndex}]`, "INVALID_IDENTIFIER", "focus reference must be a non-empty string"));
      }
    });
  }

  if (isObject(step.snippet)) {
    rejectUnknownKeys(step.snippet, `${path}.snippet`, Object.freeze(["id", "lines"]), errors);
    requireFields(step.snippet, `${path}.snippet`, ["id", "lines"], errors);
    if (typeof step.snippet.id === "string") {
      if (!references.snippetIds.has(step.snippet.id)) {
        errors.push(contentError(`${path}.snippet.id`, "MISSING_REFERENCE", `${step.snippet.id} is not a declared snippet`));
      }
    }
    if (Array.isArray(step.snippet.lines)) {
      const snippet = references.snippetIds.get(step.snippet.id);
      const lineCount = snippet && typeof snippet.code === "string" ? snippet.code.split("\n").length : null;
      step.snippet.lines.forEach((line, lIndex) => {
        if (!isPositiveInteger(line)) {
          errors.push(contentError(`${path}.snippet.lines[${lIndex}]`, "OUT_OF_BOUNDS", "snippet line must be a positive integer"));
        } else if (lineCount !== null && line > lineCount) {
          errors.push(contentError(`${path}.snippet.lines[${lIndex}]`, "OUT_OF_BOUNDS", "snippet line is out of range"));
        }
      });
    }
  } else {
    errors.push(contentError(`${path}.snippet`, "INVALID_TYPE", `${path}.snippet must be an object`));
  }

  if (Object.hasOwn(step, "caption")) {
    requireLabelString(step.caption, `${path}.caption`, V2_CAPTION_MAX, errors);
  }
  if (Object.hasOwn(step, "narration")) {
    requireLabelString(step.narration, `${path}.narration`, V2_NARRATION_MAX, errors);
  }
  if (Object.hasOwn(step, "animationPreset") && typeof step.animationPreset === "string") {
    if (!V2_ALLOWED_ANIMATION_PRESETS.has(step.animationPreset)) {
      errors.push(contentError(`${path}.animationPreset`, "UNSUPPORTED_ANIMATION_PRESET", `${step.animationPreset} is not a supported animation preset`));
    }
  } else if (Object.hasOwn(step, "animationPreset")) {
    errors.push(contentError(`${path}.animationPreset`, "INVALID_TYPE", `${path}.animationPreset must be a string`));
  }

  const checkpoint = step.checkpoint;
  if (checkpoint === undefined) return;
  if (!requireObject(checkpoint, `${path}.checkpoint`, errors)) return;
  rejectUnknownKeys(checkpoint, `${path}.checkpoint`, V2_CHECKPOINT_FIELDS, errors);
  requireFields(checkpoint, `${path}.checkpoint`, ["kind", "question", "options", "answer", "explanation"], errors);
  if (typeof checkpoint.kind === "string" && !V2_ALLOWED_CHECKPOINT_KINDS.has(checkpoint.kind)) {
    errors.push(contentError(`${path}.checkpoint.kind`, "UNSUPPORTED_CHECKPOINT", `${checkpoint.kind} is not a supported checkpoint kind`));
  }
  if (requireArray(checkpoint.options, `${path}.checkpoint.options`, errors)) {
    if (boundedArray(checkpoint.options, `${path}.checkpoint.options`, "OUT_OF_BOUNDS", V2_OPTIONS_MIN, V2_OPTIONS_MAX, errors)) {
      const optionIds = new Set();
      checkpoint.options.forEach((option, oIndex) => {
        const oPath = `${path}.checkpoint.options[${oIndex}]`;
        if (!requireObject(option, oPath, errors)) return;
        rejectUnknownKeys(option, oPath, V2_OPTION_FIELDS, errors);
        requireFields(option, oPath, ["id", "label"], errors);
        if (Object.hasOwn(option, "id") && requireIdString(option.id, `${oPath}.id`, errors)) {
          if (optionIds.has(option.id)) {
            errors.push(contentError(`${oPath}.id`, "DUPLICATE_ID", `${option.id} is a duplicate option id`));
          } else {
            optionIds.add(option.id);
          }
        }
        if (Object.hasOwn(option, "label")) {
          requireLabelString(option.label, `${oPath}.label`, V2_OPTION_LABEL_MAX, errors);
        }
      });
      if (typeof checkpoint.answer === "string" && !optionIds.has(checkpoint.answer)) {
        errors.push(contentError(`${path}.checkpoint.answer`, "MISSING_REFERENCE", `${checkpoint.answer} is not a declared option`));
      }
    }
  }
}

function validateV2CompletionRule(rule, index, references, errors) {
  const path = `$.experience.completionRules[${index}]`;
  if (!requireObject(rule, path, errors)) return;
  if (typeof rule.kind === "string" && !V2_ALLOWED_COMPLETION_RULE_KINDS.has(rule.kind)) {
    errors.push(contentError(`${path}.kind`, "UNSUPPORTED_COMPLETION_RULE", `${rule.kind} is not a supported completion rule kind`));
    return;
  }
  const allowedFields = V2_COMPLETION_RULE_FIELDS_BY_KIND[rule.kind] ?? V2_COMPLETION_RULE_FIELDS_BY_KIND["required-scenes"];
  rejectUnknownKeys(rule, path, allowedFields, errors);
  requireFields(rule, path, allowedFields, errors);
  const idsField = rule.kind === "required-checkpoints" ? "stepIds" : "sceneIds";
  const ids = rule[idsField];
  if (requireArray(ids, `${path}.${idsField}`, errors)) {
    if (!boundedArray(ids, `${path}.${idsField}`, "OUT_OF_BOUNDS", 1, V2_STEPS_MAX, errors)) return;
    const seen = new Set();
    ids.forEach((id, iIndex) => {
      const iPath = `${path}.${idsField}[${iIndex}]`;
      if (typeof id !== "string" || id.length === 0) {
        errors.push(contentError(iPath, "INVALID_IDENTIFIER", "completion rule id must be a non-empty string"));
        return;
      }
      if (seen.has(id)) {
        errors.push(contentError(`${path}.${idsField}`, "DUPLICATE_REFERENCE", `${id} is a duplicate reference`));
        return;
      }
      seen.add(id);
      if (rule.kind === "required-scenes" && !references.sceneIds.has(id)) {
        errors.push(contentError(iPath, "MISSING_REFERENCE", `${id} is not a declared scene`));
      }
      if (rule.kind === "required-checkpoints" && !references.checkpointStepIds.has(id)) {
        errors.push(contentError(iPath, "MISSING_REFERENCE", `${id} is not a declared step with a checkpoint`));
      }
    });
  }
}

function validateV2Experiment(experiment, index, errors) {
  const path = `$.experience.experiments[${index}]`;
  if (!requireObject(experiment, path, errors)) return;
  rejectUnknownKeys(experiment, path, V2_EXPERIMENT_FIELDS, errors);
  requireFields(experiment, path, ["id", "kind", "min", "max", "step", "default"], errors);
  if (Object.hasOwn(experiment, "id")) requireIdString(experiment.id, `${path}.id`, errors);
  if (typeof experiment.id === "string" && !V2_ALLOWED_EXPERIMENT_IDS.has(experiment.id)) {
    errors.push(contentError(`${path}.id`, "UNSUPPORTED_EXPERIMENT", `${experiment.id} is not a supported experiment id`));
  }
  if (typeof experiment.kind === "string" && !V2_ALLOWED_EXPERIMENT_KINDS.has(experiment.kind)) {
    errors.push(contentError(`${path}.kind`, "UNSUPPORTED_EXPERIMENT", `${experiment.kind} is not a supported experiment kind`));
  }
  for (const field of ["min", "max", "step", "default"]) {
    if (Object.hasOwn(experiment, field) && !isFiniteNumber(experiment[field])) {
      errors.push(contentError(`${path}.${field}`, "INVALID_TYPE", `${path}.${field} must be a finite number`));
    }
  }
  if (isFiniteNumber(experiment.min) && isFiniteNumber(experiment.max) && experiment.min > experiment.max) {
    errors.push(contentError(`${path}.min`, "OUT_OF_BOUNDS", `${path}.min must be <= max`));
  }
  if (isFiniteNumber(experiment.default) && isFiniteNumber(experiment.min) && isFiniteNumber(experiment.max)) {
    if (experiment.default < experiment.min || experiment.default > experiment.max) {
      errors.push(contentError(`${path}.default`, "OUT_OF_BOUNDS", `${path}.default must be between min and max`));
    }
  }
  if (isFiniteNumber(experiment.step) && experiment.step <= 0) {
    errors.push(contentError(`${path}.step`, "OUT_OF_BOUNDS", `${path}.step must be greater than zero`));
  }
  if (isFiniteNumber(experiment.min) && isFiniteNumber(experiment.max) && isFiniteNumber(experiment.step) && experiment.step > 0) {
    for (const [field, value] of [["max", experiment.max], ["default", experiment.default]]) {
      if (isFiniteNumber(value) && Math.abs((value - experiment.min) / experiment.step - Math.round((value - experiment.min) / experiment.step)) > 1e-9) {
        errors.push(contentError(`${path}.${field}`, "OUT_OF_BOUNDS", `${path}.${field} must align to step`));
      }
    }
  }
  for (const field of ["min", "max", "step", "default"]) {
    if (isFiniteNumber(experiment[field]) && Math.abs(experiment[field]) > V2_EXPERIMENT_DEFAULT_MAX) {
      errors.push(contentError(`${path}.${field}`, "OUT_OF_BOUNDS", `${path}.${field} exceeds allowed magnitude`));
    }
  }
}

function validateV2Lab(lab, context, errors) {
  if (!requireObject(lab, "$.lab", errors)) return;
  rejectUnknownKeys(lab, "$.lab", V2_LAB_FIELDS, errors);
  requireFields(lab, "$.lab", ["kind", "language", "title", "files", "evaluation", "trace"], errors);
  if (typeof lab.kind === "string" && !V2_ALLOWED_LAB_KINDS.has(lab.kind)) {
    errors.push(contentError("$.lab.kind", "UNSUPPORTED_LAB", `${lab.kind} is not a supported lab kind`));
  }
  if (typeof lab.language === "string" && context.language && lab.language !== context.language) {
    errors.push(contentError("$.lab.language", "LANGUAGE_MISMATCH", "Lab language does not match the learner profile"));
  }
  if (Object.hasOwn(lab, "title")) requireLabelString(lab.title, "$.lab.title", V2_TITLE_MAX, errors);
  if (requireArray(lab.files, "$.lab.files", errors)) {
    if (boundedArray(lab.files, "$.lab.files", "OUT_OF_BOUNDS", V2_FILES_MIN, V2_FILES_MAX, errors)) {
      lab.files.forEach((file, fIndex) => {
        const fPath = `$.lab.files[${fIndex}]`;
        if (!requireObject(file, fPath, errors)) return;
        rejectUnknownKeys(file, fPath, V2_LAB_FILE_FIELDS, errors);
        requireFields(file, fPath, ["path", "starterCode"], errors);
        if (typeof file.path === "string" && !V2_FILE_PATH_PATTERN.test(file.path)) {
          errors.push(contentError(`${fPath}.path`, "INVALID_IDENTIFIER", "lab file path is not an allowed source path"));
        }
        if (typeof file.starterCode === "string" && file.starterCode.length > V2_FILE_STARTER_CODE_MAX) {
          errors.push(contentError(`${fPath}.starterCode`, "OUT_OF_BOUNDS", "lab starterCode exceeds the supported size"));
        }
      });
    }
  }
  const evaluation = lab.evaluation;
  if (requireObject(evaluation, "$.lab.evaluation", errors)) {
    rejectUnknownKeys(evaluation, "$.lab.evaluation", V2_LAB_EVALUATION_FIELDS, errors);
    requireFields(evaluation, "$.lab.evaluation", ["kind", "testSetId"], errors);
    if (typeof evaluation.kind === "string" && !V2_ALLOWED_EVALUATION_KINDS.has(evaluation.kind)) {
      errors.push(contentError("$.lab.evaluation.kind", "UNSUPPORTED_EVALUATION", `${evaluation.kind} is not a supported evaluation kind`));
    }
    if (Object.hasOwn(evaluation, "testSetId")) {
      requireIdString(evaluation.testSetId, "$.lab.evaluation.testSetId", errors);
    }
  }
  const trace = lab.trace;
  if (requireObject(trace, "$.lab.trace", errors)) {
    rejectUnknownKeys(trace, "$.lab.trace", V2_LAB_TRACE_FIELDS, errors);
    requireFields(trace, "$.lab.trace", ["supportedEvents", "sourceMapRequired"], errors);
    if (requireArray(trace.supportedEvents, "$.lab.trace.supportedEvents", errors)) {
      if (boundedArray(trace.supportedEvents, "$.lab.trace.supportedEvents", "OUT_OF_BOUNDS", V2_LAB_TRACE_EVENTS_MIN, V2_LAB_TRACE_EVENTS_MAX, errors)) {
        trace.supportedEvents.forEach((eventType, eIndex) => {
          if (typeof eventType !== "string" || !TRACE_EVENT_PATTERN.test(eventType) || !V2_ALLOWED_EVENT_TYPES.has(eventType)) {
            errors.push(contentError(`$.lab.trace.supportedEvents[${eIndex}]`, "INVALID_TRACE_EVENT", "Trace event must be an allowed worker-queue event"));
          }
        });
      }
    }
    if (Object.hasOwn(trace, "sourceMapRequired") && typeof trace.sourceMapRequired !== "boolean") {
      errors.push(contentError("$.lab.trace.sourceMapRequired", "INVALID_TYPE", "sourceMapRequired must be a boolean"));
    }
  }
}

function validateV2PrimitiveState(primitive, references, errors) {
  if (!requireObject(primitive, "$.experience.primitive", errors)) return;
  rejectUnknownKeys(primitive, "$.experience.primitive", V2_PRIMITIVE_FIELDS, errors);
  requireFields(primitive, "$.experience.primitive", ["kind", "specVersion", "initialState"], errors);
  if (typeof primitive.kind === "string" && !V2_ALLOWED_PRIMITIVE_KINDS.has(primitive.kind)) {
    errors.push(contentError("$.experience.primitive.kind", "UNSUPPORTED_PRIMITIVE", `${primitive.kind} is not a supported primitive`));
  }
  if (Object.hasOwn(primitive, "specVersion")) {
    if (!V2_ALLOWED_PRIMITIVE_SPEC_VERSIONS.has(primitive.specVersion)) {
      errors.push(contentError("$.experience.primitive.specVersion", "OUT_OF_BOUNDS", "primitive specVersion is not supported"));
    }
  }
  const initial = primitive.initialState;
  if (!requireObject(initial, "$.experience.primitive.initialState", errors)) return;
  rejectUnknownKeys(initial, "$.experience.primitive.initialState", V2_PRIMITIVE_INITIAL_STATE_FIELDS, errors);
  requireFields(initial, "$.experience.primitive.initialState", ["producer", "channel", "workers"], errors);
  if (isObject(initial.producer)) {
    if (typeof initial.producer.id === "string") references.initialProducers.add(initial.producer.id);
    if (typeof initial.producer.status === "string" && !V2_ALLOWED_PRIMITIVE_STATUSES.has(initial.producer.status)) {
      errors.push(contentError("$.experience.primitive.initialState.producer.status", "OUT_OF_BOUNDS", "producer status is not supported"));
    }
  }
  if (isObject(initial.channel)) {
    if (typeof initial.channel.id === "string") references.initialChannels.add(initial.channel.id);
    if (Object.hasOwn(initial.channel, "capacity") && (!isInteger(initial.channel.capacity) || initial.channel.capacity < 0 || initial.channel.capacity > V2_CONSTANT_MAX)) {
      errors.push(contentError("$.experience.primitive.initialState.channel.capacity", "OUT_OF_BOUNDS", "channel capacity must be a non-negative integer"));
    }
    if (requireArray(initial.channel.items, "$.experience.primitive.initialState.channel.items", errors)) {
      initial.channel.items.forEach((item, iIndex) => {
        const iPath = `$.experience.primitive.initialState.channel.items[${iIndex}]`;
        if (isObject(item) && typeof item.id === "string") {
          references.initialItemIds.add(item.id);
        } else {
          errors.push(contentError(iPath, "INVALID_TYPE", "channel item must be an object with an id"));
        }
      });
    }
  }
  if (requireArray(initial.workers, "$.experience.primitive.initialState.workers", errors)) {
    initial.workers.forEach((worker, wIndex) => {
      const wPath = `$.experience.primitive.initialState.workers[${wIndex}]`;
      if (isObject(worker) && typeof worker.id === "string") {
        references.initialWorkers.add(worker.id);
      } else {
        errors.push(contentError(wPath, "INVALID_TYPE", "worker must be an object with an id"));
      }
      if (isObject(worker) && typeof worker.status === "string" && !V2_ALLOWED_PRIMITIVE_STATUSES.has(worker.status)) {
        errors.push(contentError(`${wPath}.status`, "OUT_OF_BOUNDS", "worker status is not supported"));
      }
    });
  }
}

function stepOrder(artifact) {
  const ordered = [];
  for (const [cIndex, chapter] of artifact.experience.chapters.entries()) {
    for (const [sIndex, scene] of chapter.scenes.entries()) {
      for (const [tIndex, step] of scene.steps.entries()) {
        ordered.push({ chapterId: chapter.id, sceneId: scene.id, step, cIndex, sIndex, tIndex });
      }
    }
  }
  return ordered;
}

// Deterministic worker-queue reducer. Phase 1 will own the full reducer; this
// minimal simulation only enforces the preconditions needed to reject dead
// event sequences during schema validation. No rendering, no view models.
// ponytail: minimal state machine for the four declared event types; add
// richer semantics when the Phase 1 primitive is wired.
function itemIdsFromPayloads(steps) {
  const ids = new Set();
  for (const entry of steps) {
    const item = entry.step.event?.payload?.item;
    if (isObject(item) && typeof item.id === "string") ids.add(item.id);
  }
  return ids;
}

function simulateWorkerQueue(initialState, steps, errors) {
  const state = {
    producer: { id: initialState.producer?.id, status: initialState.producer?.status ?? "ready" },
    channel: {
      id: initialState.channel?.id,
      capacity: initialState.channel?.capacity ?? 0,
      items: Array.isArray(initialState.channel?.items) ? initialState.channel.items.map((i) => ({ ...i })) : []
    },
    workers: Array.isArray(initialState.workers)
      ? initialState.workers.map((w) => ({ ...w }))
      : []
  };

  const pendingByWorker = new Map();
  const inChannel = new Set(state.channel.items.map((i) => i.id));
  const produced = new Set(state.channel.items.map((i) => i.id));
  let stepCounter = 0;
  for (const entry of steps) {
    const step = entry.step;
    const event = step.event;
    if (!isObject(event) || typeof event.type !== "string") continue;
    const path = `$.experience.chapters[${entry.cIndex}].scenes[${entry.sIndex}].steps[${entry.tIndex}].event`;
    const item = event.payload?.item;
    const itemId = typeof item?.id === "string" ? item.id : null;

    switch (event.type) {
      case "channel.send": {
        if (state.channel.items.length >= state.channel.capacity) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "channel.send requires free buffer capacity"));
        } else if (itemId && produced.has(itemId)) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", `item ${itemId} was already produced`));
        } else if (itemId) {
          state.channel.items.push({ ...item });
          inChannel.add(itemId);
          produced.add(itemId);
        }
        break;
      }
      case "channel.send-blocked": {
        if (state.channel.items.length < state.channel.capacity) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "channel.send-blocked requires a full buffer"));
        } else if (state.producer.status !== "blocked" && state.producer.status !== "ready") {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "producer must be send-ready before it can block"));
        }
        if (itemId) produced.add(itemId);
        state.producer.status = "blocked";
        state.producer.pendingItem = item;
        break;
      }
      case "worker.receive": {
        const worker = state.workers.find((w) => w.id === event.target);
        if (!worker) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "worker.receive targets an unknown worker"));
          break;
        }
        if (!inChannel.has(itemId)) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", `worker.receive requires item ${itemId ?? ""} to be in the channel`));
          break;
        }
        const index = state.channel.items.findIndex((i) => i.id === itemId);
        if (index >= 0) state.channel.items.splice(index, 1);
        inChannel.delete(itemId);
        worker.status = "busy";
        pendingByWorker.set(worker.id, itemId);
        if (state.producer.status === "blocked" && state.channel.items.length < state.channel.capacity) {
          state.producer.status = "ready";
          const pending = state.producer.pendingItem;
          if (isObject(pending) && typeof pending.id === "string") {
            state.channel.items.push({ ...pending });
            inChannel.add(pending.id);
            produced.add(pending.id);
          }
          delete state.producer.pendingItem;
        }
        break;
      }
      case "worker.complete": {
        const worker = state.workers.find((w) => w.id === event.target);
        if (!worker) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "worker.complete targets an unknown worker"));
          break;
        }
        const pendingId = pendingByWorker.get(worker.id);
        if (!pendingId || pendingId !== itemId) {
          errors.push(contentError(path, "IMPOSSIBLE_SEQUENCE", "worker.complete requires the worker to have received the item"));
          break;
        }
        pendingByWorker.delete(worker.id);
        worker.status = "idle";
        break;
      }
      default: {
        break;
      }
    }
    stepCounter += 1;
    if (stepCounter > V2_STEPS_MAX * 2) break;
  }
}

function validateArtifactV2(value, context, errors) {
  if (!isObject(value)) {
    if (!errors.length) errors.push(contentError("$", "INVALID_TYPE", "Artifact must be an object"));
    return { ok: false, errors };
  }

  rejectUnknownKeys(value, "$", V2_TOP_LEVEL_FIELDS, errors);
  requireFields(value, "$", V2_TOP_LEVEL_FIELDS, errors);
  if (value.schemaVersion !== 2) {
    errors.push(contentError("$.schemaVersion", "INVALID_VERSION", "schemaVersion must equal 2"));
  }
  if (value.artifactVersion !== 1) {
    errors.push(contentError("$.artifactVersion", "INVALID_VERSION", "artifactVersion must equal 1"));
  }
  validateIdentifiers(value, context, errors);
  if (Object.hasOwn(value, "title")) {
    requireLabelString(value.title, "$.title", V2_TITLE_MAX, errors);
  }
  if (requireArray(value.learningObjectives, "$.learningObjectives", errors)) {
    if (boundedArray(value.learningObjectives, "$.learningObjectives", "OUT_OF_BOUNDS", V2_LEARNING_OBJECTIVES_MIN, V2_LEARNING_OBJECTIVES_MAX, errors)) {
      value.learningObjectives.forEach((objective, oIndex) => {
        requireLabelString(objective, `$.learningObjectives[${oIndex}]`, V2_TITLE_MAX, errors);
      });
    }
  }

  const references = {
    snippetIds: new Map(),
    sceneIds: new Set(),
    stepIds: new Set(),
    checkpointStepIds: new Set(),
    experimentIds: new Set(),
    initialProducers: new Set(),
    initialChannels: new Set(),
    initialWorkers: new Set(),
    initialItemIds: new Set(),
    declaredEntityIds: new Set()
  };

  if (!requireObject(value.experience, "$.experience", errors)) return { ok: false, errors };
  rejectUnknownKeys(value.experience, "$.experience", V2_EXPERIENCE_FIELDS, errors);
  requireFields(value.experience, "$.experience", V2_EXPERIENCE_FIELDS, errors);
  if (typeof value.experience.mode === "string" && !V2_ALLOWED_MODES.has(value.experience.mode)) {
    errors.push(contentError("$.experience.mode", "OUT_OF_BOUNDS", "experience mode is not supported"));
  }

  validateV2PrimitiveState(value.experience.primitive, references, errors);
  for (const id of references.initialProducers) references.declaredEntityIds.add(id);
  for (const id of references.initialChannels) references.declaredEntityIds.add(id);
  for (const id of references.initialWorkers) references.declaredEntityIds.add(id);
  for (const id of references.initialItemIds) references.declaredEntityIds.add(id);

  if (requireArray(value.experience.snippets, "$.experience.snippets", errors)) {
    const snippetIdsSeen = new Set();
    if (boundedArray(value.experience.snippets, "$.experience.snippets", "OUT_OF_BOUNDS", V2_SNIPPETS_MIN, V2_SNIPPETS_MAX, errors)) {
      value.experience.snippets.forEach((snippet, index) => {
        validateV2Snippet(snippet, index, references, errors);
        if (typeof snippet?.id === "string" && snippet.id.length) {
          if (snippetIdsSeen.has(snippet.id)) {
            errors.push(contentError(`$.experience.snippets[${index}].id`, "DUPLICATE_ID", `${snippet.id} is a duplicate snippet id`));
          } else {
            snippetIdsSeen.add(snippet.id);
          }
        }
      });
    }
  }

  if (requireArray(value.experience.chapters, "$.experience.chapters", errors)) {
    if (!boundedArray(value.experience.chapters, "$.experience.chapters", "OUT_OF_BOUNDS", V2_CHAPTERS_MIN, V2_CHAPTERS_MAX, errors)) {
      return { ok: false, errors };
    }
    const chapterIdsSeen = new Set();
    const sceneIdsSeen = new Set();
    const stepIdsSeen = new Set();
    value.experience.chapters.forEach((chapter, cIndex) => {
      const cPath = `$.experience.chapters[${cIndex}]`;
      if (!requireObject(chapter, cPath, errors)) return;
      rejectUnknownKeys(chapter, cPath, V2_CHAPTER_FIELDS, errors);
      requireFields(chapter, cPath, V2_CHAPTER_FIELDS, errors);
      if (typeof chapter.id === "string" && chapter.id.length) {
        if (chapterIdsSeen.has(chapter.id)) {
          errors.push(contentError(`${cPath}.id`, "DUPLICATE_ID", `${chapter.id} is a duplicate chapter id`));
        } else {
          chapterIdsSeen.add(chapter.id);
        }
      }
      if (requireArray(chapter.scenes, `${cPath}.scenes`, errors)) {
        if (!boundedArray(chapter.scenes, `${cPath}.scenes`, "OUT_OF_BOUNDS", V2_SCENES_MIN, V2_SCENES_MAX, errors)) return;
        chapter.scenes.forEach((scene, sIndex) => {
          const sPath = `${cPath}.scenes[${sIndex}]`;
          if (!requireObject(scene, sPath, errors)) return;
          rejectUnknownKeys(scene, sPath, V2_SCENE_FIELDS, errors);
          requireFields(scene, sPath, V2_SCENE_FIELDS, errors);
          if (typeof scene.id === "string" && scene.id.length) {
            if (sceneIdsSeen.has(scene.id)) {
              errors.push(contentError(`${sPath}.id`, "DUPLICATE_ID", `${scene.id} is a duplicate scene id`));
            } else {
              sceneIdsSeen.add(scene.id);
              references.sceneIds.add(scene.id);
            }
          }
          if (requireArray(scene.steps, `${sPath}.steps`, errors)) {
            if (!boundedArray(scene.steps, `${sPath}.steps`, "OUT_OF_BOUNDS", V2_STEPS_MIN, V2_STEPS_MAX, errors)) return;
            scene.steps.forEach((step, tIndex) => {
              const tPath = `${sPath}.steps[${tIndex}]`;
              validateV2Step(step, tPath, references, references.initialProducers, references.initialChannels, references.initialWorkers, errors);
              if (typeof step?.id === "string" && step.id.length) {
                if (stepIdsSeen.has(step.id)) {
                  errors.push(contentError(`${tPath}.id`, "DUPLICATE_ID", `${step.id} is a duplicate step id`));
                } else {
                  stepIdsSeen.add(step.id);
                  references.stepIds.add(step.id);
                  if (isObject(step?.checkpoint)) references.checkpointStepIds.add(step.id);
                }
              }
            });
          }
        });
      }
    });
  }

  if (requireArray(value.experience.experiments, "$.experience.experiments", errors)) {
    if (boundedArray(value.experience.experiments, "$.experience.experiments", "OUT_OF_BOUNDS", 0, V2_EXPERIMENTS_MAX, errors)) {
      const experimentIdsSeen = new Set();
      value.experience.experiments.forEach((experiment, eIndex) => {
        validateV2Experiment(experiment, eIndex, errors);
        if (typeof experiment?.id === "string" && experiment.id.length) {
          if (experimentIdsSeen.has(experiment.id)) {
            errors.push(contentError(`$.experience.experiments[${eIndex}].id`, "DUPLICATE_ID", `${experiment.id} is a duplicate experiment id`));
          } else {
            experimentIdsSeen.add(experiment.id);
            references.experimentIds.add(experiment.id);
          }
        }
      });
    }
  }

  if (requireArray(value.experience.completionRules, "$.experience.completionRules", errors)) {
    boundedArray(value.experience.completionRules, "$.experience.completionRules", "OUT_OF_BOUNDS", V2_COMPLETION_RULES_MIN, V2_COMPLETION_RULES_MAX, errors);
    value.experience.completionRules.forEach((rule, rIndex) => {
      validateV2CompletionRule(rule, rIndex, references, errors);
    });
  }

  const stepEntries = stepOrder(value);
  const payloadItemIds = itemIdsFromPayloads(stepEntries);
  for (const id of payloadItemIds) references.declaredEntityIds.add(id);
  stepEntries.forEach((entry) => {
    const focus = entry.step.focus;
    if (!Array.isArray(focus)) return;
    const focusPath = `$.experience.chapters[${entry.cIndex}].scenes[${entry.sIndex}].steps[${entry.tIndex}].focus`;
    focus.forEach((focusId, fIndex) => {
      if (typeof focusId !== "string") return;
      if (!references.declaredEntityIds.has(focusId)) {
        errors.push(contentError(`${focusPath}[${fIndex}]`, "MISSING_REFERENCE", `${focusId} is not a declared entity`));
      }
    });
  });

  validateV2Lab(value.lab, context, errors);
  validateV2Chat(value.chat, errors);
  validateV2TopicIdArray(value.next, "$.next", V2_NEXT_MAX, errors);
  findForbiddenFields(value, "$", errors);

  if (isObject(value.experience.primitive) && isObject(value.experience.primitive.initialState)) {
    simulateWorkerQueue(value.experience.primitive.initialState, stepEntries, errors);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
