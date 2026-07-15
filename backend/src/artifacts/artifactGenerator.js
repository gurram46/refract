import { buildArtifactMessages, buildArtifactMessagesV2, buildRepairMessagesV2 } from "./promptBuilder.js";

class GenerationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GenerationError";
    this.code = code;
  }
}

function assertProfile(profile) {
  if (!profile) {
    throw new GenerationError("PROFILE_NOT_FOUND", "Profile not found");
  }
}

function assertTopic(node) {
  if (!node) {
    throw new GenerationError("TOPIC_NOT_FOUND", "Topic not found");
  }
}

function parseContent(content) {
  if (typeof content !== "string") return null;

  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const fencePattern = /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/;
  const match = fencePattern.exec(trimmed);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  return null;
}

function buildValidationDetails(errors) {
  const lines = [];
  for (const err of errors) {
    lines.push(`- ${err.code}: ${err.path} — ${err.message}`);
  }
  return lines.join("\n");
}

function repairFailureMessage() {
  return {
    status: "generation_failed",
    code: "GENERATION_FAILED",
    message: "Artifact generation did not produce valid data after two attempts. You can try generating again — the provider will attempt a fresh response."
  };
}

// Returns true when the resolved topic context (or the topic node) signals the
// v2 contract. V1 remains the default until a topic opts in via schemaVersion.
// ponytail: single boolean gate; route selection lives here so the v1/v2
// prompt builders stay pure.
function isV2Context(topicContext, node) {
  if (topicContext && topicContext.schemaVersion === 2) return true;
  if (node && node.schemaVersion === 2) return true;
  return false;
}

// Task 0.4: cache cutover. A topic node declaring schemaVersion 2 must read
// generated cache entries as v2 only; a v1 cached entry is reported stale. For
// v1 topics (no schemaVersion 2 on the node), no expectedSchemaVersion is set,
// preserving the v1 runtime.
function readContext(profileId, topicId, node) {
  const ctx = { profileId, topicId };
  if (node && node.schemaVersion === 2) {
    ctx.expectedSchemaVersion = 2;
  }
  return ctx;
}

