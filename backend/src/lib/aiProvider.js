const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "deepseek-ai/deepseek-v4-pro";
const DEFAULT_FALLBACK_MODEL = "z-ai/glm-5.1";

export function aiStatus() {
  return {
    managedProviderConfigured: Boolean(process.env.NVIDIA_API_KEY),
    codexBridgeEnabled: false,
    codexBridgeAvailable: false,
    ollamaEnabled: false
  };
}

export async function handleAiRequest(kind, body = {}) {
  if (!process.env.NVIDIA_API_KEY) {
    return notConfigured(kind);
  }

  const prompt = buildPrompt(kind, body);
  const primary = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  const fallback = process.env.NVIDIA_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;

  try {
    const content = await callOpenAiCompatible(primary, prompt);
    return normalizeAiResult(kind, content, "managed");
  } catch (primaryError) {
    if (fallback && fallback !== primary) {
      try {
        const content = await callOpenAiCompatible(fallback, prompt);
        return normalizeAiResult(kind, content, "managed");
      } catch {}
    }
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

async function callOpenAiCompatible(model, prompt) {
  const baseUrl = (process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are the Refract tutor. Be concise, practical, and beginner-friendly." },
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Provider returned empty response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
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
