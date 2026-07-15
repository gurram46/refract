import assert from "node:assert/strict";
import test from "node:test";

const MODEL_CHAIN = [
  "z-ai/glm-5.2",
  "deepseek-ai/deepseek-v4-pro",
  "minimaxai/minimax-m3",
  "deepseek-ai/deepseek-v4-flash",
  "minimaxai/minimax-m2.7"
];
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODEL = MODEL_CHAIN[1];
const FINAL_MODEL = MODEL_CHAIN.at(-1);
const API_KEY = "nvapi-test-secret-value";
const silentLogger = {
  info() {},
  warn() {},
  error() {}
};

test("uses a 180-second default timeout for each model", async () => {
  const providerModule = await import("../src/lib/aiProvider.js");
  assert.equal(providerModule.DEFAULT_REQUEST_TIMEOUT_MS, 180_000);
});

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function successfulResponse(content = "provider answer") {
  return jsonResponse({ choices: [{ message: { content } }] });
}

function captureLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      info(event, metadata) { entries.push({ level: "info", event, ...metadata }); },
      warn(event, metadata) { entries.push({ level: "warn", event, ...metadata }); },
      error(event, metadata) { entries.push({ level: "error", event, ...metadata }); }
    }
  };
}

test("loads plain .env values without replacing existing environment values", async () => {
  const { loadEnv } = await import("../src/lib/loadEnv.js");
  const env = { EXISTING: "from-process" };
  const fs = {
    async readFile(filePath, encoding) {
      assert.equal(filePath, "backend.env");
      assert.equal(encoding, "utf8");
      return [
        "# backend secrets",
        "NVIDIA_API_KEY=from-file",
        "EXISTING=from-file",
        "EMPTY=",
        "",
        "  # another comment"
      ].join("\n");
    }
  };

  const result = await loadEnv({ env, envPath: "backend.env", fs });

  assert.deepEqual(result, {
    loaded: true,
    configuredKeys: ["EXISTING", "NVIDIA_API_KEY"]
  });
  assert.deepEqual(env, {
    EXISTING: "from-process",
    NVIDIA_API_KEY: "from-file",
    EMPTY: ""
  });
  assert.equal(JSON.stringify(result).includes("from-file"), false);
});

test("reports a missing .env file without failing startup", async () => {
  const { loadEnv } = await import("../src/lib/loadEnv.js");
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });

  const result = await loadEnv({
    env: { NVIDIA_API_KEY: API_KEY },
    envPath: "missing.env",
    fs: { async readFile() { throw missing; } }
  });

  assert.deepEqual(result, { loaded: false, configuredKeys: [] });
});

test("emits one structured JSON line and recursively redacts sensitive metadata", async () => {
  const { createLogger } = await import("../src/lib/logger.js");
  const lines = [];
  const logger = createLogger({
    sink: (line) => lines.push(line),
    now: () => new Date("2026-07-10T12:00:00.000Z")
  });
  const metadata = {
    model: PRIMARY_MODEL,
    nested: {
      apiKey: API_KEY,
      Authorization: `Bearer ${API_KEY}`,
      access_token: API_KEY,
      systemPrompt: "private learner prompt",
      clientSecret: API_KEY
    },
    items: [{ tokenCount: 42, safe: true }]
  };

  logger.info("provider.configured", metadata);

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(entry, {
    timestamp: "2026-07-10T12:00:00.000Z",
    level: "info",
    event: "provider.configured",
    model: PRIMARY_MODEL,
    nested: {
      apiKey: "[REDACTED]",
      Authorization: "[REDACTED]",
      access_token: "[REDACTED]",
      systemPrompt: "[REDACTED]",
      clientSecret: "[REDACTED]"
    },
    items: [{ tokenCount: "[REDACTED]", safe: true }]
  });
  assert.equal(lines[0].includes(API_KEY), false);
  assert.equal(lines[0].includes("private learner prompt"), false);
  assert.equal(metadata.nested.apiKey, API_KEY);
});

