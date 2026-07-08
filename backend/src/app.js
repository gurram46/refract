import express from "express";
import { loadArtifact } from "./lib/artifacts.js";
import { aiStatus, handleAiRequest } from "./lib/aiProvider.js";
import { getProgress, saveProgress } from "./lib/progressStore.js";
import { detectPython } from "./lib/runtime.js";
import { runPythonArtifact } from "./runners/pythonRunner.js";

const REQUEST_LIMIT = "120kb";
const SUPPORTED_RUN_LANGUAGES = new Set(["python"]);

export function createApp() {
  const app = express();

  app.use(setCorsHeaders);
  app.options("*", (_request, response) => response.sendStatus(204));
  app.use(express.json({ limit: REQUEST_LIMIT }));

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

  app.get("/artifacts/:id", async (request, response, next) => {
    try {
      response.json(await loadArtifact(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/run", async (request, response, next) => {
    try {
      const artifactId = request.body?.artifactId;
      const language = request.body?.language;
      const code = request.body?.code;
      const artifact = await loadArtifact(artifactId);

      if (!SUPPORTED_RUN_LANGUAGES.has(language)) {
        response.status(400).json({
          success: false,
          status: "unsupported_language",
          message: `Artifact ${artifact.id} does not support ${language}. Supported languages for Phase 1: python.`
        });
        return;
      }

      const result = await runPythonArtifact({ artifact, code: typeof code === "string" ? code : "" });
      response.json({
        success: result.success,
        artifactId: artifact.id,
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
    response.status(status).json({ error: status === 500 ? error.message : error.message });
  });

  return app;
}

function setCorsHeaders(request, response, next) {
  const origin = request.headers.origin || "";
  const allowedDevOrigin = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
  response.setHeader("Access-Control-Allow-Origin", allowedDevOrigin ? origin : "http://127.0.0.1:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  next();
}