export function createArtifactGenerator({ profileStore, topicGraph, artifactCache, aiProvider, logger = {} }) {
  if (!profileStore) throw new Error("profileStore is required");
  if (!topicGraph) throw new Error("topicGraph is required");
  if (!artifactCache) throw new Error("artifactCache is required");
  if (!aiProvider) throw new Error("aiProvider is required");

  async function get(profileId, topicId) {
    const profile = await profileStore.get(profileId);
    assertProfile(profile);

    const node = await topicGraph.get(topicId);
    assertTopic(node);

    const cacheResult = await artifactCache.read(readContext(profileId, topicId, node));
    if (cacheResult.status === "hit") {
      return { status: "cached", artifact: cacheResult.value };
    }

    return { status: "not_generated" };
  }

  async function generate(profileId, topicId) {
    const profile = await profileStore.get(profileId);
    assertProfile(profile);

    const node = await topicGraph.get(topicId);
    assertTopic(node);

    const cacheResult = await artifactCache.read(readContext(profileId, topicId, node));
    if (cacheResult.status === "hit") {
      return { status: "cached", artifact: cacheResult.value };
    }

    logger.info?.("generation.started", { profileId, topicId });

    const topicContext = await topicGraph.resolveContext(topicId, profile);
    const v2 = isV2Context(topicContext, node);
    const built = v2
      ? buildArtifactMessagesV2({ profile, topicContext })
      : buildArtifactMessages({ profile, topicContext });
    const messages = built.messages;
    const systemContent = messages.find((m) => m.role === "system")?.content;

    let providerResult;
    try {
      providerResult = await aiProvider.complete({ messages });
    } catch (error) {
      logger.warn?.("generation.failed", { profileId, topicId, code: error.code || "PROVIDER_FAILED" });
      return {
        status: "generation_failed",
        code: "GENERATION_FAILED",
        message: "The AI provider could not complete the request. Please try again."
      };
    }

    const parsed = parseContent(providerResult.content);

    const validationContext = v2
      ? {
        profileId,
        topicId,
        language: profile.language,
        primitiveKind: topicContext.primitiveKind || node.primitiveKind
      }
      : {
        profileId,
        topicId,
        allowedVisualKinds: node.allowedVisualKinds,
        language: profile.language
      };

    if (!parsed) {
      const errors = [{ path: "$", code: "PARSE_FAILED", message: "Response was not a valid JSON artifact. Expected a raw JSON object or a single fenced json code block." }];
      logger.warn?.("artifact.validation.failed", { profileId, topicId, errors: errors.map(stripMessage) });

      const repairResult = await attemptRepair(messages, systemContent, errors, providerResult, validationContext, v2);
      if (repairResult === null) {
        logger.warn?.("generation.failed", { profileId, topicId });
        return repairFailureMessage();
      }
      return repairResult;
    }

    let writeResult = await artifactCache.write(parsed, validationContext);

    if (writeResult.status === "written") {
      logger.info?.("artifact.validation.succeeded", { profileId, topicId });
      logger.info?.("generation.completed", { profileId, topicId, model: providerResult.model, fallbackUsed: providerResult.fallbackUsed });
      return {
        status: "generated",
        artifact: writeResult.value,
        model: providerResult.model,
        fallbackUsed: providerResult.fallbackUsed ?? false
      };
    }

    logger.warn?.("artifact.validation.failed", { profileId, topicId, errors: writeResult.errors.map(stripMessage) });

    const repairResult = await attemptRepair(messages, systemContent, writeResult.errors, providerResult, validationContext, v2);
    if (repairResult === null) {
      logger.warn?.("generation.failed", { profileId, topicId });
      return repairFailureMessage();
    }
    return repairResult;
  }

  async function attemptRepair(originalMessages, originalSystemContent, originalErrors, originalResult, validationContext, v2) {
    let repairMessages;
    if (v2) {
      repairMessages = buildRepairMessagesV2(originalSystemContent, originalErrors, validationContext);
    } else {
      const systemMsg = originalMessages.find((m) => m.role === "system");
      repairMessages = [
        systemMsg ? { ...systemMsg } : { role: "system", content: "You are a curriculum artifact generator. Respond with exactly one valid JSON object and nothing else." },
        {
          role: "user",
          content: `The following validation errors were found in the artifact:\n\n${buildValidationDetails(originalErrors)}\n\nExact profileId: ${validationContext.profileId}\nExact topicId: ${validationContext.topicId}\nExact practice language: ${validationContext.language}\nAllowed visual kinds: ${(validationContext.allowedVisualKinds || []).join(", ")}\n\nGenerate a corrected artifact JSON object that passes all validation rules and exact constraints. Return only a valid JSON object.`
        }
      ];
    }

    let repairProviderResult;
    try {
      repairProviderResult = await aiProvider.complete({ messages: repairMessages });
    } catch {
      return null;
    }

    const repaired = parseContent(repairProviderResult?.content);

    if (!repaired) {
      return null;
    }

    const writeResult = await artifactCache.write(repaired, validationContext);

    if (writeResult.status === "written") {
      logger.info?.("artifact.validation.succeeded", { profileId: validationContext.profileId, topicId: validationContext.topicId });
      logger.info?.("generation.completed", {
        profileId: validationContext.profileId,
        topicId: validationContext.topicId,
        model: repairProviderResult.model,
        fallbackUsed: repairProviderResult.fallbackUsed ?? true
      });
      return {
        status: "generated",
        artifact: writeResult.value,
        model: repairProviderResult.model,
        fallbackUsed: repairProviderResult.fallbackUsed ?? true
      };
    }

    logger.warn?.("artifact.validation.failed", {
      profileId: validationContext.profileId,
      topicId: validationContext.topicId,
      errors: writeResult.errors.map(stripMessage)
    });

    return null;
  }

  return { get, generate };
}

function stripMessage(error) {
  return { path: error.path, code: error.code };
}