test("does not allow metadata to replace required log fields", async () => {
  const { createLogger } = await import("../src/lib/logger.js");
  const lines = [];
  const logger = createLogger({
    sink: (line) => lines.push(line),
    now: () => new Date("2026-07-10T12:00:00.000Z")
  });

  logger.warn("provider.request.failed", {
    timestamp: "forged",
    level: "info",
    event: "forged.event"
  });

  assert.deepEqual(JSON.parse(lines[0]), {
    timestamp: "2026-07-10T12:00:00.000Z",
    level: "warn",
    event: "provider.request.failed"
  });
});

test("uses the required primary model and default max_tokens", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const requests = [];
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger: silentLogger,
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return successfulResponse("primary answer");
    }
  });

  const result = await provider.complete({ messages: [{ role: "user", content: "help" }] });

  assert.deepEqual(result, {
    content: "primary answer",
    model: PRIMARY_MODEL,
    fallbackUsed: false
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, PRIMARY_MODEL);
  assert.equal(requests[0].max_tokens, 4096);
});

test("uses an explicit maxTokens value", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  let requestBody;
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger: silentLogger,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return successfulResponse();
    }
  });

  await provider.complete({ messages: [], maxTokens: 512 });

  assert.equal(requestBody.max_tokens, 512);
});

const primaryFailures = [
  ["non-2xx status", async () => jsonResponse({ error: "unavailable" }, { status: 503 })],
  ["missing choices", async () => jsonResponse({})],
  ["blank content", async () => successfulResponse("   ")],
  ["malformed response JSON", async () => ({
    ok: true,
    status: 200,
    async json() { throw new SyntaxError("bad json"); }
  })]
];

for (const [failureName, primaryResponse] of primaryFailures) {
  test(`falls back to DeepSeek after ${failureName}`, async () => {
    const { createAiProvider } = await import("../src/lib/aiProvider.js");
    const requests = [];
    const provider = createAiProvider({
      env: { NVIDIA_API_KEY: API_KEY },
      logger: silentLogger,
      fetchImpl: async (url, options) => {
        requests.push({ url, options, body: JSON.parse(options.body) });
        if (requests.length === 1) return primaryResponse(url, options);
        return successfulResponse("fallback answer");
      }
    });

    const result = await provider.complete({ messages: [{ role: "user", content: "private prompt" }] });

    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.model, PRIMARY_MODEL);
    assert.equal(requests[0].body.max_tokens, 4096);
    assert.equal(requests[1].body.model, FALLBACK_MODEL);
    assert.equal(requests[1].body.max_tokens, 4096);
    assert.deepEqual(result, {
      content: "fallback answer",
      model: FALLBACK_MODEL,
      fallbackUsed: true
    });
  });
}

test("tries the configured NVIDIA model chain in order", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const requestedModels = [];
  const provider = createAiProvider({
    env: {
      NVIDIA_API_KEY: API_KEY,
      NVIDIA_MODELS: MODEL_CHAIN.join(",")
    },
    logger: silentLogger,
    fetchImpl: async (_url, options) => {
      const { model } = JSON.parse(options.body);
      requestedModels.push(model);
      return model === FINAL_MODEL
        ? successfulResponse("last model answer")
        : jsonResponse({}, { status: 503 });
    }
  });

  const result = await provider.complete({ messages: [] });

  assert.deepEqual(requestedModels, MODEL_CHAIN);
  assert.deepEqual(result, {
    content: "last model answer",
    model: FINAL_MODEL,
    fallbackUsed: true
  });
});

