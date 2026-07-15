import defaultFs from "node:fs/promises";
import path from "node:path";

import { PROFILE_ID_PATTERN, TOPIC_ID_PATTERN } from "../config/options.js";

const MAX_RECENT_EVENTS = 50;
const MAX_CHAT_MESSAGES = 20;
const MAX_TRACE_EVENTS = 200;
const MAX_CODE_LENGTH = 100_000;
const MAX_CHAT_SUMMARY_LENGTH = 4_000;
const MAX_TRACE_PAYLOAD_BYTES = 64 * 1024;

const TRACE_TYPE_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "html",
  "script",
  "componentCode",
  "executableCode"
]);

const ALLOWED_UPDATE_FIELDS = new Set([
  "canvasState",
  "recentEvents",
  "code",
  "latestRunResult",
  "traceEvents",
  "chatMessages",
  "chatSummary",
  "currentStep",
  "progress"
]);

function emptySession(profileId, topicId) {
  return {
    profileId,
    topicId,
    canvasState: null,
    recentEvents: [],
    code: null,
    latestRunResult: null,
    traceEvents: [],
    chatMessages: [],
    chatSummary: null,
    currentStep: null,
    progress: null
  };
}

function assertProfileId(profileId) {
  if (typeof profileId !== "string" || profileId.length > 100 || !PROFILE_ID_PATTERN.test(profileId)) {
    throw new Error("Invalid profile ID");
  }
}

function assertTopicId(topicId) {
  if (typeof topicId !== "string" || !TOPIC_ID_PATTERN.test(topicId)) {
    throw new Error("Invalid topic ID");
  }
}

