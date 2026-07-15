import { randomUUID } from "node:crypto";
import { createLogger } from "./logger.js";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODELS = Object.freeze([
  "z-ai/glm-5.2",
  "deepseek-ai/deepseek-v4-pro",
  "minimaxai/minimax-m3",
  "deepseek-ai/deepseek-v4-flash",
  "minimaxai/minimax-m2.7"
]);
const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

export class AiProviderError extends Error {
  constructor(code, message, { model, status = null, cause } = {}) {
    super(message, { cause });
    this.name = "AiProviderError";
    this.code = code;
    this.model = model;
    this.status = status;
  }
}

export function createAiProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = createLogger(),
  now = Date.now,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  createChainId = randomUUID
} = {}) {
  function status() {
    return {
      managedProviderConfigured: Boolean(env.NVIDIA_API_KEY),
      codexBridgeEnabled: false,
      codexBridgeAvailable: false,
      ollamaEnabled: false
    };
  }

  async function complete({ messages, maxTokens = DEFAULT_MAX_TOKENS }) {
    if (!env.NVIDIA_API_KEY) {
      throw new AiProviderError("PROVIDER_NOT_CONFIGURED", "NVIDIA provider is not configured");
    }

    const models = resolveModels(env);
    const chainId = createChainId();
    const chainStartedAt = now();
    let lastError;

    logger.info("provider.chain.started", { chainId, modelCount: models.length });

    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      const attempt = index + 1;
      const attemptStartedAt = now();
      const attemptMetadata = { chainId, attempt, totalAttempts: models.length, model };
      logger.info("provider.attempt.started", attemptMetadata);
      try {
        const content = await requestModel(model, messages, maxTokens);
        logger.info("provider.attempt.succeeded", {
          ...attemptMetadata,
          durationMs: now() - attemptStartedAt
        });
        logger.info("provider.chain.succeeded", {
          chainId,
          model,
          attempts: attempt,
          fallbackUsed: index > 0,
          durationMs: now() - chainStartedAt
        });
        return { content, model, fallbackUsed: index > 0 };
      } catch (error) {
        lastError = error;
        logger.warn("provider.attempt.failed", {
          ...attemptMetadata,
          status: error.status ?? null,
          code: error.code || "PROVIDER_REQUEST_FAILED",
          durationMs: now() - attemptStartedAt
        });
        const nextModel = models[index + 1];
        if (nextModel) {
          logger.warn("provider.fallback.started", {
            chainId,
            model: nextModel,
            primaryModel: models[0],
            previousModel: model,
            code: error.code || "PROVIDER_REQUEST_FAILED"
          });
        }
      }
    }

    logger.warn("provider.chain.failed", {
      chainId,
      attempts: models.length,
      code: lastError?.code || "PROVIDER_REQUEST_FAILED",
      durationMs: now() - chainStartedAt
    });
    throw lastError;
  }

  async function requestModel(model, messages, maxTokens) {
    const startedAt = now();
    let responseStatus = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    logger.info("provider.request.started", { model });

    try {
      const baseUrl = (env.NVIDIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          messages
        }),
        signal: controller.signal
      });
      responseStatus = response.status;

      if (!response.ok) {
        throw new AiProviderError("PROVIDER_HTTP_ERROR", "Provider returned a non-success status", {
          model,
          status: response.status
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new AiProviderError("PROVIDER_MALFORMED_JSON", "Provider returned malformed JSON", {
          model,
          status: response.status,
          cause: error
        });
      }

      if (!Array.isArray(payload?.choices) || payload.choices.length === 0) {
        logEmptyResponse(model, response.status, startedAt);
        throw new AiProviderError("PROVIDER_MISSING_CHOICES", "Provider response did not contain choices", {
          model,
          status: response.status
        });
      }

      const content = payload.choices[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        logEmptyResponse(model, response.status, startedAt);
        throw new AiProviderError("PROVIDER_EMPTY_CONTENT", "Provider response content was empty", {
          model,
          status: response.status
        });
      }

      logger.info("provider.response.received", {
        model,
        status: response.status,
        durationMs: now() - startedAt,
        contentPresent: true
      });
      return content;
    } catch (error) {
      const providerError = normalizeError(error, model, responseStatus);
      logger.warn("provider.request.failed", {
        model,
        status: providerError.status,
        durationMs: now() - startedAt,
        contentPresent: false,
        code: providerError.code
      });
      throw providerError;
    } finally {
      clearTimeout(timeout);
    }
  }

  function logEmptyResponse(model, responseStatus, startedAt) {
    logger.warn("provider.response.empty", {
      model,
      status: responseStatus,
      durationMs: now() - startedAt,
      contentPresent: false
    });
  }

  return { status, complete };
}

function resolveModels(env) {
  const configured = String(env.NVIDIA_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return configured.length > 0 ? [...new Set(configured)] : [...DEFAULT_MODELS];
}

function normalizeError(error, model, status) {
  if (error instanceof AiProviderError) return error;
  if (error?.name === "AbortError") {
    return new AiProviderError("PROVIDER_TIMEOUT", "Provider request timed out", {
      model,
      status,
      cause: error
    });
  }
  return new AiProviderError("PROVIDER_REQUEST_FAILED", "Provider request failed", {
    model,
    status,
    cause: error
  });
}

let defaultProvider;

function getDefaultProvider() {
  defaultProvider ??= createAiProvider();
  return defaultProvider;
}

export function aiStatus() {
  return getDefaultProvider().status();
}

export async function handleAiRequest(kind, body = {}) {
  const provider = getDefaultProvider();
  if (!provider.status().managedProviderConfigured) {
    return notConfigured(kind);
  }

  const messages = [
    { role: "system", content: "You are the Refract tutor. Be concise, practical, and beginner-friendly." },
    { role: "user", content: buildPrompt(kind, body) }
  ];

  try {
    const result = await provider.complete({ messages });
    return normalizeAiResult(kind, result.content, "managed");
  } catch {
    return {
      status: "request_failed",
      message: "AI tutor is unavailable right now. You can still use the artifact and run tests."
    };
  }
}

function notConfigured(kind) {
  if (kind === "evaluate") {
    return {
      status: "not_configured",
      message: "AI review is unavailable because no backend provider is configured. Your test results are still valid."
    };
  }
  return {
    status: "not_configured",
    message: "AI tutor is unavailable because no backend provider is configured. You can still use the artifact and run tests."
  };
}

function normalizeAiResult(kind, content, provider) {
  if (kind === "evaluate") {
    return {
      status: "ok",
      provider,
      summary: content,
      rubric: [],
      nextStep: "Review the feedback, then try again or move to the next artifact when ready."
    };
  }
  return {
    status: "ok",
    provider,
    message: content
  };
}

function buildPrompt(kind, body) {
  return JSON.stringify({
    task: kind,
    artifactId: body.artifactId || "queue",
    tab: body.tab || null,
    question: body.question || null,
    language: body.language || null,
    code: body.code || null,
    runResult: body.runResult || null,
    canvasEvents: body.canvasEvents || []
  }, null, 2);
}