test("provider chain logs correlated attempts through fallback success", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const { entries, logger } = captureLogger();
  let requestCount = 0;
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY, NVIDIA_MODELS: MODEL_CHAIN.slice(0, 2).join(",") },
    logger,
    createChainId: () => "chain-success",
    fetchImpl: async () => {
      requestCount += 1;
      return requestCount === 1
        ? jsonResponse({}, { status: 503 })
        : successfulResponse("private generated content");
    }
  });

  await provider.complete({ messages: [{ role: "user", content: `private prompt ${API_KEY}` }] });

  const chainEntries = entries.filter((entry) => entry.event.startsWith("provider.chain.") || entry.event.startsWith("provider.attempt."));
  assert.deepEqual(chainEntries.map((entry) => entry.event), [
    "provider.chain.started",
    "provider.attempt.started",
    "provider.attempt.failed",
    "provider.attempt.started",
    "provider.attempt.succeeded",
    "provider.chain.succeeded"
  ]);
  assert.ok(chainEntries.every((entry) => entry.chainId === "chain-success"));
  assert.deepEqual(chainEntries[1], {
    level: "info",
    event: "provider.attempt.started",
    chainId: "chain-success",
    attempt: 1,
    totalAttempts: 2,
    model: PRIMARY_MODEL
  });
  assert.equal(chainEntries[2].code, "PROVIDER_HTTP_ERROR");
  assert.equal(chainEntries[2].status, 503);
  assert.equal(chainEntries[4].attempt, 2);
  assert.equal(chainEntries[5].model, FALLBACK_MODEL);
  assert.equal(chainEntries[5].fallbackUsed, true);
  assert.equal(chainEntries[5].attempts, 2);

  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes(API_KEY), false);
  assert.equal(serialized.includes("private prompt"), false);
  assert.equal(serialized.includes("private generated content"), false);
  assert.equal(serialized.toLowerCase().includes("authorization"), false);
});

test("provider chain logs one terminal failure after every model fails", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const { entries, logger } = captureLogger();
  const models = MODEL_CHAIN.slice(0, 3);
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY, NVIDIA_MODELS: models.join(",") },
    logger,
    createChainId: () => "chain-failure",
    fetchImpl: async () => jsonResponse({}, { status: 503 })
  });

  await assert.rejects(provider.complete({ messages: [] }), /non-success status/);

  const attempts = entries.filter((entry) => entry.event === "provider.attempt.started");
  const failures = entries.filter((entry) => entry.event === "provider.attempt.failed");
  const terminal = entries.filter((entry) => entry.event === "provider.chain.failed");
  assert.deepEqual(attempts.map((entry) => entry.model), models);
  assert.deepEqual(attempts.map((entry) => entry.attempt), [1, 2, 3]);
  assert.equal(failures.length, 3);
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].chainId, "chain-failure");
  assert.equal(terminal[0].attempts, 3);
  assert.equal(terminal[0].code, "PROVIDER_HTTP_ERROR");
});

test("actively aborts a pending primary request at the injected timeout", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const { entries, logger } = captureLogger();
  let requestCount = 0;
  let primaryAborted = false;
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger,
    timeoutMs: 5,
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount > 1) return successfulResponse("fallback after timeout");

      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          primaryAborted = true;
          reject(options.signal.reason);
        }, { once: true });
      });
    }
  });
  const startedAt = Date.now();

  const result = await provider.complete({ messages: [] });

  assert.equal(primaryAborted, true);
  assert.ok(Date.now() - startedAt < 500, "injected timeout should avoid the 30-second default");
  assert.equal(requestCount, 2);
  assert.deepEqual(result, {
    content: "fallback after timeout",
    model: FALLBACK_MODEL,
    fallbackUsed: true
  });
  assert.ok(entries.some((entry) => (
    entry.event === "provider.request.failed"
    && entry.model === PRIMARY_MODEL
    && entry.code === "PROVIDER_TIMEOUT"
  )));
});

