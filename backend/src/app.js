import { computeCompletion } from "./memory/completion.js";
import express from "express";
import { loadArtifact } from "./lib/artifacts.js";
import { aiStatus, handleAiRequest } from "./lib/aiProvider.js";
import { getProgress, saveProgress } from "./lib/progressStore.js";
import { detectPython } from "./lib/runtime.js";
import { runPythonArtifact } from "./runners/pythonRunner.js";
import {
  CORE_DOMAINS,
  PAIRED_DOMAINS,
  SUPPORTED_LEVELS,
  SUPPORTED_LANGUAGES
} from "./config/options.js";

const REQUEST_LIMIT = "120kb";
const SUPPORTED_RUN_LANGUAGES = new Set(["python"]);

function translateCode(code) {
  const lookup = {
    PROFILE_NOT_FOUND: 404,
    TOPIC_NOT_FOUND: 404,
    GENERATION_FETCH_FAILED: 404,
    INVALID_PROFILE: 400,
    ARTIFACT_NOT_GENERATED: 404,
    UNKNOWN_SESSION_FIELD: 400,
    SESSION_NOT_FOUND: 404
  };
  return lookup[code] ?? null;
}

export function createApp({ logger, profileStore, topicGraph, artifactGenerator, sessionStore } = {}) {
  const app = express();

  app.use(setCorsHeaders);
  app.options("*", (_request, response) => response.sendStatus(204));
  app.use(express.json({ limit: REQUEST_LIMIT }));
  if (logger) {
    app.use(requestLogger(logger));
  }

  app.get("/health", async (_request, response, next) => {
    try {
      response.json({
        ok: true,
        service: "refract-backend",
        version: "0.1.0",
        runtimes: {
          python: await detectPython(),
          java: false
        },
        ai: aiStatus()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/options", (_request, response) => {
    response.json({
      levels: [...SUPPORTED_LEVELS],
      languages: [...SUPPORTED_LANGUAGES],
      coreDomains: [...CORE_DOMAINS],
      pairedDomains: [...PAIRED_DOMAINS]
    });
  });

  app.get("/profiles", async (_request, response, next) => {
    try {
      if (!profileStore) return response.status(503).json({ error: "Profile store is not available" });
      response.json(await profileStore.list());
    } catch (error) {
      next(error);
    }
  });

  app.post("/profiles", async (request, response, next) => {
    try {
      if (!profileStore) return response.status(503).json({ error: "Profile store is not available" });
      const profile = await profileStore.save(request.body);
      response.status(201).json(profile);
    } catch (error) {
      const status = translateCode(error.code) || 400;
      let body = {};
      if (error.errors && Array.isArray(error.errors)) {
        body.error = error.message;
        body.errors = error.errors;
      } else {
        body.error = error.message || "Invalid profile";
      }
      response.status(status).json(body);
    }
  });

  app.get("/profiles/:profileId", async (request, response, next) => {
    try {
      if (!profileStore) return response.status(503).json({ error: "Profile store is not available" });
      const profile = await profileStore.get(request.params.profileId);
      if (!profile) return response.status(404).json({ error: "Profile not found", code: "PROFILE_NOT_FOUND" });
      response.json(profile);
    } catch (error) {
      next(error);
    }
  });

  app.get("/topics", async (_request, response, next) => {
    try {
      if (!topicGraph) return response.status(503).json({ error: "Topic graph is not available" });
      response.json(await topicGraph.list());
    } catch (error) {
      next(error);
    }
  });

  app.get("/topics/:topicId", async (request, response, next) => {
    try {
      if (!topicGraph) return response.status(503).json({ error: "Topic graph is not available" });
      const node = await topicGraph.get(request.params.topicId);
      if (!node) return response.status(404).json({ error: "Topic not found", code: "TOPIC_NOT_FOUND" });
      response.json(node);
    } catch (error) {
      next(error);
    }
  });

  app.get("/artifact-runtime/:profileId/:topicId", async (request, response, next) => {
    try {
      if (!artifactGenerator) return response.status(503).json({ error: "Artifact generator is not available" });
      const { profileId, topicId } = request.params;
      const result = await artifactGenerator.get(profileId, topicId);
      if (result.status === "not_generated") {
        return response.status(404).json({ status: "not_generated", code: "ARTIFACT_NOT_GENERATED" });
      }
      if (result.status === "cached") {
        return response.json({ status: "cached", artifact: result.artifact });
      }
      response.status(404).json({ status: "not_found" });
    } catch (error) {
      const status = translateCode(error.code) || 500;
      response.status(status).json({ code: error.code || "UNKNOWN", error: error.message });
    }
  });

  app.post("/artifact-runtime/:profileId/:topicId/generate", async (request, response, next) => {
    try {
      if (!artifactGenerator) return response.status(503).json({ error: "Artifact generator is not available" });
      const { profileId, topicId } = request.params;
      const result = await artifactGenerator.generate(profileId, topicId);
      response.status(result.status === "generation_failed" ? 502 : 200).json(result);
    } catch (error) {
      const status = translateCode(error.code) || 500;
      response.status(status).json({ code: error.code || "UNKNOWN", error: error.message });
    }
  });

  app.get("/artifact-runtime/:profileId/:topicId/completion", async (request, response, next) => {
    try {
      if (!artifactGenerator) return response.status(503).json({ error: "Artifact generator is not available" });
      if (!sessionStore) return response.status(503).json({ error: "Session store is not available" });
      const { profileId, topicId } = request.params;
      const result = await artifactGenerator.get(profileId, topicId);
      if (result.status === "not_generated") {
        return response.status(404).json({ status: "not_generated", code: "ARTIFACT_NOT_GENERATED" });
      }
      if (result.status !== "cached") {
        return response.status(404).json({ status: "not_found" });
      }
      const session = await sessionStore.get(profileId, topicId);
      const completion = computeCompletion(result.artifact, session?.progress ?? null);
      response.json(completion);
    } catch (error) {
      const status = translateCode(error.code) || 500;
      response.status(status).json({ code: error.code || "UNKNOWN", error: error.message });
    }
  });

  app.get("/sessions/:profileId/:topicId", async (request, response, next) => {
    try {
      if (!sessionStore) return response.status(503).json({ error: "Session store is not available" });
      const { profileId, topicId } = request.params;
      const session = await sessionStore.get(profileId, topicId);
      response.json(session);
    } catch (error) {
      const status = translateCode(error.code) || 400;
      response.status(status).json({ code: error.code || "UNKNOWN", error: error.message });
    }
  });

  app.post("/sessions/:profileId/:topicId", async (request, response, next) => {
    try {
      if (!sessionStore) return response.status(503).json({ error: "Session store is not available" });
      const { profileId, topicId } = request.params;
      const session = await sessionStore.update(profileId, topicId, request.body || {});
      response.json(session);
    } catch (error) {
      const status = error.message && error.message.includes("Unknown session field") ? 400 : (translateCode(error.code) || 400);
      response.status(status).json({ code: error.code || "UNKNOWN", error: error.message });
    }
  });

  app.get("/artifacts/:id", async (request, response, next) => {
    try {
      response.json(await loadArtifact(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/run", async (request, response, next) => {
    try {
      const body = request.body ?? {};
      const profileId = body.profileId;
      const topicId = body.topicId;
      const artifactId = body.artifactId;
      const language = body.language;
      const code = body.code;

      let artifact;

      if (profileId && topicId) {
        if (!artifactGenerator) {
          return response.status(503).json({ error: "Artifact generator is not available" });
        }
        const genResult = await artifactGenerator.get(profileId, topicId);
        if (genResult.status !== "cached") {
          return response.status(404).json({ code: "ARTIFACT_NOT_GENERATED", error: "No artifact available to run" });
        }
        artifact = genResult.artifact;
      } else if (artifactId) {
        artifact = await loadArtifact(artifactId);
      } else {
        return response.status(400).json({ code: "INVALID_REQUEST", error: "Provide artifactId or (profileId + topicId)" });
      }

      if (!SUPPORTED_RUN_LANGUAGES.has(language)) {
        response.status(400).json({
          success: false,
          status: "unsupported_language",
          message: `Artifact ${artifact.id || topicId || artifactId} does not support ${language}. Supported languages for Phase 1: python.`
        });
        return;
      }

      const result = await runPythonArtifact({ artifact, code: typeof code === "string" ? code : "" });
      response.json({
        success: result.success,
        artifactId: artifact.id ?? artifactId ?? topicId,
        language,
        stdout: result.stdout,
        stderr: result.stderr,
        traceEvents: result.traceEvents,
        summary: result.summary
      });
    } catch (error) {
      next(error);
    }
  });

  for (const kind of ["explain", "hint", "evaluate"]) {
    app.post(`/ai/stream/${kind}`, async (request, response, next) => {
      try {
        response.json(await handleAiRequest(kind, request.body));
      } catch (error) {
        next(error);
      }
    });
  }

  app.get("/progress/:studentId", async (request, response, next) => {
    try {
      response.json(await getProgress(request.params.studentId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/progress/:studentId", async (request, response, next) => {
    try {
      response.json(await saveProgress(request.params.studentId, request.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error, _request, response, _next) => {
    const status = error.status || 500;
    const safeMessage = error.message || "Internal server error";
    response.status(status).json({ error: safeMessage });
  });

  return app;
}

function requestLogger(logger) {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    const method = request.method;
    const route = request.route?.path || request.path || request.url;

    logger.info("request.started", { method, route });

    response.on("finish", () => {
      const durationNs = Number(process.hrtime.bigint() - startedAt);
      logger.info("request.completed", {
        method,
        route,
        status: response.statusCode,
        durationMs: Math.round(durationNs / 1_000_000)
      });
    });

    next();
  };
}

function setCorsHeaders(request, response, next) {
  const origin = request.headers.origin || "";
  const allowedDevOrigin = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
  response.setHeader("Access-Control-Allow-Origin", allowedDevOrigin ? origin : "http://127.0.0.1:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  next();
}