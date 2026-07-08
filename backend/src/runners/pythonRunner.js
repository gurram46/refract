import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseTraceEvents } from "../lib/traceParser.js";
import { resolvePythonCommand } from "../lib/runtime.js";

const MAX_OUTPUT_BYTES = 24_000;
const RUN_TIMEOUT_MS = 5_000;

const PYTHON_HELPERS = `
import json

def event(event_type, **kwargs):
    print("REFRACT_TRACE: " + json.dumps({"type": event_type, **kwargs}), flush=True)

def assert_equal(actual, expected, message=""):
    if actual != expected:
        msg = message or "Expected values to be equal"
        raise AssertionError(f"{msg}: expected {expected}, got {actual}")
`;

export async function runPythonArtifact({ artifact, code = "" }) {
  const python = await resolvePythonCommand();
  if (!python) {
    return {
      success: false,
      stdout: "",
      stderr: "Python runner unavailable. Set PYTHON_BIN or install Python 3 on the backend server.",
      traceEvents: [],
      summary: "Python runner unavailable."
    };
  }

  const tests = artifact.practice?.python?.tests || "";
  const workspace = await mkdtemp(path.join(tmpdir(), "refract-py-"));
  const filePath = path.join(workspace, "artifact.py");
  const source = `${PYTHON_HELPERS}\n${code}\n\n${tests}`;

  try {
    await writeFile(filePath, source, "utf8");
    const result = await runProcess(python, filePath, workspace);
    const parsed = parseTraceEvents(result.stdout);
    const stdout = parsed.stdout;
    const success = result.exitCode === 0 && !result.timedOut;
    return {
      success,
      stdout,
      stderr: result.stderr,
      traceEvents: parsed.events,
      summary: summarizeRun(success, result)
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function runProcess(python, filePath, cwd) {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(python.command, [...python.args, filePath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, RUN_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";
    const truncated = { stdout: false, stderr: false };

    child.stdout.on("data", (chunk) => {
      const next = appendLimited(stdout, chunk.toString());
      stdout = next.value;
      truncated.stdout ||= next.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const next = appendLimited(stderr, chunk.toString());
      stderr = next.value;
      truncated.stderr ||= next.truncated;
    });
    child.on("error", (error) => {
      stderr = appendLimited(stderr, error.message).value;
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut, truncated });
    });
  });
}

function summarizeRun(success, result) {
  if (result.timedOut) return "Python run timed out.";
  if (success) return "All queue tests passed.";
  if (result.stderr) return "Python queue tests failed.";
  return "Python run failed.";
}

function appendLimited(current, addition) {
  if (Buffer.byteLength(current, "utf8") >= MAX_OUTPUT_BYTES) {
    return { value: current, truncated: true };
  }
  const combined = current + addition;
  if (Buffer.byteLength(combined, "utf8") <= MAX_OUTPUT_BYTES) {
    return { value: combined, truncated: false };
  }
  return {
    value: combined.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated: exceeded max size]",
    truncated: true
  };
}