function assertUpdate(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Update must be an object");
  }
  const unknown = Object.keys(patch).filter((key) => !ALLOWED_UPDATE_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown session field: ${unknown.join(", ")}`);
  }
}

function validateTraceEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Trace event must be an object");
  }
  if (typeof event.type !== "string" || !TRACE_TYPE_PATTERN.test(event.type)) {
    throw new Error("Invalid trace event type");
  }
  if (!Object.hasOwn(event, "payload")) {
    throw new Error("Trace event must include a payload");
  }
  const { payload } = event;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Trace payload must be an object");
  }
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new Error(`Forbidden trace payload key: ${key}`);
    }
  }
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    throw new Error("Trace payload too large");
  }
  if (bytes > MAX_TRACE_PAYLOAD_BYTES) {
    throw new Error("Trace payload too large");
  }
  return event;
}

function tail(list, limit) {
  if (!Array.isArray(list)) return [];
  if (list.length <= limit) return [...list];
  return list.slice(list.length - limit);
}

function truncateString(value, maxLength) {
  if (typeof value !== "string") return value;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const MAX_PROGRESS_SCENE_IDS = 64;
const MAX_PROGRESS_CHECKPOINT_IDS = 200;
const MAX_EXPERIMENT_STATE_KEYS = 8;

function sanitizeStringArray(value, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.length > 0).slice(0, maxLength);
}

function sanitizeExperimentState(value) {
  if (!isPlainObject(value)) return {};
  const next = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof val === "number" && Number.isFinite(val)) {
      next[key] = val;
    }
  }
  if (Object.keys(next).length > MAX_EXPERIMENT_STATE_KEYS) {
    return {};
  }
  return next;
}

function validateProgress(value, existing = null) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) {
    throw new Error("Progress must be a plain object or null");
  }
  const prior = isPlainObject(existing) ? existing : {};
  return {
    completedSceneIds: [...new Set([
      ...sanitizeStringArray(prior.completedSceneIds, MAX_PROGRESS_SCENE_IDS),
      ...sanitizeStringArray(value.completedSceneIds, MAX_PROGRESS_SCENE_IDS)
    ])].slice(0, MAX_PROGRESS_SCENE_IDS),
    checkpointStepIds: [...new Set([
      ...sanitizeStringArray(prior.checkpointStepIds, MAX_PROGRESS_CHECKPOINT_IDS),
      ...sanitizeStringArray(value.checkpointStepIds, MAX_PROGRESS_CHECKPOINT_IDS)
    ])].slice(0, MAX_PROGRESS_CHECKPOINT_IDS),
    experimentState: { ...sanitizeExperimentState(prior.experimentState), ...sanitizeExperimentState(value.experimentState) }
  };
}

function serializeSchema(session) {
  return {
    profileId: session.profileId,
    topicId: session.topicId,
    canvasState: session.canvasState,
    recentEvents: session.recentEvents,
    code: session.code,
    latestRunResult: session.latestRunResult,
    traceEvents: session.traceEvents,
    chatMessages: session.chatMessages,
    chatSummary: session.chatSummary,
    currentStep: session.currentStep,
    progress: session.progress,
    updatedAt: session.updatedAt ?? null,
    chatSummaryUpdatedAt: session.chatSummaryUpdatedAt ?? null
  };
}

function serializePlain(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createSessionStore({ dataDir, fs = defaultFs, now = () => new Date(), summarize } = {}) {
  if (!dataDir) throw new Error("dataDir is required");
  const pendingUpdates = new Map();

  function sessionPath(profileId, topicId) {
    return path.join(dataDir, "sessions", profileId, `${topicId}.json`);
  }

  async function readSession(profileId, topicId) {
    const destination = sessionPath(profileId, topicId);
    let serialized;
    try {
      serialized = await fs.readFile(destination, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    try {
      const parsed = JSON.parse(serialized);
      return {
        ...emptySession(profileId, topicId),
        canvasState: parsed.canvasState ?? null,
        recentEvents: Array.isArray(parsed.recentEvents) ? parsed.recentEvents : [],
        code: typeof parsed.code === "string" ? parsed.code : null,
        latestRunResult: parsed.latestRunResult ?? null,
        traceEvents: Array.isArray(parsed.traceEvents) ? parsed.traceEvents : [],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
        chatSummary: typeof parsed.chatSummary === "string" ? parsed.chatSummary : null,
        currentStep: typeof parsed.currentStep === "string" ? parsed.currentStep : null,
        progress: isPlainObject(parsed.progress) ? validateProgress(parsed.progress) : null,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
        chatSummaryUpdatedAt: typeof parsed.chatSummaryUpdatedAt === "string"
          ? parsed.chatSummaryUpdatedAt
          : null
      };
    } catch {
      return null;
    }
  }

  async function get(profileId, topicId) {
    assertProfileId(profileId);
    assertTopicId(topicId);
    const stored = await readSession(profileId, topicId);
    if (!stored) return emptySession(profileId, topicId);
    return {
      profileId: stored.profileId,
      topicId: stored.topicId,
      canvasState: stored.canvasState,
      recentEvents: stored.recentEvents,
      code: stored.code,
      latestRunResult: stored.latestRunResult,
      traceEvents: stored.traceEvents,
      chatMessages: stored.chatMessages,
      chatSummary: stored.chatSummary,
      currentStep: stored.currentStep,
      progress: stored.progress,
      updatedAt: stored.updatedAt ?? null,
      chatSummaryUpdatedAt: stored.chatSummaryUpdatedAt ?? null
    };
  }

  async function update(profileId, topicId, patch) {
    assertProfileId(profileId);
    assertTopicId(topicId);
    assertUpdate(patch);
    const key = sessionPath(profileId, topicId);
    const previous = pendingUpdates.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => updateNow(profileId, topicId, patch));
    pendingUpdates.set(key, next);
    return next.finally(() => {
      if (pendingUpdates.get(key) === next) pendingUpdates.delete(key);
    });
  }

  async function updateNow(profileId, topicId, patch) {
    const stored = (await readSession(profileId, topicId)) ?? emptySession(profileId, topicId);
    const session = {
      ...stored,
      recentEvents: [...stored.recentEvents],
      traceEvents: [...stored.traceEvents],
      chatMessages: [...stored.chatMessages]
    };

    const hasPatch = Object.keys(patch).length > 0;

    if (!hasPatch) {
      return persist(profileId, topicId, serializeSchema(session));
    }

    if ("canvasState" in patch && patch.canvasState !== undefined) {
      session.canvasState = patch.canvasState;
    }
    if ("code" in patch && patch.code !== undefined) {
      session.code = truncateString(patch.code, MAX_CODE_LENGTH);
    }
    if ("latestRunResult" in patch && patch.latestRunResult !== undefined) {
      session.latestRunResult = patch.latestRunResult;
    }
    if ("currentStep" in patch && patch.currentStep !== undefined) {
      session.currentStep = patch.currentStep;
    }
    if ("progress" in patch && patch.progress !== undefined) {
      session.progress = validateProgress(patch.progress, session.progress);
    }
    if ("chatSummary" in patch && patch.chatSummary !== undefined) {
      session.chatSummary = patch.chatSummary === null
        ? null
        : truncateString(patch.chatSummary, MAX_CHAT_SUMMARY_LENGTH);
    }
    if ("recentEvents" in patch && Array.isArray(patch.recentEvents)) {
      session.recentEvents = tail(
        [...session.recentEvents, ...patch.recentEvents],
        MAX_RECENT_EVENTS
      );
    }
    if ("traceEvents" in patch && Array.isArray(patch.traceEvents)) {
      const validated = patch.traceEvents.map(validateTraceEvent);
      session.traceEvents = tail(
        [...session.traceEvents, ...validated],
        MAX_TRACE_EVENTS
      );
    }
    if ("chatMessages" in patch && Array.isArray(patch.chatMessages)) {
      const combined = session.chatMessages.length > 0
        ? [...session.chatMessages, ...patch.chatMessages]
        : patch.chatMessages;
      if (combined.length > MAX_CHAT_MESSAGES) {
        const excessCount = combined.length - MAX_CHAT_MESSAGES;
        const droppedMessages = combined.slice(0, excessCount);
        session.chatMessages = tail(combined, MAX_CHAT_MESSAGES);
        if (typeof summarize === "function") {
          const summary = await summarize(droppedMessages);
          if (typeof summary === "string" && summary.length > 0) {
            session.chatSummary = truncateString(summary, MAX_CHAT_SUMMARY_LENGTH);
            session.chatSummaryUpdatedAt = now().toISOString();
          }
        }
      } else {
        session.chatMessages = [...combined];
      }
    }

    session.updatedAt = now().toISOString();
    return persist(profileId, topicId, serializeSchema(session));
  }

  async function persist(profileId, topicId, schema) {
    const destination = sessionPath(profileId, topicId);
    const directory = path.dirname(destination);
    const temporary = `${destination}.tmp`;
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporary, serializePlain(schema), "utf8");
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm?.(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return schema;
  }

  return { get, update };
}
