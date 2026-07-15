import crypto from "node:crypto";
import defaultFs from "node:fs/promises";
import path from "node:path";

import { PROFILE_ID_PATTERN, TOPIC_ID_PATTERN } from "../config/options.js";

function assertSafeIds({ profileId, topicId }) {
  if (typeof profileId !== "string" || profileId.length > 100 || !PROFILE_ID_PATTERN.test(profileId)) {
    throw new Error("Invalid profile ID");
  }
  if (typeof topicId !== "string" || !TOPIC_ID_PATTERN.test(topicId)) {
    throw new Error("Invalid topic ID");
  }
}

function invalidJsonError() {
  return {
    path: "$",
    code: "INVALID_JSON",
    message: "Cached artifact is not valid JSON"
  };
}

export function createArtifactCache({ generatedRoot, validator, fs = defaultFs, logger = {} }) {
  if (!generatedRoot) throw new Error("generatedRoot is required");
  if (typeof validator !== "function") throw new Error("validator is required");

  function cachePath(context) {
    assertSafeIds(context);
    return path.join(generatedRoot, "artifacts", context.profileId, context.topicId, "artifact.json");
  }

  async function read(context) {
    const destination = cachePath(context);
    let serialized;
    try {
      serialized = await fs.readFile(destination, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        logger.info?.("cache.read.miss", { profileId: context.profileId, topicId: context.topicId });
        return { status: "miss" };
      }
      throw error;
    }

    let artifact;
    try {
      artifact = JSON.parse(serialized);
    } catch {
      const errors = [invalidJsonError()];
      logger.warn?.("artifact.validation.failed", { profileId: context.profileId, topicId: context.topicId, errors });
      return { status: "invalid", errors };
    }

    // Task 0.4: a cached generated artifact whose schemaVersion does not match
    // the runtime's expected version is reported as stale (needs regeneration),
    // distinct from invalid (corrupt/quarantined). Checked after JSON parse so
    // unparseable entries stay invalid, and before strict validation so the
    // v2 runtime never runs a v1 artifact through the v2 validator.
    if (
      context.expectedSchemaVersion !== undefined &&
      Number.isFinite(context.expectedSchemaVersion) &&
      typeof artifact === "object" && artifact !== null &&
      artifact.schemaVersion !== context.expectedSchemaVersion
    ) {
      logger.info?.("cache.read.stale", {
        profileId: context.profileId,
        topicId: context.topicId,
        expectedSchemaVersion: context.expectedSchemaVersion,
        cachedSchemaVersion: artifact.schemaVersion
      });
      return { status: "stale", cachedSchemaVersion: artifact.schemaVersion };
    }

    const validation = validator(artifact, context);
    if (!validation.ok) {
      logger.warn?.("artifact.validation.failed", {
        profileId: context.profileId,
        topicId: context.topicId,
        errors: validation.errors
      });
      return { status: "invalid", errors: validation.errors };
    }

    logger.info?.("cache.read.hit", { profileId: context.profileId, topicId: context.topicId });
    return { status: "hit", value: validation.value };
  }

  async function write(artifact, context) {
    assertSafeIds(context);
    const validation = validator(artifact, context);
    if (!validation.ok) {
      logger.warn?.("artifact.validation.failed", {
        profileId: context.profileId,
        topicId: context.topicId,
        errors: validation.errors
      });
      return { status: "invalid", errors: validation.errors };
    }

    const destination = cachePath(context);
    const directory = path.dirname(destination);
    const temporary = `${destination}.${process.pid}-${crypto.randomUUID()}.tmp`;
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporary, JSON.stringify(validation.value), "utf8");
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm?.(temporary, { force: true }).catch(() => {});
      logger.error?.("cache.write.failed", {
        profileId: context.profileId,
        topicId: context.topicId,
        code: error?.code ?? "CACHE_WRITE_FAILED"
      });
      throw error;
    }

    logger.info?.("cache.write.succeeded", { profileId: context.profileId, topicId: context.topicId });
    return { status: "written", value: validation.value };
  }

  return { read, write };
}