test("logs stable provider metadata without prompts, headers, or secrets", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const { entries, logger } = captureLogger();
  let instant = 100;
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger,
    now: () => {
      const current = instant;
      instant += 25;
      return current;
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      return body.model === PRIMARY_MODEL
        ? jsonResponse({}, { status: 502 })
        : successfulResponse("safe answer");
    }
  });

  await provider.complete({ messages: [{ role: "user", content: `prompt ${API_KEY}` }] });

  const requestEntries = entries.filter((entry) => [
    "provider.request.started",
    "provider.request.failed",
    "provider.fallback.started",
    "provider.response.received"
  ].includes(entry.event));
  assert.deepEqual(requestEntries.map(({ event }) => event), [
    "provider.request.started",
    "provider.request.failed",
    "provider.fallback.started",
    "provider.request.started",
    "provider.response.received"
  ]);
  const { chainId, ...fallbackEntry } = requestEntries[2];
  assert.equal(typeof chainId, "string");
  assert.deepEqual(requestEntries[1], {
    level: "warn",
    event: "provider.request.failed",
    model: PRIMARY_MODEL,
    status: 502,
    durationMs: 25,
    contentPresent: false,
    code: "PROVIDER_HTTP_ERROR"
  });
  assert.deepEqual(fallbackEntry, {
    level: "warn",
    event: "provider.fallback.started",
    model: FALLBACK_MODEL,
    primaryModel: PRIMARY_MODEL,
    previousModel: PRIMARY_MODEL,
    code: "PROVIDER_HTTP_ERROR"
  });
  assert.deepEqual(requestEntries[4], {
    level: "info",
    event: "provider.response.received",
    model: FALLBACK_MODEL,
    status: 200,
    durationMs: 25,
    contentPresent: true
  });
  const serializedLogs = JSON.stringify(entries);
  assert.equal(serializedLogs.includes(API_KEY), false);
  assert.equal(serializedLogs.includes("prompt"), false);
  assert.equal(serializedLogs.toLowerCase().includes("authorization"), false);
});

test("logs an explicit empty-response event", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const { entries, logger } = captureLogger();
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger,
    fetchImpl: async (_url, options) => {
      const { model } = JSON.parse(options.body);
      return model === PRIMARY_MODEL ? successfulResponse(" ") : successfulResponse();
    }
  });

  await provider.complete({ messages: [] });

  assert.ok(entries.some((entry) => (
    entry.event === "provider.response.empty"
    && entry.model === PRIMARY_MODEL
    && entry.status === 200
    && entry.contentPresent === false
  )));
});

test("throws the typed fallback error instead of swallowing it", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const provider = createAiProvider({
    env: { NVIDIA_API_KEY: API_KEY },
    logger: silentLogger,
    fetchImpl: async () => jsonResponse({}, { status: 500 })
  });

  await assert.rejects(
    provider.complete({ messages: [] }),
    (error) => error.name === "AiProviderError" && error.code === "PROVIDER_HTTP_ERROR" && error.model === FINAL_MODEL
  );
});

test("reports provider configuration without exposing values", async () => {
  const { createAiProvider } = await import("../src/lib/aiProvider.js");
  const configured = createAiProvider({ env: { NVIDIA_API_KEY: API_KEY } }).status();
  const missing = createAiProvider({ env: {} }).status();

  assert.deepEqual(configured, {
    managedProviderConfigured: true,
    codexBridgeEnabled: false,
    codexBridgeAvailable: false,
    ollamaEnabled: false
  });
  assert.equal(missing.managedProviderConfigured, false);
  assert.equal(JSON.stringify(configured).includes(API_KEY), false);
});

test("constructs the compatibility provider lazily after module import", async (t) => {
  const previousApiKey = process.env.NVIDIA_API_KEY;
  const previousFetch = globalThis.fetch;
  const previousConsoleLog = console.log;
  t.after(() => {
    if (previousApiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch;
    console.log = previousConsoleLog;
  });

  console.log = () => {};
  globalThis.fetch = async () => successfulResponse("captured during import");
  const compatibility = await import(`../src/lib/aiProvider.js?lazy=${Date.now()}`);

  process.env.NVIDIA_API_KEY = API_KEY;
  globalThis.fetch = async () => successfulResponse("configured after import");

  assert.equal(compatibility.aiStatus().managedProviderConfigured, true);
  const result = await compatibility.handleAiRequest("hint", { question: "help" });
  assert.equal(result.status, "ok");
  assert.equal(result.message, "configured after import");
});
