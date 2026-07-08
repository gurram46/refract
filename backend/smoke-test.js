import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9797;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

const correctQueueCode = `
class PaymentRetryQueue:
    def __init__(self):
        self.items = []

    def enqueue(self, payment_id):
        self.items.append(payment_id)
        event("queue.enqueue", value=payment_id, label=payment_id)

    def dequeue(self):
        if self.is_empty():
            event("queue.empty")
            return None
        payment_id = self.items.pop(0)
        event("queue.dequeue", value=payment_id, label=payment_id)
        print(f"retried {payment_id}")
        print("REFRACT_TRACE: not-json")
        return payment_id

    def peek(self):
        if self.is_empty():
            event("queue.empty")
            return None
        payment_id = self.items[0]
        event("queue.peek", value=payment_id, label=payment_id)
        return payment_id

    def is_empty(self):
        return len(self.items) == 0
`;

const badQueueCode = `
class PaymentRetryQueue:
    def __init__(self):
        self.items = []

    def enqueue(self, payment_id):
        self.items.append(payment_id)

    def dequeue(self):
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0
`;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${message}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${message}`);
  }
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("backend did not become ready");
}

function startServer() {
  return spawn(process.execPath, ["src/server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      REFRACT_BACKEND_PORT: String(PORT),
      REFRACT_BACKEND_DATA_DIR: path.join(__dirname, ".tmp-smoke-data"),
      NVIDIA_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function testHealth() {
  console.log("\nGET /health");
  const { status, body } = await fetchJson("/health");
  assert(status === 200, "returns 200");
  assert(body.ok === true, "ok is true");
  assert(body.service === "refract-backend", "service is refract-backend");
  assert(typeof body.runtimes?.python === "boolean", "reports python runtime availability");
  assert(body.ai?.managedProviderConfigured === false, "reports managed provider not configured without NVIDIA_API_KEY");
  assert(body.ai?.codexBridgeEnabled === false, "reports Codex bridge disabled");
  assert(body.ai?.codexBridgeAvailable === false, "reports Codex bridge unavailable");
}

async function testArtifacts() {
  console.log("\nGET /artifacts");
  const queue = await fetchJson("/artifacts/queue");
  assert(queue.status === 200, "queue returns 200");
  assert(queue.body.schemaVersion === 1, "queue has schemaVersion 1");
  assert(queue.body.id === "queue", "queue id matches");
  assert(queue.body.lenses?.dsa, "queue has dsa lens");
  assert(queue.body.lenses?.system_design, "queue has system_design lens");
  assert(queue.body.lenses?.game_theory, "queue has game_theory lens");

  const missing = await fetchJson("/artifacts/nope");
  assert(missing.status === 404, "missing artifact returns 404");
  assert(missing.body.error === "Artifact not found", "missing artifact returns JSON error");
}

async function runCode(language, code) {
  return fetchJson("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactId: "queue", language, code, studentId: "local-student" })
  });
}

async function testRun() {
  console.log("\nPOST /run");
  const good = await runCode("python", correctQueueCode);
  assert(good.status === 200, "correct Python run returns 200");
  assert(good.body.success === true, "correct Python queue passes");
  assert(good.body.artifactId === "queue", "run response artifactId matches");
  assert(good.body.language === "python", "run response language matches");
  assert(good.body.stdout.includes("retried pay_101"), "normal stdout is preserved");
  assert(Array.isArray(good.body.traceEvents), "traceEvents is an array");
  assert(good.body.traceEvents.some((event) => event.type === "queue.enqueue"), "trace enqueue event parsed");
  assert(good.body.traceEvents.some((event) => event.type === "queue.dequeue"), "trace dequeue event parsed");
  assert(good.body.stdout.includes("Malformed trace ignored"), "malformed trace does not crash and is visible");

  const bad = await runCode("python", badQueueCode);
  assert(bad.status === 200, "bad Python run returns 200");
  assert(bad.body.success === false, "bad Python queue fails");
  assert(typeof bad.body.summary === "string" && bad.body.summary.length > 0, "bad run has summary");

  const unsupported = await runCode("java", "class PaymentRetryQueue {}");
  assert(unsupported.status === 400, "unsupported language returns 400");
  assert(unsupported.body.status === "unsupported_language", "unsupported language status is explicit");
}

async function testAiNotConfigured() {
  console.log("\nPOST /ai/stream/* not configured");
  for (const endpoint of ["explain", "hint", "evaluate"]) {
    const { status, body } = await fetchJson(`/ai/stream/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: "queue", studentId: "local-student", question: "help" })
    });
    assert(status === 200, `${endpoint} returns 200`);
    assert(body.status === "not_configured", `${endpoint} returns not_configured`);
    assert(typeof body.message === "string" && body.message.length > 0, `${endpoint} returns clean message`);
  }
}

async function testProgress() {
  console.log("\nGET/POST /progress");
  const missing = await fetchJson("/progress/local-student");
  assert(missing.status === 200, "missing progress returns 200");
  assert(missing.body.studentId === "local-student", "missing progress studentId matches");
  assert(Array.isArray(missing.body.completedArtifacts), "missing progress has completedArtifacts array");
  assert(missing.body.completedArtifacts.length === 0, "missing progress is empty");
  assert(missing.body.lastArtifactId === null, "missing progress has null lastArtifactId");

  const saved = await fetchJson("/progress/local-student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactId: "queue", language: "python", event: "artifact_completed", timestamp: "2026-07-02T12:00:00.000Z" })
  });
  assert(saved.status === 200, "progress POST returns 200");
  assert(saved.body.completedArtifacts.some((item) => item.artifactId === "queue"), "progress POST stores queue completion");

  const loaded = await fetchJson("/progress/local-student");
  assert(loaded.status === 200, "progress GET after POST returns 200");
  assert(loaded.body.completedArtifacts.some((item) => item.artifactId === "queue"), "progress persists after POST");
}

async function main() {
  await rm(path.join(__dirname, ".tmp-smoke-data"), { recursive: true, force: true });
  const server = startServer();
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer();
    await testHealth();
    await testArtifacts();
    await testRun();
    await testAiNotConfigured();
    await testProgress();
  } catch (error) {
    failed += 1;
    console.log(`\nFATAL: ${error.message}`);
    if (output.trim()) console.log(`\nServer output:\n${output}`);
  } finally {
    server.kill();
    await rm(path.join(__dirname, ".tmp-smoke-data"), { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
