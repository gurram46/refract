import { CORE_DOMAIN_IDS } from "./domainConstants.js";

export function selectActiveProfile(profiles, selectedProfileId) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  if (selectedProfileId) {
    const found = profiles.find((p) => p && p.id === selectedProfileId);
    return found ?? profiles[0];
  }
  return profiles[0];
}

export function selectActiveTopic(topics, selectedTopicId, activeProfile) {
  if (!Array.isArray(topics) || topics.length === 0) return null;
  const paired = activeProfile?.pairedDomains ?? [];
  const scored = topics.map((t) => {
    if (!t || !t.id) return { topic: t, score: 0 };
    const domain = extractDomain(t.id);
    let score = 0;
    if (paired.includes(domain)) score += 10;
    if (CORE_DOMAIN_IDS.has(domain)) score += 5;
    return { topic: t, score };
  });
  scored.sort((a, b) => b.score - a.score);

  if (selectedTopicId) {
    const found = scored.find((s) => s.topic.id === selectedTopicId);
    return found ? found.topic : scored[0].topic;
  }
  return scored[0].topic;
}

function extractDomain(topicId) {
  const dotIdx = (topicId || "").indexOf(".");
  return dotIdx >= 0 ? topicId.slice(0, dotIdx) : "";
}

export const TUTOR_ACTIONS = Object.freeze(["explain", "hint", "evaluate"]);

export function formatDecision(decision) {
  if (!decision || typeof decision !== "object") return String(decision ?? "");
  return `${decision.label}: ${decision.outcome}`;
}

const MAX_CHAT_MESSAGES = 40;
const MAX_CODE_LENGTH = 5000;
const MAX_TRACE_EVENTS = 100;

export function buildTutorContext({ artifact, session, activeProfile, activeTopic, action, question, tab } = {}) {
  const boundedCode = buildBoundedCode(session);
  const context = buildNestedContext({ artifact, session, activeProfile, activeTopic, action });

  return {
    artifactId: artifact?.topicId ?? activeTopic?.id ?? null,
    tab: tab ?? null,
    question: question ?? null,
    language: activeProfile?.language ?? null,
    code: boundedCode ?? null,
    runResult: buildRunResultString(session),
    canvasEvents: Array.isArray(session?.recentEvents) ? [...session.recentEvents] : [],
    context
  };
}

function buildBoundedCode(session) {
  if (!session?.code) return null;
  const codeStr = typeof session.code === "string" ? session.code : "";
  return codeStr.slice(0, MAX_CODE_LENGTH);
}

function buildRunResultString(session) {
  if (!session?.latestRunResult) return null;
  const r = session.latestRunResult;
  const label = r.success ? "success" : "failure";
  return r.summary ? `${label}: ${r.summary}` : label;
}

function buildNestedContext({ artifact, session, activeProfile, activeTopic, action }) {
  const ctx = {};

  if (artifact) {
    ctx.artifact = {
      title: artifact.title,
      summary: artifact.summary,
      topicId: artifact.topicId,
      profileId: artifact.profileId
    };
  }

  if (activeProfile) {
    ctx.profile = {
      language: activeProfile.language,
      level: activeProfile.level,
      goal: activeProfile.goal,
      pairedDomains: activeProfile.pairedDomains
    };
  }

  if (activeTopic) {
    ctx.topic = {
      id: activeTopic.id,
      title: activeTopic.title
    };
  }

  if (action && TUTOR_ACTIONS.includes(action)) {
    ctx.action = action;
  }

  if (session) {
    const messages = Array.isArray(session.chatMessages) ? session.chatMessages.slice(-MAX_CHAT_MESSAGES) : [];
    if (messages.length > 0) ctx.recentMessages = messages;

    if (session.currentStep != null) ctx.currentStep = session.currentStep;
    if (session.chatSummary) ctx.chatSummary = session.chatSummary;

    if (Array.isArray(session.traceEvents) && session.traceEvents.length > 0) {
      ctx.traceEvents = session.traceEvents.slice(-MAX_TRACE_EVENTS);
    }

    if (session.latestRunResult) {
      ctx.latestRun = {
        success: !!session.latestRunResult.success,
        summary: session.latestRunResult.summary
      };
    }
  }

  return ctx;
}

export function artifactStatusLabel(artifactCacheResult) {
  if (!artifactCacheResult) return "not_generated";
  if (artifactCacheResult.status === "cached") return "cached";
  if (artifactCacheResult.status === "generated") return "generated";
  return "not_generated";
}

export function computeActiveSurface(activeProfile, activeTopic, artifactStatus) {
  if (!activeProfile) return "profile-builder";
  if (!activeTopic) return "game-field";
  if (artifactStatus === "cached" || artifactStatus === "generated") return "artifact-canvas";
  return "game-field";
}

export function partitionTopicsByDomain(topics) {
  const core = [];
  const paired = [];
  const other = [];
  for (const t of topics) {
    if (!t || !t.id) continue;
    const domain = extractDomain(t.id);
    if (CORE_DOMAIN_IDS.has(domain)) core.push(t);
    else if (domain) paired.push(t);
    else other.push(t);
  }
  return { core, paired, other };
}
